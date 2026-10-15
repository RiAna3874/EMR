// Generic (ingredient) names for the whole world, so any medicine can be found by its
// generic name even when no Bangladeshi brand of it is registered:
// - RxNorm ingredients from the US National Library of Medicine (free, public), and
// - Wikidata medicines (CC0): their international (INN) and British names, other
//   names, Bangla names and WHO ATC codes, joined to RxNorm by RxCUI or by name.
// ATC codes are named from RxNorm's copy of the ATC classes, so a search for
// "macrolide" or "ace inhibitor" finds the generics in that class.
//
// A prescription for a generic carries its name in its code,
// "RX:GENERIC:<id>:<name>", like off-list medications, so it reads back anywhere
// without the table. Safety checks find the ingredient by name.

import type { Product } from "./formulary";

export const RXNORM_INGREDIENTS_URL = "https://rxnav.nlm.nih.gov/REST/allconcepts.json?tty=IN";
export const ATC_CLASSES_URL = "https://rxnav.nlm.nih.gov/REST/rxclass/allClasses.json?classTypes=ATC1-4";
export const WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql";

// Every Wikidata item with an ATC code: its English and Bangla labels, RxCUI and other names.
export const WIKIDATA_QUERY = `SELECT ?item ?en ?bn ?rxcui (GROUP_CONCAT(DISTINCT ?atc; separator="|") AS ?atcs) (GROUP_CONCAT(DISTINCT ?alias; separator="|") AS ?aliases) WHERE {
  ?item wdt:P267 ?atc .
  ?item rdfs:label ?en . FILTER(LANG(?en) = "en")
  OPTIONAL { ?item wdt:P3345 ?rxcui }
  OPTIONAL { ?item rdfs:label ?bn . FILTER(LANG(?bn) = "bn") }
  OPTIONAL { ?item skos:altLabel ?alias . FILTER(LANG(?alias) = "en") }
} GROUP BY ?item ?en ?bn ?rxcui`;

export type RxIngredient = { rxcui: string; name: string };
export type AtcClass = { code: string; name: string };
export type WikidataMedicine = { qid: string; en: string; bn: string; rxcui: string; atcs: string[]; aliases: string[] };

export type GenericRow = {
  id: string;
  name: string;
  otherNames: string;
  bangla: string;
  atc: string;
  classes: string;
  rxcui: string | null;
  wikidata: string | null;
  search: string;
};

// A search result, for the prescription and outside-medication pickers.
export type GenericHit = { code: string; display: string; name: string; otherNames: string; bangla: string; classes: string };

const clean = (s: unknown) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");

export function parseRxIngredients(body: unknown): RxIngredient[] {
  const list = (body as { minConceptGroup?: { minConcept?: { rxcui?: string; name?: string; tty?: string }[] } })?.minConceptGroup?.minConcept;
  if (!Array.isArray(list)) throw new Error("RxNorm didn't send a list of ingredients");
  return list.filter((c) => c.tty === "IN" && clean(c.rxcui) && clean(c.name)).map((c) => ({ rxcui: clean(c.rxcui), name: clean(c.name) }));
}

export function parseAtcClasses(body: unknown): AtcClass[] {
  const list = (body as { rxclassMinConceptList?: { rxclassMinConcept?: { classId?: string; className?: string }[] } })?.rxclassMinConceptList?.rxclassMinConcept;
  if (!Array.isArray(list)) throw new Error("RxNorm didn't send the ATC classes");
  return list.filter((c) => /^[A-Z]\d\d[A-Z]{0,2}$/.test(clean(c.classId)) && clean(c.className)).map((c) => ({ code: clean(c.classId), name: clean(c.className) }));
}

export function parseWikidata(body: unknown): WikidataMedicine[] {
  const rows = (body as { results?: { bindings?: Record<string, { value?: string }>[] } })?.results?.bindings;
  if (!Array.isArray(rows)) throw new Error("Wikidata didn't send a list of medicines");
  // An item with two RxCUIs comes back twice; merge them.
  const byQid = new Map<string, WikidataMedicine>();
  for (const r of rows) {
    const qid = clean(r.item?.value).replace(/^.*\//, "");
    const en = clean(r.en?.value);
    if (!/^Q\d+$/.test(qid) || !en) continue;
    const prev = byQid.get(qid);
    const atcs = clean(r.atcs?.value).split("|").map(clean).filter((a) => /^[A-Z]\d\d[A-Z]{2}\d\d$/.test(a));
    const aliases = clean(r.aliases?.value).split("|").map(clean).filter(Boolean);
    if (prev) {
      prev.atcs = [...new Set([...prev.atcs, ...atcs])];
      prev.aliases = [...new Set([...prev.aliases, ...aliases])];
      prev.rxcui ||= clean(r.rxcui?.value);
    } else {
      byQid.set(qid, { qid, en, bn: clean(r.bn?.value), rxcui: clean(r.rxcui?.value), atcs, aliases });
    }
  }
  return [...byQid.values()];
}

// "ACE INHIBITORS, PLAIN" → "ACE inhibitors, plain": the class names come in capitals.
const ACRONYMS = new Set(["ace", "hmg", "hiv", "dpp", "sglt2", "glp", "h2", "tnf", "cns", "dna", "rna", "cox", "ii", "iii", "b12", "ppi", "maoi"]);
export const className = (s: string) =>
  s
    .toLowerCase()
    .split(/([\s\-,/()]+)/)
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w))
    .join("")
    .replace(/^./, (c) => c.toUpperCase());

// Wikidata's English label is the international name ("paracetamol"); keep RxNorm's US
// name as another name. Labels that are sentences or brand-like are skipped as names.
const looksLikeName = (s: string) => s.length >= 3 && s.length <= 80 && !/[®™]/.test(s) && !/^\d/.test(s);

export function mergeGenerics(rx: RxIngredient[], wd: WikidataMedicine[], atc: AtcClass[]): GenericRow[] {
  const atcName = new Map(atc.map((a) => [a.code, className(a.name)]));
  const rxByCui = new Map(rx.map((r) => [r.rxcui, r]));
  const rxByName = new Map(rx.map((r) => [r.name.toLowerCase(), r]));
  const usedRx = new Set<string>();
  const rows: GenericRow[] = [];

  for (const w of wd) {
    if (!looksLikeName(w.en)) continue;
    const names = [w.en, ...w.aliases].filter(looksLikeName);
    const r = (w.rxcui && rxByCui.get(w.rxcui)) || names.map((n) => rxByName.get(n.toLowerCase())).find(Boolean);
    if (r && usedRx.has(r.rxcui)) continue; // two items for one ingredient: the first wins
    if (r) usedRx.add(r.rxcui);
    const name = w.en.charAt(0).toUpperCase() + w.en.slice(1);
    const others = [...new Set([...(r && r.name.toLowerCase() !== w.en.toLowerCase() ? [r.name] : []), ...w.aliases.filter(looksLikeName)])]
      .filter((n) => n.toLowerCase() !== w.en.toLowerCase())
      .slice(0, 12);
    // Level 4 (chemical subgroup) and level 3 (pharmacological subgroup) of each code.
    const classes = [...new Set(w.atcs.flatMap((c) => [atcName.get(c.slice(0, 5)), atcName.get(c.slice(0, 4))]).filter((c): c is string => !!c))];
    rows.push(row({ id: r ? `rx${r.rxcui}` : `wd${w.qid}`, name, otherNames: others.join("; "), bangla: w.bn, atc: w.atcs.join("; "), classes: classes.join("; "), rxcui: r?.rxcui ?? null, wikidata: w.qid }));
  }
  for (const r of rx) {
    if (usedRx.has(r.rxcui)) continue;
    rows.push(row({ id: `rx${r.rxcui}`, name: r.name.charAt(0).toUpperCase() + r.name.slice(1), otherNames: "", bangla: "", atc: "", classes: "", rxcui: r.rxcui, wikidata: null }));
  }
  return rows;
}

function row(r: Omit<GenericRow, "search">): GenericRow {
  return { ...r, search: [r.name, r.otherNames, r.bangla, r.classes, r.atc].join(" ").toLowerCase() };
}

// Codes carry the name: "RX:GENERIC:rx161:Paracetamol".
const PREFIX = "GENERIC:";
export const genericCode = (r: Pick<GenericRow, "id" | "name">) => `RX:${PREFIX}${r.id.replace(/[^0-9A-Za-z]/g, "")}:${r.name.replace(/\s+/g, " ").trim().slice(0, 120)}`;

export function genericFromCode(code: string | null | undefined): Product | undefined {
  const raw = code?.replace(/^RX:/, "");
  if (!raw?.startsWith(PREFIX)) return undefined;
  const rest = raw.slice(PREFIX.length);
  const i = rest.indexOf(":");
  const id = i > 0 ? rest.slice(0, i) : "";
  const display = rest.slice(i + 1).replace(/\s+/g, " ").trim();
  if (!id || display.length < 2) return undefined;
  // No strength or form: the prescriber writes the dose, frequency and amount.
  return { rxnorm: `${PREFIX}${id}:${display}`, display, unit: "", countable: false, dose: "", route: "oral", frequency: "", days: 0, quantity: "", refills: 0, generic: id };
}

// Every typed word must appear. Medicines (with an ATC class) come before chemicals,
// names starting with the first word first.
export function rankGenerics<T extends Pick<GenericRow, "name" | "search" | "atc">>(rows: T[], q: string): T[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const first = words[0] ?? "";
  return rows
    .filter((r) => words.every((w) => r.search.includes(w)))
    .map((r) => {
      const name = r.name.toLowerCase();
      const score = (name === first ? 0 : name.startsWith(first) ? 1 : r.search.includes(` ${first}`) || r.search.includes(`;${first}`) ? 2 : 3) * 2 + (r.atc ? 0 : 1);
      return { r, score };
    })
    .sort((a, b) => a.score - b.score || a.r.name.length - b.r.name.length || a.r.name.localeCompare(b.r.name))
    .map((x) => x.r);
}
