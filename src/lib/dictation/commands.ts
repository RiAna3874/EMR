// Spoken commands in dictation, in English and Bangla: "new line", "full stop",
// "নতুন লাইন", "দাঁড়ি". Applied to each transcribed piece before it's typed in.
// Pure: shared by the server route and tests.
//
// "period" is left out on purpose: in a clinic it's usually the menstrual period.

type Command = { words: string[]; text: string; bn?: string };

const COMMANDS: Command[] = [
  { words: ["new paragraph", "next paragraph", "নতুন অনুচ্ছেদ", "নতুন প্যারা", "নতুন প্যারাগ্রাফ"], text: "\n\n" },
  { words: ["new line", "next line", "নতুন লাইন", "পরের লাইন", "নিউ লাইন"], text: "\n" },
  { words: ["full stop", "ফুল স্টপ", "দাঁড়ি", "দাড়ি"], text: ".", bn: "।" },
  { words: ["comma", "কমা"], text: "," },
  { words: ["question mark", "প্রশ্নবোধক চিহ্ন", "প্রশ্নচিহ্ন"], text: "?" },
  { words: ["colon", "কোলন"], text: ":" },
  { words: ["semicolon", "সেমিকোলন"], text: ";" },
  { words: ["open bracket", "ব্র্যাকেট শুরু"], text: " (" },
  { words: ["close bracket", "ব্র্যাকেট শেষ"], text: ")" },
];

// What a piece of dictation that is only "scratch that" asks for: remove the last piece typed.
const UNDO = ["scratch that", "delete that", "undo that", "মুছে ফেলো", "মুছে দাও", "বাদ দাও"];

const BANGLA = /[ঀ-৿]/;
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Word edges that work for Bangla too (\b only knows ASCII letters).
const edge = "(?<![\\p{L}\\p{M}\\p{N}])";
const edgeEnd = "(?![\\p{L}\\p{M}\\p{N}])";

export const isUndo = (raw: string) => UNDO.includes(raw.trim().toLowerCase().replace(/[.,!?।\s]+$/u, ""));

export function applyCommands(raw: string): string {
  let text = raw;
  for (const c of COMMANDS) {
    for (const w of c.words) {
      // Engines often add their own punctuation around a command ("New line." / ", comma,").
      const re = new RegExp(`[\\s,]*${edge}${escape(w)}${edgeEnd}[,.।!]?`, "giu");
      text = text.replace(re, (_m, offset: number, whole: string) => {
        const before = whole.slice(Math.max(0, offset - 40), offset);
        const out = c.bn && BANGLA.test(before) ? c.bn : c.text;
        // Mark a spoken sentence end so the next word gets its capital.
        return out === "." || out === "?" ? `${out}\u0000` : out;
      });
    }
  }
  text = text.replace(/\u0000[ \t]*([a-z])/g, (_m, ch: string) => ` ${ch.toUpperCase()}`).replace(/\u0000/g, "");
  return tidy(text);
}

// Spacing after the commands: no space before punctuation, one after, none around line breaks,
// and a capital letter to start the text and each line.
export function tidy(text: string): string {
  return text
    .replace(/[ \t]+([,.;:?!।)])/g, "$1")
    .replace(/([.,।])[.,।]+/g, "$1")
    .replace(/([,;:?!।])(?=[^\s\d)\n])/gu, "$1 ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/(^|\n)([a-z])/g, (_m, p: string, c: string) => p + c.toUpperCase())
    .replace(/^[ \t]+|[ \t]+$/g, "");
}

// How a new piece joins the text already in the box: a space between words, none after a
// line break or before punctuation, and a capital after a sentence ends.
export function joinPiece(before: string, piece: string): string {
  if (!piece) return piece;
  let out = piece;
  const last = before.slice(-1);
  const sentenceStart = !before.trim() || /[.?!।]\s*$/.test(before) || /\n\s*$/.test(before);
  if (sentenceStart) out = out.replace(/^[a-z]/, (c) => c.toUpperCase());
  else if (/^[A-Z][a-z]/.test(out) && !/^(I|I'm|I've)\b/.test(out) && !/^[A-Z][a-z]+[A-Z]/.test(out)) {
    // The engine capitalizes each piece as if it began a sentence; mid-sentence it doesn't.
    const word = out.match(/^[A-Za-z]+/)?.[0] ?? "";
    if (COMMON_WORDS.has(word.toLowerCase())) out = out[0].toLowerCase() + out.slice(1);
  }
  if (!before || /\s$/.test(before) || /^[\n,.;:?!।)]/.test(out) || last === "(") return out;
  return ` ${out}`;
}

// Ordinary words lowercased when an engine capitalizes them mid-sentence. Names, drugs and
// abbreviations keep their capitals.
const COMMON_WORDS = new Set(
  "and but or so then the a an with without for to of in on at by from no not is was are were has had have he she they his her their patient pain blood which who that this these there also since after before because if when while".split(" "),
);
