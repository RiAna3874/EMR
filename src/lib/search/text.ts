// Chart search, the matching half. Pure: words in, scored hits out, so it runs
// in tests and on the server alike (src/lib/search/chart.ts gathers the chart).
//
// How a query matches:
//  - every word typed must be found somewhere in the item (in any field);
//  - a word matches a whole word, the start of a word ("hemo" finds "hemoglobin"),
//    or, for longer words, a word one typo away ("hemoglobn", "creatnine");
//  - clinical shorthand and local names are understood both ways ("a1c" and
//    "hba1c", "bp" and "blood pressure", "sgpt" and "ALT", "usg" and "ultrasound");
//  - British and American spellings are the same word (haemoglobin, oedema);
//  - "quoted words" must appear together, in that order.

import { SYNONYMS, EXPANSIONS } from "./vocabulary";

// ---------- words ----------

export type Word = { w: string; start: number; end: number };

// Letters (any script, Bangla included) and digits; "7.2" and "E11.9" stay one word.
const WORD = /[\p{L}\p{M}\p{N}]+(?:[.,]\p{N}+)*/gu;

// One spelling for the same word, applied to both the query and the chart.
export function canon(word: string): string {
  let w = word.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  if (!/[a-z]/.test(w)) return w;
  w = w
    .replace(/haem/g, "hem")
    .replace(/anaem/g, "anem")
    .replace(/^oe(?=[a-z]{3})/, "e")
    .replace(/paed/g, "ped")
    .replace(/aemia/g, "emia")
    .replace(/oea/g, "ea") // diarrhoea, gonorrhoea
    .replace(/isation/g, "ization")
    .replace(/ise([ds]?)$/, "ize$1")
    .replace(/([^aeiou])our$/, "$1or") // tumour, colour
    .replace(/litre/g, "liter")
    .replace(/fibre/g, "fiber")
    .replace(/centre/g, "center");
  return w;
}

export function words(text: string): Word[] {
  const out: Word[] = [];
  for (const m of text.matchAll(WORD)) out.push({ w: canon(m[0]), start: m.index!, end: m.index! + m[0].length });
  return out;
}

// ---------- the query ----------

// One thing that must be found. A term is satisfied when any of its variants is;
// a variant is a run of words that must appear together ("blood pressure").
export type Term = { text: string; variants: Variant[] };
type Variant = { words: string[]; loose: boolean }; // loose: also prefix and typo matches

let synonymIndex: Map<string, string[][]> | undefined;

function buildIndex() {
  const index = new Map<string, string[][]>();
  const add = (key: string, phrases: string[]) => {
    const k = phraseKey(key);
    const list = index.get(k) ?? [];
    for (const p of phrases) {
      const ws = words(p).map((x) => x.w);
      if (ws.length && !list.some((l) => l.join(" ") === ws.join(" "))) list.push(ws);
    }
    index.set(k, list);
  };
  for (const group of SYNONYMS) for (const key of group) add(key, group);
  for (const [key, extra] of Object.entries(EXPANSIONS)) add(key, [key, ...extra]);
  return index;
}

const phraseKey = (s: string) => words(s).map((x) => x.w).join(" ");
const MAX_PHRASE = 4;

export function parseQuery(q: string): Term[] {
  const terms: Term[] = [];
  // "Quoted words" are one exact phrase.
  const rest = q.replace(/"([^"]*)"?/g, (_, phrase: string) => {
    const ws = words(phrase).map((x) => x.w);
    if (ws.length) terms.push({ text: phrase.trim(), variants: [{ words: ws, loose: false }] });
    return " ";
  });
  const ws = words(rest);
  for (let i = 0; i < ws.length; ) {
    // The longest run of words that is a known phrase or abbreviation becomes one term.
    let taken = 0;
    for (let n = Math.min(MAX_PHRASE, ws.length - i); n >= 1; n--) {
      const key = ws.slice(i, i + n).map((x) => x.w).join(" ");
      const known = (synonymIndex ??= buildIndex()).get(key);
      if (!known) continue;
      const typed = ws.slice(i, i + n).map((x) => x.w);
      const variants: Variant[] = [{ words: typed, loose: true }];
      for (const v of known) if (v.join(" ") !== key) variants.push({ words: v, loose: v.join("").length > 3 });
      terms.push({ text: rest.slice(ws[i].start, ws[i + n - 1].end), variants });
      taken = n;
      break;
    }
    if (!taken) {
      terms.push({ text: rest.slice(ws[i].start, ws[i].end), variants: [{ words: [ws[i].w], loose: true }] });
      taken = 1;
    }
    i += taken;
  }
  return terms;
}

// ---------- matching one word ----------

// 3 the same word, 2 the start of a word, 1 a typo away, 0 no match.
export function wordMatch(chartWord: string, queryWord: string, loose: boolean): number {
  if (chartWord === queryWord) return 3;
  if (!loose) return 0;
  const numeric = /^\d/.test(queryWord);
  if (queryWord.length >= 2 && chartWord.startsWith(queryWord) && !(numeric && /^[\d.,]/.test(chartWord.slice(queryWord.length)))) return 2;
  if (numeric || queryWord.length < 5) return 0;
  const allowed = queryWord.length >= 9 ? 2 : 1;
  if (Math.abs(chartWord.length - queryWord.length) <= allowed && withinEdits(chartWord, queryWord, allowed)) return 1;
  // A typo in a word still being typed: "hemoglo" for "hemoglobin" is a prefix, "hemogl" + typo too.
  if (chartWord.length > queryWord.length && withinEdits(chartWord.slice(0, queryWord.length), queryWord, allowed)) return 1;
  return 0;
}

// Damerau-Levenshtein distance <= max, bailing out early.
export function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) {
    rows[i] = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      if (i === 0) {
        rows[0][j] = j;
        continue;
      }
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2][j - 2] + 1);
      rows[i][j] = d;
      best = Math.min(best, d);
    }
    if (i > 0 && best > max) return false;
  }
  return rows[a.length][b.length] <= max;
}

// ---------- documents ----------

export type Field = { label: string; text: string; weight: number; snippet?: boolean };
export type Doc = { key: string; fields: Field[]; at?: Date | null; boost?: number };

export type Snippet = { field: string; text: string; marks: [number, number][] };
export type Match = {
  key: string;
  score: number;
  matched: number; // how many of the query's terms were found
  snippet: Snippet | null;
  terms: string[]; // the chart's own words that matched, for highlighting at the source
};

type Indexed = { doc: Doc; fields: { field: Field; words: Word[] }[] };

const SNIPPET_BEFORE = 70;
const SNIPPET_LENGTH = 220;

// Matches every document against the query. Full matches (every term found)
// come first by score; when nothing matches fully, the closest partial matches
// are returned with `matched` below the term count.
export function searchDocs(query: string | Term[], docs: Doc[], now = new Date()): { terms: Term[]; matches: Match[]; partial: boolean } {
  const terms = typeof query === "string" ? parseQuery(query) : query;
  if (!terms.length) return { terms, matches: [], partial: false };
  const indexed: Indexed[] = docs.map((doc) => ({ doc, fields: doc.fields.filter((f) => f.text).map((field) => ({ field, words: words(field.text) })) }));

  // Each distinct chart word is compared with each query word once.
  const cache = new Map<string, number>();
  const score = (chartWord: string, qw: string, loose: boolean) => {
    const k = `${loose ? 1 : 0}\u0000${qw}\u0000${chartWord}`;
    let s = cache.get(k);
    if (s === undefined) cache.set(k, (s = wordMatch(chartWord, qw, loose)));
    return s;
  };

  const full: Match[] = [];
  const partial: Match[] = [];
  for (const { doc, fields } of indexed) {
    let total = 0;
    let matched = 0;
    const hits = new Map<Field, [number, number][]>();
    const terms_: string[] = [];
    for (const term of terms) {
      let best = 0;
      for (const { field, words: ws } of fields) {
        for (const v of term.variants) {
          const spans: [number, number][] = [];
          let vBest = 0;
          for (let i = 0; i + v.words.length <= ws.length; i++) {
            let s = 3;
            for (let k = 0; k < v.words.length && s; k++) s = Math.min(s, score(ws[i + k].w, v.words[k], v.loose));
            if (!s) continue;
            vBest = Math.max(vBest, s);
            spans.push([ws[i].start, ws[i + v.words.length - 1].end]);
          }
          if (!vBest) continue;
          // An abbreviation's expansion counts nearly as much as the word typed.
          const termScore = vBest * field.weight * (v === term.variants[0] ? 1 : 0.9) + Math.min(spans.length - 1, 4) * 0.15 * field.weight;
          if (termScore > best) best = termScore;
          hits.set(field, [...(hits.get(field) ?? []), ...spans]);
          for (const [a, b] of spans) terms_.push(field.text.slice(a, b));
        }
      }
      if (best) {
        matched++;
        total += best;
      }
    }
    if (!matched) continue;
    const recency = doc.at ? Math.min(2, Math.max(0, 2 - (now.getTime() - doc.at.getTime()) / (365 * 86_400_000))) : 0;
    const m: Match = {
      key: doc.key,
      score: total + recency + (doc.boost ?? 0),
      matched,
      snippet: makeSnippet(hits),
      terms: [...new Set(terms_.map((t) => t.toLowerCase()))].slice(0, 12),
    };
    (matched === terms.length ? full : partial).push(m);
  }
  const byScore = (a: Match, b: Match) => b.matched - a.matched || b.score - a.score;
  if (full.length || terms.length === 1) return { terms, matches: full.sort(byScore), partial: false };
  return { terms, matches: partial.sort(byScore), partial: true };
}

// The passage with the most matches, preferring free-text fields (a note's body over its title).
function makeSnippet(hits: Map<Field, [number, number][]>): Snippet | null {
  let best: { field: Field; spans: [number, number][] } | null = null;
  for (const [field, spans] of hits) {
    if (!best) best = { field, spans };
    else if (!!field.snippet !== !!best.field.snippet) {
      if (field.snippet) best = { field, spans };
    } else if (spans.length > best.spans.length) best = { field, spans };
  }
  if (!best || !best.field.snippet) return null;
  const text = best.field.text;
  const spans = [...best.spans].sort((a, b) => a[0] - b[0]);
  // Start the window where it covers the most matches.
  let start = 0;
  let most = -1;
  for (const [a] of spans) {
    const s = Math.max(0, a - SNIPPET_BEFORE);
    const n = spans.filter(([x, y]) => x >= s && y <= s + SNIPPET_LENGTH).length;
    if (n > most) {
      most = n;
      start = s;
    }
  }
  // Begin and end on word boundaries.
  if (start > 0) {
    const space = text.indexOf(" ", start);
    if (space !== -1 && space < spans[0][0]) start = space + 1;
  }
  let end = Math.min(text.length, start + SNIPPET_LENGTH);
  if (end < text.length) {
    const space = text.lastIndexOf(" ", end);
    if (space > start + 40) end = space;
  }
  const raw = text.slice(start, end);
  const lead = start > 0 ? "…" : "";
  const out = (lead + raw + (end < text.length ? "…" : "")).replace(/\s+/g, " ");
  // Re-find the marks in the whitespace-collapsed text.
  const marks: [number, number][] = [];
  const collapsedIndex = (i: number) => lead.length + text.slice(start, i).replace(/\s+/g, " ").length;
  for (const [a, b] of spans) {
    if (a < start || b > end) continue;
    const ca = collapsedIndex(a);
    const cb = ca + text.slice(a, b).replace(/\s+/g, " ").length;
    if (!marks.length || ca >= marks[marks.length - 1][1]) marks.push([ca, cb]);
  }
  return { field: best.field.label, text: out, marks };
}
