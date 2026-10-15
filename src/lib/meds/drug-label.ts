// Prescribing information for any medicine, from the official US labels that the FDA
// publishes through openFDA (public domain; the same labels DailyMed shows):
// indications, dose, kidney dosing, contraindications, warnings and interactions.
// It is reference text to read, not data the checks run on: label dosing is prose,
// and the labels are for US products, so Bangladeshi brands and doses can differ.
// The automatic dose, kidney and interaction checks stay with drugs.ts.

import { ingredientsOf } from "./drugs";

export const OPENFDA_LABEL_URL = "https://api.fda.gov/drug/label.json";

export type LabelSection = { key: string; label: string; text: string };
export type DrugLabel = {
  title: string; // brand or generic name on the label
  generic: string;
  setId: string;
  updated: string; // YYYY-MM-DD
  prescription: boolean;
  manufacturer: string;
  kidney: string[]; // sentences about kidney dosing, pulled from the whole label
  sections: LabelSection[];
};

// International (and British) names that the US labels call something else.
const US_NAMES: Record<string, string> = {
  paracetamol: "acetaminophen",
  salbutamol: "albuterol",
  levosalbutamol: "levalbuterol",
  glibenclamide: "glyburide",
  adrenaline: "epinephrine",
  noradrenaline: "norepinephrine",
  frusemide: "furosemide",
  lignocaine: "lidocaine",
  rifampicin: "rifampin",
  pethidine: "meperidine",
  hyoscine: "scopolamine",
  "hyoscine butylbromide": "scopolamine",
  mesalazine: "mesalamine",
  ciclosporin: "cyclosporine",
  cefalexin: "cephalexin",
  aciclovir: "acyclovir",
  valaciclovir: "valacyclovir",
  "clavulanic acid": "clavulanate",
  "sodium valproate": "valproic acid",
  "valproate sodium": "valproic acid",
  phenobarbitone: "phenobarbital",
  beclometasone: "beclomethasone",
  "glyceryl trinitrate": "nitroglycerin",
  "sodium cromoglicate": "cromolyn",
  colecalciferol: "cholecalciferol",
  chlorphenamine: "chlorpheniramine",
  dicycloverine: "dicyclomine",
  clomifene: "clomiphene",
  thyroxine: "levothyroxine",
  "levothyroxine sodium": "levothyroxine",
  "co-trimoxazole": "sulfamethoxazole and trimethoprim",
  cotrimoxazole: "sulfamethoxazole and trimethoprim",
  "co-amoxiclav": "amoxicillin and clavulanate",
  amoxiclav: "amoxicillin and clavulanate",
  dexamfetamine: "dextroamphetamine",
  orciprenaline: "metaproterenol",
  tetracosactide: "cosyntropin",
  ergometrine: "ergonovine",
  bendrofluazide: "bendroflumethiazide",
  isoprenaline: "isoproterenol",
  sulphasalazine: "sulfasalazine",
};

const FORMS =
  /\b(tablets?|tabs?|capsules?|caps?|syrup|suspension|solution|drops?|injection|injectable|infusion|cream|ointment|gel|lotion|inhaler|inhalation|nebuli[sz]er|nebules?|spray|suppository|sachet|powder|granules?|elixir|lozenges?|patch|film[- ]coated|extended[- ]release|sustained[- ]release|delayed[- ]release|modified[- ]release|dispersible|chewable|effervescent|oral|topical|ophthalmic|otic|nasal|eye|ear|ir|er|xr|sr|cr|mr|dr|xl|la|ds|forte|plus|bp|usp|ip)\b/gi;
const STRENGTH = /\b\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|g|gm|ml|iu|units?|%|mmol|meq)?(?:\s*\/\s*\d*(?:[.,]\d+)?\s*(?:mg|mcg|g|ml|dose|puff|actuation|tablet|5\s*ml))?\b/gi;

const tidy = (s: string) => s.replace(/\s+/g, " ").replace(/^[\s,;:\-]+|[\s,;:\-]+$/g, "").trim();

// The generic ingredient names a medication name is made of, in the names the US
// labels use. "Napa (Paracetamol 500 mg) tablet" → ["acetaminophen"];
// "Amoxicillin-clavulanate 875-125 mg tablet" → ["amoxicillin", "clavulanate"].
export function genericNamesFor(drug: string): string[] {
  const inside = drug.match(/\(([^()]*[a-z]{3}[^()]*)\)/i)?.[1];
  const base = (inside ?? drug).toLowerCase().replace(STRENGTH, " ").replace(FORMS, " ").replace(/[()[\]®™]/g, " ");
  const parts = base
    .split(/\s*\+\s*|\s+and\s+|\s*\/\s*|\s*,\s*|\s+with\s+|\s+&\s+|(?<=[a-z]{4})-(?=[a-z]{5})/)
    .map(tidy)
    .filter((p) => p.length >= 3 && /[a-z]{3}/.test(p));
  const names = parts.flatMap((p) => {
    const us = US_NAMES[p];
    if (us) return us.split(" and ");
    // The clinic's checks know many brands and international names by their US name.
    const known = ingredientsOf(p);
    if (known.length === 1) return known[0].name.split(/(?<=[a-z]{4})-(?=[a-z]{5})/);
    return [p];
  });
  if (!inside && names.every((n) => !ingredientsOf(n).length)) {
    // A brand typed on its own: use the ingredients the checks recognise in it.
    const known = ingredientsOf(drug).flatMap((i) => i.name.split(/(?<=[a-z]{4})-(?=[a-z]{5})/));
    if (known.length) return [...new Set(known)];
  }
  return [...new Set(names.map(tidy).filter(Boolean))].slice(0, 4);
}

// openFDA search for labels containing every ingredient.
export function labelSearch(names: string[]) {
  return names.map((n) => `openfda.generic_name:"${n.replace(/["\\]/g, "")}"`).join(" AND ");
}

type RawLabel = Record<string, unknown> & { openfda?: Record<string, unknown> };

const first = (v: unknown) => (Array.isArray(v) ? String(v[0] ?? "") : typeof v === "string" ? v : "");
const allText = (v: unknown) => (Array.isArray(v) ? v.map(String).join("\n\n") : typeof v === "string" ? v : "");

// "2 DOSAGE AND ADMINISTRATION 2.1 Adults ..." → "2.1 Adults ...": the section's own heading.
const HEADING = /^\s*(?:\d+(?:\.\d+)*\s+)?(?:BOXED WARNING|WARNING|INDICATIONS? (?:AND|&) USAGE|DOSAGE (?:AND|&) ADMINISTRATION|DIRECTIONS|DOSAGE FORMS (?:AND|&) STRENGTHS|CONTRAINDICATIONS|WARNINGS (?:AND|&) PRECAUTIONS|WARNINGS|PRECAUTIONS|DRUG INTERACTIONS|USE IN SPECIFIC POPULATIONS|ADVERSE REACTIONS|OVERDOSAGE|DO NOT USE|PREGNANCY|PEDIATRIC USE|GERIATRIC USE|PURPOSES?|USES?)\b\s*:?\s*/;
export const cleanSection = (s: string) =>
  s
    .replace(HEADING, "")
    .replace(/[ \t]+/g, " ")
    // Each numbered subsection ("2.2 Renal Impairment ...") on its own line.
    .replace(/\s+(?=\d+\.\d+(?:\.\d+)?\s+[A-Z])/g, "\n")
    .replace(/\s*\n\s*/g, "\n")
    .trim()
    .slice(0, 8000);

const SECTIONS: { key: string; label: string; from: string[] }[] = [
  { key: "boxed", label: "Boxed warning", from: ["boxed_warning"] },
  { key: "indications", label: "Indications", from: ["indications_and_usage", "purpose"] },
  { key: "dose", label: "Dose", from: ["dosage_and_administration"] },
  { key: "forms", label: "Forms and strengths", from: ["dosage_forms_and_strengths"] },
  { key: "contraindications", label: "Contraindications", from: ["contraindications", "do_not_use"] },
  { key: "warnings", label: "Warnings and precautions", from: ["warnings_and_cautions", "warnings", "precautions"] },
  { key: "interactions", label: "Interactions", from: ["drug_interactions"] },
  { key: "populations", label: "Pregnancy, children, older adults", from: ["use_in_specific_populations", "pregnancy", "pediatric_use", "geriatric_use"] },
  { key: "adverse", label: "Side effects", from: ["adverse_reactions"] },
  { key: "overdose", label: "Overdose", from: ["overdosage"] },
];

const KIDNEY = /\brenal\b|\bkidney|creatinine clearance|\bcrcl\b|\begfr\b|\bgfr\b|dialysis|haemodialysis|hemodialysis/i;

// Sentences about kidney function, so the kidney dose is one glance away.
export function kidneySentences(raw: RawLabel): string[] {
  const text = ["dosage_and_administration", "use_in_specific_populations", "contraindications", "warnings_and_cautions", "warnings", "precautions"].map((k) => allText(raw[k])).join("\n");
  const out: string[] = [];
  for (const s of text.split(/(?<=[.;])\s+(?=[A-Z(•])|\s+(?=\d+\.\d+(?:\.\d+)?\s+[A-Z])|\n+/)) {
    const t = cleanSection(s).replace(/^\d+(?:\.\d+)+\s+/, "");
    if (t.length < 25 || t.length > 600 || !KIDNEY.test(t)) continue;
    // Skip the section headings and cross-references on their own.
    if (/^\(?\s*see\b/i.test(t) || /^[\d.\s]*renal impairment\s*$/i.test(t)) continue;
    if (!out.some((o) => o === t)) out.push(t);
    if (out.length >= 6) break;
  }
  return out;
}

const ingredientsOfLabel = (g: string) => g.toLowerCase().split(/\s+and\s+|,\s*/).filter(Boolean);

// Of the labels found, the best match: the same number of ingredients (not a
// combination product), a prescription label, with a dose section, the newest.
export function pickLabel(results: RawLabel[], names: string[]): RawLabel | undefined {
  const scored = results
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const g = first(r.openfda?.generic_name);
      const n = g ? ingredientsOfLabel(g).length : 99;
      const rx = /prescription/i.test(first(r.openfda?.product_type));
      const score = (n === names.length ? 0 : 8) + (rx ? 0 : 4) + (allText(r.dosage_and_administration) ? 0 : 2) + (allText(r.indications_and_usage) ? 0 : 1);
      return { r, score, date: String(r.effective_time ?? "") };
    })
    .sort((a, b) => a.score - b.score || b.date.localeCompare(a.date));
  return scored[0]?.r;
}

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s\-/(])([a-z])/g, (_, a, b) => a + b.toUpperCase());

export function toDrugLabel(raw: RawLabel): DrugLabel {
  const f = raw.openfda ?? {};
  const generic = titleCase(first(f.generic_name));
  const brand = first(f.brand_name);
  const t = String(raw.effective_time ?? "");
  const sections: LabelSection[] = [];
  for (const s of SECTIONS) {
    const text = s.from.map((k) => cleanSection(allText(raw[k]))).filter(Boolean).join("\n\n");
    if (text) sections.push({ key: s.key, label: s.label, text });
  }
  return {
    title: brand ? titleCase(brand) : generic,
    generic,
    setId: String(raw.set_id ?? first(f.spl_set_id) ?? ""),
    updated: /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6)}` : "",
    prescription: /prescription/i.test(first(f.product_type)),
    manufacturer: first(f.manufacturer_name),
    kidney: kidneySentences(raw),
    sections,
  };
}

export function parseLabels(body: unknown): RawLabel[] {
  const results = (body as { results?: unknown })?.results;
  if (!Array.isArray(results)) throw new Error("openFDA didn't send any labels");
  return results as RawLabel[];
}

export const dailyMedUrl = (setId: string) => `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=${encodeURIComponent(setId)}`;
