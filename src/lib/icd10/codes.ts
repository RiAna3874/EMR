// The ICD-10-CM code table (data/icd10cm, CDC/NCHS, April 2026 release of FY2026): checks
// that a code exists and is complete, gives its official description, and searches it by
// code or words. Server only; it reads the table from disk once.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { DIAGNOSES } from "@/lib/visits/diagnoses";
import { normalizeIcd10, type Icd10Check, type Icd10Hit } from "./format";

export const ICD10CM_RELEASE = "ICD-10-CM FY2026 (April 1, 2026 update)";

type Entry = { code: string; billable: boolean; title: string; hay: string };
type Table = { byCode: Map<string, Entry>; all: Entry[]; billable: Entry[] };

let table: Table | null = null;

// Words for search: lower case, letters and digits only, space-separated with a leading space
// so " word" finds word starts.
const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`;

function load(): Table {
  if (table) return table;
  const text = gunzipSync(readFileSync(join(process.cwd(), "data/icd10cm/icd10cm-2026.tsv.gz"))).toString("utf8");
  // The common list's everyday words ("sugar", "jor", "cad") find its codes too.
  const aliases = new Map<string, string>();
  for (const d of DIAGNOSES) aliases.set(d.code, `${aliases.get(d.code) ?? ""} ${(d.keywords ?? []).join(" ")} ${d.value}`);
  const all: Entry[] = [];
  for (const line of text.split("\n")) {
    if (!line) continue;
    const [code, b, title] = line.split("\t");
    all.push({ code, billable: b === "1", title, hay: words(`${title} ${aliases.get(code) ?? ""}`) });
  }
  table = { byCode: new Map(all.map((e) => [e.code, e])), all, billable: all.filter((e) => e.billable) };
  return table;
}

const hit = (e: Entry): Icd10Hit => ({ code: e.code, title: e.title });

// Complete codes under a category, in code order.
function under(t: Table, code: string, limit: number) {
  const found = t.billable.filter((e) => e.code.startsWith(code) && e.code !== code);
  return { options: found.slice(0, limit).map(hit), more: Math.max(0, found.length - limit) };
}

export function checkIcd10(raw: string, limit = 12): Icd10Check {
  const t = load();
  const code = normalizeIcd10(raw);
  const e = t.byCode.get(code);
  if (e?.billable) return { status: "ok", code, title: e.title };
  if (e) return { status: "partial", code, title: e.title, ...under(t, code, limit) };
  // Not a code: offer what's under the nearest real category (e.g. a mistyped last digit).
  for (let n = code.length - 1; n >= 3; n--) {
    const parent = t.byCode.get(code.slice(0, n).replace(/\.$/, ""));
    if (!parent) continue;
    const below = under(t, parent.code, limit);
    if (!parent.billable) return { status: "unknown", code, ...below };
    return { status: "unknown", code, options: [hit(parent), ...below.options].slice(0, limit), more: below.more };
  }
  return { status: "unknown", code, options: [], more: 0 };
}

// The complete code whose official description is exactly this name, if any.
export function codeForTitle(name: string): string | null {
  const n = name.trim().toLowerCase();
  if (!n) return null;
  return load().billable.find((e) => e.title.toLowerCase() === n)?.code ?? null;
}

export const icd10Title = (code: string) => {
  const c = checkIcd10(code, 0);
  return c.status === "unknown" ? null : c.title;
};

// Complete codes only. A query that looks like a code finds codes starting with it;
// anything else matches words (each typed word starts a word in the description or in
// the common list's everyday names), the common list's codes first.
export function searchIcd10(q: string, limit = 20): Icd10Hit[] {
  const t = load();
  const query = q.trim();
  if (query.length < 2) return [];
  if (/^[a-z][0-9]/i.test(query)) {
    const prefix = normalizeIcd10(query).replace(".", "");
    return t.billable
      .filter((e) => e.code.replace(".", "").startsWith(prefix))
      .slice(0, limit)
      .map(hit);
  }
  const terms = words(query).trim().split(" ").filter(Boolean);
  if (!terms.length) return [];
  const common = new Map(DIAGNOSES.map((d, i) => [d.code, i]));
  const lower = query.toLowerCase();
  return t.billable
    .filter((e) => terms.every((w) => e.hay.includes(` ${w}`)))
    .map((e) => {
      const title = e.title.toLowerCase();
      const score = (common.has(e.code) ? 10_000 - common.get(e.code)! : 0) + (title === lower ? 500 : 0) + (title.startsWith(lower) ? 200 : 0) - (common.has(e.code) ? 0 : e.title.length);
      return { e, score };
    })
    .sort((a, b) => b.score - a.score || a.e.code.localeCompare(b.e.code))
    .slice(0, limit)
    .map((x) => hit(x.e));
}
