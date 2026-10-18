// Speech to text for dictation. The browser records a piece of speech (up to a pause) and
// posts it to /api/dictation; the server sends it to the speech engine and returns text.
// Audio is held in memory for that one request and never saved. See docs/DICTATION.md.
import "server-only";
import { readFile } from "node:fs/promises";

export type DictationLanguage = "auto" | "en" | "bn";
export type Provider = "elevenlabs" | "openai";

const DEFAULT_MODEL: Record<Provider, string> = { elevenlabs: "scribe_v2", openai: "gpt-4o-transcribe" };
const LABEL: Record<Provider, string> = { elevenlabs: "ElevenLabs Scribe", openai: "OpenAI" };

// Which engine is set up: MERIDIAN_DICTATION_PROVIDER if given, else whichever key is present.
export function dictationEngine(): { provider: Provider; model: string; label: string } | null {
  const chosen = process.env.MERIDIAN_DICTATION_PROVIDER?.trim().toLowerCase();
  let provider: Provider | null = null;
  if (chosen === "elevenlabs" || chosen === "openai") provider = chosen;
  else if (process.env.ELEVENLABS_API_KEY) provider = "elevenlabs";
  else if (process.env.OPENAI_API_KEY) provider = "openai";
  if (!provider) return null;
  if (provider === "elevenlabs" && !process.env.ELEVENLABS_API_KEY) return null;
  if (provider === "openai" && !process.env.OPENAI_API_KEY) return null;
  return { provider, model: process.env.MERIDIAN_DICTATION_MODEL?.trim() || DEFAULT_MODEL[provider], label: LABEL[provider] };
}

// Dev only: return saved text instead of calling an engine (for working on the screens).
const fixture = () => (process.env.NODE_ENV !== "production" ? process.env.MERIDIAN_DICTATION_FIXTURE : undefined);
export const dictationReady = () => !!(dictationEngine() || fixture());

// Which engine the microphone uses: a paid one when its key is set, else the browser's own
// free speech recognition (audio goes to the browser maker, e.g. Google for Chrome), unless
// MERIDIAN_DICTATION_BROWSER=0 turns that off. null: no microphone.
export function dictationMode(): "server" | "browser" | null {
  if (dictationReady()) return "server";
  return process.env.MERIDIAN_DICTATION_BROWSER === "0" ? null : "browser";
}

export type TranscribeInput = {
  audio: Blob;
  language: DictationLanguage;
  // The words just before the cursor, so a sentence split by a pause reads on.
  before: string;
  terms: string[];
};

export class DictationError extends Error {}

const ISO3: Record<Exclude<DictationLanguage, "auto">, string> = { en: "eng", bn: "ben" };

export async function transcribe(input: TranscribeInput): Promise<{ text: string; language: string | null }> {
  const fx = fixture();
  if (fx) {
    const text = fx.endsWith(".txt") ? (await readFile(fx, "utf8")).trim() : fx;
    return { text, language: input.language === "auto" ? null : input.language };
  }
  const engine = dictationEngine();
  if (!engine) throw new DictationError("Dictation isn't set up on this server. An administrator adds a speech key (docs/DICTATION.md).");
  return engine.provider === "elevenlabs" ? elevenLabs(engine.model, input) : openAi(engine.model, input);
}

const filename = (audio: Blob) => (audio.type.includes("mp4") ? "speech.mp4" : audio.type.includes("ogg") ? "speech.ogg" : "speech.webm");

async function post(url: string, init: RequestInit, who: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(60_000) });
  } catch (e) {
    console.error(`Dictation: couldn't reach ${who}`, e);
    throw new DictationError(`Couldn't reach ${who}. Check the server's internet connection and try again.`);
  }
  if (res.ok) return res;
  const body = (await res.text()).slice(0, 300);
  console.error(`Dictation: ${who} answered ${res.status}: ${body}`);
  if (res.status === 401 || res.status === 403) throw new DictationError(`The ${who} key was refused. An administrator should check it.`);
  if (res.status === 429) throw new DictationError(`${who} is busy or the account is out of credit. Try again in a minute.`);
  throw new DictationError(`${who} couldn't transcribe that (error ${res.status}). Try again.`);
}

async function elevenLabs(model: string, { audio, language, terms }: TranscribeInput) {
  const form = new FormData();
  form.set("model_id", model);
  form.set("file", audio, filename(audio));
  if (language !== "auto") form.set("language_code", ISO3[language]);
  form.set("tag_audio_events", "false");
  // Drops "um", false starts and repeats.
  if (model !== "scribe_v1") form.set("no_verbatim", "true");
  for (const t of terms) form.append("keyterms", t);
  const res = await post(
    "https://api.elevenlabs.io/v1/speech-to-text",
    { method: "POST", headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! }, body: form },
    "ElevenLabs",
  );
  const json = (await res.json()) as { text?: string; language_code?: string };
  return { text: (json.text ?? "").trim(), language: json.language_code ?? null };
}

async function openAi(model: string, { audio, language, before, terms }: TranscribeInput) {
  const form = new FormData();
  form.set("model", model);
  form.set("file", audio, filename(audio));
  if (language !== "auto") form.set("language", language);
  form.set("response_format", "json");
  // The prompt steers spelling and style; it is not read back as text.
  const prompt = [
    "A doctor in Bangladesh dictating clinical notes, in English, Bangla or both. Medicine and test names are usually said in English.",
    `Vocabulary: ${terms.join(", ")}.`,
    before ? `Text so far: ${before}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  form.set("prompt", prompt.slice(0, 3000));
  const res = await post(
    "https://api.openai.com/v1/audio/transcriptions",
    { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form },
    "OpenAI",
  );
  const json = (await res.json()) as { text?: string };
  return { text: (json.text ?? "").trim(), language: language === "auto" ? null : language };
}
