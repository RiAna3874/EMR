// An optional second pass by Claude over each dictated piece: fixes misheard medicine and
// test names, numbers and units, and punctuation, without changing what was said.
// Off unless MERIDIAN_DICTATION_POLISH=1 and the Claude key is set (it costs per pause).
// Applies to the paid engines only. Any failure falls back to the engine's own text.
// MERIDIAN_DICTATION_POLISH_MODEL picks another Claude model (e.g. claude-haiku-5-5, much cheaper).
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { EXTRACTION_MODEL } from "@/lib/labs/extract";

const Polished = z.object({ text: z.string().describe("The corrected dictation") });

const SYSTEM = `You correct speech-recognition output for a doctor's clinical dictation in a Bangladeshi clinic. The doctor speaks English, Bangla, or a mix of both.

Rules:
- Fix only recognition errors: misheard medicine names (generic or Bangladeshi brand), test names, medical terms, numbers, doses and units. Use the vocabulary given when a word sounds like one of its entries.
- Write medicine names, test names, doses, units and medical abbreviations in English letters, as Bangladeshi prescriptions do, even inside a Bangla sentence (প্যারাসিটামল → Paracetamol, এইচবিএওয়ানসি → HbA1c). Keep everything else in the language and script it was spoken in; never translate.
- Write numbers as digits with standard units (five hundred milligram → 500 mg; পাঁচশো মিলিগ্রাম → 500 mg). Write dosing schedules the Bangladeshi way when said that way (one plus zero plus one → 1+0+1).
- Add sentence punctuation. Use "।" to end Bangla sentences and "." for English ones. Keep the line breaks exactly as given.
- Never add, remove or reorder clinical content. Never add a diagnosis, dose, finding or word the doctor didn't say. If unsure about a word, leave it as it is.
- Return only the corrected dictation.`;

export const polishEnabled = () => process.env.MERIDIAN_DICTATION_POLISH === "1" && !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

export async function polish(text: string, opts: { terms: string[]; before: string }): Promise<string> {
  if (!polishEnabled() || !text.trim()) return text;
  try {
    const client = new Anthropic({ maxRetries: 1, timeout: 20_000 });
    const response = await client.beta.messages.parse({
      model: process.env.MERIDIAN_DICTATION_POLISH_MODEL?.trim() || EXTRACTION_MODEL,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(Polished) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Vocabulary: ${opts.terms.join(", ")}\n\nText already in the note (for context only, don't return it):\n${opts.before.slice(-300) || "(none)"}\n\nDictation to correct:\n${text}`,
        },
      ],
    });
    if (response.stop_reason !== "end_turn" || !response.parsed_output) return text;
    const out = response.parsed_output.text.trim();
    return looksLikeSameDictation(text, out) ? out : text;
  } catch (e) {
    console.error("Dictation: the Claude pass failed; using the engine's text", e instanceof Error ? e.message : e);
    return text;
  }
}

// A guard against the second pass dropping or inventing content: the length must stay close.
export function looksLikeSameDictation(raw: string, out: string): boolean {
  if (!out) return false;
  const a = raw.replace(/\s+/g, "").length;
  const b = out.replace(/\s+/g, "").length;
  // Bangla words rewritten in English letters change length a lot for short pieces; allow room.
  return b >= a * 0.5 - 4 && b <= a * 1.6 + 12;
}
