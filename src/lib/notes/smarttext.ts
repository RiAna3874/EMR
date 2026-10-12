// Note "smart text": the shorthand clinicians type and the markers that still
// need attention before a note can be signed. Pure, so it runs in the editor
// and on the server alike.
//
//   .name          phrase: expands to saved text (system library or the user's own)
//   @NAME@         chart link: expands to live chart data (vitals, meds, problems...)
//   {Label:a|b|c}  pick list: choose one option
//   {Label::a|b|c} pick list: choose any number of options
//   ***            blank: free text still to be written

export type Phrase = { name: string; description: string; body: string; mine?: boolean };

export type ExpandContext = {
  phrases: Record<string, Pick<Phrase, "body">>;
  links: Record<string, string>;
};

export type Marker =
  | { kind: "blank"; start: number; end: number }
  | { kind: "pick"; start: number; end: number; label: string; options: string[]; multi: boolean };

const PICK = /\{([^{}:\n|]+?)(::?)([^{}\n]*\|[^{}\n]*)\}/g;
const BLANK = /\*\*\*/g;
const LINK = /@([A-Z][A-Z0-9_]*)@/g;
const PHRASE = /(^|[\s(])\.([a-z][a-z0-9_]*)(?=$|[\s.,;:)])/gi;

// Every unresolved blank and pick list, in document order.
export function findMarkers(text: string): Marker[] {
  const out: Marker[] = [];
  for (const m of text.matchAll(PICK)) {
    out.push({
      kind: "pick",
      start: m.index,
      end: m.index + m[0].length,
      label: m[1].trim(),
      multi: m[2] === "::",
      options: m[3].split("|").map((o) => o.trim()).filter(Boolean),
    });
  }
  for (const m of text.matchAll(BLANK)) {
    // A blank inside a pick list's options isn't a blank of its own.
    if (!out.some((p) => m.index >= p.start && m.index < p.end)) out.push({ kind: "blank", start: m.index, end: m.index + 3 });
  }
  return out.sort((a, b) => a.start - b.start);
}

export const unresolvedCount = (text: string) => findMarkers(text).length;

// The marker after (or, going back, before) a caret position, wrapping around.
export function nextMarker(text: string, from: number, back = false): Marker | null {
  const all = findMarkers(text);
  if (!all.length) return null;
  if (back) return [...all].reverse().find((m) => m.end < from) ?? all[all.length - 1];
  return all.find((m) => m.start >= from) ?? all[0];
}

export const markerAt = (text: string, pos: number) => findMarkers(text).find((m) => pos >= m.start && pos <= m.end) ?? null;

// Expands phrases and chart links, recursively (phrases may contain both), up to a
// few levels so a phrase that refers to itself can't loop forever. Unknown names
// are left as typed.
export function expand(text: string, ctx: ExpandContext, depth = 0): string {
  if (depth > 4) return text;
  let changed = false;
  let out = text.replace(LINK, (whole, name: string) => {
    const v = ctx.links[name];
    if (v === undefined) return whole;
    changed = true;
    return v;
  });
  out = out.replace(PHRASE, (whole, lead: string, name: string) => {
    const p = ctx.phrases[name.toLowerCase()];
    if (!p) return whole;
    changed = true;
    return lead + p.body;
  });
  return changed ? expand(out, ctx, depth + 1) : out;
}

// The text a pick list resolves to once options are chosen.
export function resolvePick(m: Extract<Marker, { kind: "pick" }>, chosen: number[]) {
  const picked = chosen
    .filter((i) => i >= 0 && i < m.options.length)
    .sort((a, b) => a - b)
    .map((i) => m.options[i]);
  if (picked.length <= 2) return picked.join(" and ");
  return `${picked.slice(0, -1).join(", ")} and ${picked[picked.length - 1]}`;
}

// Splits text into plain runs and marker runs, for highlighting in the editor.
export function segments(text: string): { text: string; marker?: Marker }[] {
  const out: { text: string; marker?: Marker }[] = [];
  let at = 0;
  for (const m of findMarkers(text)) {
    if (m.start > at) out.push({ text: text.slice(at, m.start) });
    out.push({ text: text.slice(m.start, m.end), marker: m });
    at = m.end;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

// What a sign attempt must refuse, phrased for the person signing.
export function signBlocker(text: string): string | null {
  const markers = findMarkers(text);
  if (!text.trim()) return "The note is empty.";
  if (!markers.length) return null;
  const blanks = markers.filter((m) => m.kind === "blank").length;
  const picks = markers.length - blanks;
  const parts = [blanks && `${blanks} blank${blanks === 1 ? "" : "s"} (***)`, picks && `${picks} pick list${picks === 1 ? "" : "s"}`].filter(Boolean);
  return `Finish ${parts.join(" and ")} before signing.`;
}

// Phrase names are what follows the dot: lowercase letters, digits and underscores.
export const normalizePhraseName = (s: string) =>
  s
    .trim()
    .replace(/^\./, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");

export const isValidPhraseName = (s: string) => /^[a-z][a-z0-9_]{1,30}$/.test(s);

// The assessment and plan block written for a problem in an earlier note: the
// numbered or "#" line naming it plus the lines under it, up to the next problem
// or a blank line. Matches on the ICD-10 code or the problem's name.
export function findProblemPlan(body: string, problem: { display: string; code: string }): string | null {
  const lines = body.split("\n");
  const header = /^\s*(?:\d+[.)]|#)\s*/;
  const name = problem.display.toLowerCase();
  const start = lines.findIndex((l) => header.test(l) && (l.includes(`(${problem.code})`) || l.toLowerCase().includes(name)));
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && lines[end].trim() && !header.test(lines[end])) end++;
  return lines
    .slice(start, end)
    .map((l, i) => (i === 0 ? l.replace(header, "") : l))
    .join("\n")
    .trim();
}

// A fresh assessment and plan block for one problem.
export const problemBlock = (p: { display: string; code: string }, n?: number) =>
  `${n ? `${n}.` : "#"} ${p.display} (${p.code})\nAssessment: ***\nPlan: ***`;
