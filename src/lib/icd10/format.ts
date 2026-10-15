// ICD-10-CM code shapes and the answers the code check gives. Safe for the browser;
// the code table itself is server-side (codes.ts).

export type Icd10Hit = { code: string; title: string };

// ok: a full (billable) code. partial: a category with more specific codes under it,
// e.g. N18.3 or a WHO code like J45.9; pick one of `options`. unknown: not a code.
export type Icd10Check =
  | { status: "ok"; code: string; title: string }
  | { status: "partial"; code: string; title: string; options: Icd10Hit[]; more: number }
  | { status: "unknown"; code: string; options: Icd10Hit[]; more: number };

// Letter, two characters, then an optional dot and up to four more (7th characters included).
export const ICD10_SHAPE = /^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/;

// "e119" → "E11.9", " i10 " → "I10", "S93.409a" → "S93.409A". Anything else comes back
// tidied but unchanged, for the check to reject.
export function normalizeIcd10(raw: string): string {
  const s = raw.toUpperCase().replace(/\s+/g, "").replace(/\.$/, "");
  if (!s.includes(".") && /^[A-Z][0-9][0-9A-Z][0-9A-Z]{1,4}$/.test(s)) return `${s.slice(0, 3)}.${s.slice(3)}`;
  return s;
}

// What to tell the person about a code, in one line.
export function icd10Problem(c: Icd10Check): string | null {
  if (c.status === "ok") return null;
  if (c.status === "partial") return `${c.code} isn't a complete ICD-10-CM code (${c.title}). Pick a more specific code.`;
  return `${c.code} isn't an ICD-10-CM code.`;
}
