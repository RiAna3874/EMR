// How the Results trend table is organized: by specialty (Hematology, Chemistry,
// Cardiology...) and, inside each, by panel (CBC, Liver function...), the way Epic's
// results review groups them. Tests we know by LOINC are placed exactly; anything else
// (outside reports, local codes) is placed by its name, then by the section the lab
// printed it under, and lands in "Other results" when nothing fits.
//
// Every blood sugar (lab glucose of any timing, and fingerstick glucose from the
// vitals) is also pulled into one dated trend, in mmol/L as Bangladeshi clinics read it.

import { normKey } from "./catalog";
import { GLUCOSE_TIMINGS, glucoseTiming, isGlucoseCode, mgToMmol, type GlucoseTiming } from "../glucose";

export const LAB_GROUPS = [
  { key: "diabetes", label: "Diabetes", subs: [["sugar", "Blood sugar"], ["a1c", "HbA1c"], ["other", "Other diabetes tests"]] },
  {
    key: "hematology",
    label: "Hematology",
    subs: [["cbc", "Complete blood count (CBC)"], ["diff", "White cell differential"], ["esr", "ESR"], ["coag", "Coagulation"], ["anemia", "Anemia studies"], ["other", "Other hematology"]],
  },
  {
    key: "chemistry",
    label: "Chemistry",
    subs: [["electrolytes", "Electrolytes"], ["kidney", "Kidney function"], ["liver", "Liver function"], ["bone", "Bone and minerals"], ["other", "Other chemistry"]],
  },
  { key: "cardiology", label: "Cardiology", subs: [["lipid", "Lipid panel"], ["cardiac", "Cardiac markers"], ["other", "Other cardiac tests"]] },
  { key: "endocrine", label: "Endocrine", subs: [["thyroid", "Thyroid"], ["vitamins", "Vitamins"], ["hormones", "Hormones"], ["other", "Other endocrine"]] },
  {
    key: "rheumatology",
    label: "Rheumatology and inflammation",
    subs: [["inflammation", "Inflammation markers"], ["autoimmune", "Autoimmune tests"], ["gout", "Uric acid"], ["other", "Other rheumatology"]],
  },
  {
    key: "infectious",
    label: "Infectious disease",
    subs: [["dengue", "Dengue"], ["typhoid", "Typhoid"], ["malaria", "Malaria"], ["hepatitis", "Hepatitis"], ["hiv", "HIV and STI"], ["tb", "Tuberculosis"], ["culture", "Cultures"], ["other", "Other infection tests"]],
  },
  { key: "urine", label: "Urine and stool", subs: [["urinalysis", "Urinalysis"], ["albumin", "Urine albumin"], ["stool", "Stool"], ["other", "Other urine tests"]] },
  { key: "tumor", label: "Tumor markers", subs: [["markers", "Tumor markers"]] },
  { key: "other", label: "Other results", subs: [["other", "Other results"]] },
] as const;

export type GroupKey = (typeof LAB_GROUPS)[number]["key"];
export type Placement = { group: GroupKey; sub: string };

const GROUP_ORDER = new Map<string, number>(LAB_GROUPS.map((g, i) => [g.key, i]));
export const groupOrder = (g: string) => GROUP_ORDER.get(g) ?? LAB_GROUPS.length;
export const subOrder = (g: string, sub: string) => {
  const subs = LAB_GROUPS.find((x) => x.key === g)?.subs as readonly (readonly [string, string])[] | undefined;
  const i = subs?.findIndex(([k]) => k === sub) ?? -1;
  return i < 0 ? 99 : i;
};
export const groupLabel = (g: string) => LAB_GROUPS.find((x) => x.key === g)?.label ?? "Other results";
export const subLabel = (g: string, sub: string) =>
  ((LAB_GROUPS.find((x) => x.key === g)?.subs ?? []) as readonly (readonly [string, string])[]).find(([k]) => k === sub)?.[1] ?? "Other";

// Tests we file under a LOINC code (see catalog.ts and the order catalog).
const BY_LOINC: Record<string, Placement> = {};
const put = (group: GroupKey, sub: string, codes: string[]) => codes.forEach((c) => (BY_LOINC[c] = { group, sub }));
put("diabetes", "sugar", ["2345-7", "1558-6", "2339-0", "41653-7", "1521-4", "20438-8"]);
put("diabetes", "a1c", ["4548-4", "17856-6"]);
put("hematology", "cbc", ["6690-2", "789-8", "718-7", "4544-3", "787-2", "785-6", "786-4", "788-0", "777-3", "32623-1"]);
put("hematology", "diff", ["770-8", "736-9", "5905-5", "713-8", "706-2", "751-8", "731-0", "742-7", "711-2", "704-7"]);
put("hematology", "esr", ["30341-2", "4537-7"]);
put("hematology", "coag", ["5902-2", "6301-6", "5964-2", "3173-2", "48065-7", "3255-7"]);
put("hematology", "anemia", ["2276-4", "2498-4", "2500-7", "2502-3", "2132-9", "2284-8", "4679-7", "17849-1"]);
put("chemistry", "electrolytes", ["2951-2", "2823-3", "2075-0", "2028-9"]);
put("chemistry", "kidney", ["3094-0", "3091-6", "2160-0", "33914-3", "62238-1", "48642-3"]);
put("chemistry", "liver", ["1742-6", "1920-8", "6768-6", "1975-2", "1968-7", "1751-7", "2885-2", "2324-2", "10834-0"]);
put("chemistry", "bone", ["17861-6", "19123-9", "2777-1"]);
put("cardiology", "lipid", ["2093-3", "13457-7", "2085-9", "2571-8", "13458-5"]);
put("cardiology", "cardiac", ["30934-4", "33762-6", "10839-9", "6598-7", "89579-7", "13969-1", "2157-6"]);
put("endocrine", "thyroid", ["3016-3", "3024-7", "3051-0", "3053-6", "3026-2"]);
put("endocrine", "vitamins", ["1989-3"]);
put("rheumatology", "inflammation", ["1988-5", "30522-7", "33959-8"]);
put("rheumatology", "gout", ["3084-1"]);
put("urine", "urinalysis", ["24356-8"]);
put("urine", "albumin", ["14959-1", "14957-5", "9318-7"]);
put("tumor", "markers", ["2857-1", "2039-6", "10334-1", "1834-1", "24108-3"]);

// Name rules, checked in order: urine and stool first, so "Urine glucose" is not a blood sugar.
const NAME_RULES: [RegExp, GroupKey, string][] = [
  [/\b(urine|urinary|urinalysis|u\/a|r\/e urine|r\/m\/e|routine urine|pus cells?|epithelial|casts?|crystals?|ketones?|specific gravity|urobilinogen)\b/, "urine", "urinalysis"],
  [/\b(microalbumin|acr|albumin.?creatinine ratio)\b/, "urine", "albumin"],
  [/\b(stool|occult blood|ova|cyst|fobt|h\.? ?pylori stool)\b/, "urine", "stool"],
  [/\b(culture|sensitivity|c\/s|gram stain)\b/, "infectious", "culture"],
  [/\b(dengue|ns1)\b/, "infectious", "dengue"],
  [/\b(widal|typhi|typhoid|typhidot|salmonella)\b/, "infectious", "typhoid"],
  [/\b(malaria|plasmodium|mp|ict for malaria|falciparum|vivax)\b/, "infectious", "malaria"],
  [/\b(hbsag|hbs ag|hepatitis|hbv|hcv|anti.?hcv|hav|hev|hbeag|anti.?hbs|anti.?hbc)\b/, "infectious", "hepatitis"],
  [/\b(hiv|vdrl|tpha|syphilis|rpr|chlamydia|gonorr?hoea|gonorrhea)\b/, "infectious", "hiv"],
  [/\b(tb|tuberculosis|afb|genexpert|gene xpert|mantoux|mtb|igra|quantiferon)\b/, "infectious", "tb"],
  [/\b(covid|sars|influenza|chikungunya|leptospira|brucella|procalcitonin|aso|asot|antistreptolysin)\b/, "infectious", "other"],
  [/\b(hba1c|a1c|glycated|glycosylated)\b/, "diabetes", "a1c"],
  [/\b(glucose|sugar|fbs|rbs|2hpp|2habf|ogtt|fpg|ppbs)\b/, "diabetes", "sugar"],
  [/\b(c.?peptide|insulin|fructosamine)\b/, "diabetes", "other"],
  [/\b(reticulocyte|ferritin|iron|tibc|transferrin|b12|cobalamin|folate|folic|hb electrophoresis|haemoglobin electrophoresis|hemoglobin electrophoresis)\b/, "hematology", "anemia"],
  [/\b(neutrophils?|lymphocytes?|monocytes?|eosinophils?|basophils?|polymorphs|band forms?|absolute .* count|aec)\b/, "hematology", "diff"],
  [/\b(esr|sedimentation)\b/, "hematology", "esr"],
  [/\b(pt|inr|aptt|ptt|prothrombin|thromboplastin|fibrinogen|d.?dimer|bleeding time|clotting time|bt|ct)\b/, "hematology", "coag"],
  [/\b(hemoglobin|haemoglobin|hb|hgb|hematocrit|haematocrit|pcv|hct|rbc|wbc|tc|tlc|leucocyte|leukocyte|platelets?|plt|mcv|mch|mchc|rdw|mpv|pdw|pct)\b/, "hematology", "cbc"],
  [/\b(blood group|rh|peripheral (blood )?film|pbf|coombs?|g6pd)\b/, "hematology", "other"],
  [/\b(vitamin|vit|25.?oh|zinc)\b/, "endocrine", "vitamins"],
  [/\b(troponin|ck.?mb|cpk|creatine kinase|bnp|nt.?pro.?bnp|myoglobin|ldh|lactate dehydrogenase|homocysteine)\b/, "cardiology", "cardiac"],
  [/\b(cholesterol|ldl|hdl|vldl|triglycerides?|tg|lipid|lipoprotein|apo ?a|apo ?b)\b/, "cardiology", "lipid"],
  [/\b(sodium|potassium|chloride|bicarbonate|hco3|co2|electrolytes?|na|k|cl)\b/, "chemistry", "electrolytes"],
  [/\b(urea|bun|creatinine|egfr|gfr|cystatin)\b/, "chemistry", "kidney"],
  [/\b(alt|ast|sgpt|sgot|alkaline phosphatase|alp|bilirubin|albumin|globulin|a\/g ratio|total protein|ggt|gamma|liver)\b/, "chemistry", "liver"],
  [/\b(calcium|magnesium|phosph(orus|ate)|pth|parathyroid)\b/, "chemistry", "bone"],
  [/\b(amylase|lipase|lactate|ammonia)\b/, "chemistry", "other"],
  [/\b(tsh|t3|t4|ft3|ft4|thyroxine|triiodothyronine|thyroid|anti.?tpo|thyroglobulin)\b/, "endocrine", "thyroid"],
  [/\b(cortisol|prolactin|lh|fsh|testosterone|estradiol|oestradiol|progesterone|beta.?hcg|hcg|amh|growth hormone|acth|dhea)\b/, "endocrine", "hormones"],
  [/\b(crp|c.?reactive|hs.?crp)\b/, "rheumatology", "inflammation"],
  [/\b(ra factor|rheumatoid|rf|ana|anti.?ccp|ccp|dsdna|ds.?dna|anca|c3|c4|complement|hla.?b27|anti.?nuclear|ena)\b/, "rheumatology", "autoimmune"],
  [/\b(uric acid|urate)\b/, "rheumatology", "gout"],
  [/\b(psa|cea|ca.?125|ca.?19.?9|ca.?15.?3|afp|alpha.?fetoprotein|tumou?r marker)\b/, "tumor", "markers"],
];

// The section a lab printed a result under, when its name says nothing.
const SECTION_RULES: [RegExp, GroupKey, string][] = [
  [/\b(urine|urinalysis)\b/, "urine", "other"],
  [/\bstool\b/, "urine", "stool"],
  [/\b(haematology|hematology|cbc|blood count)\b/, "hematology", "other"],
  [/\b(lipid|cardiac|cardiology)\b/, "cardiology", "other"],
  [/\b(thyroid|hormone|endocrin)/, "endocrine", "other"],
  [/\b(serology|microbiology|virology|infection)\b/, "infectious", "other"],
  [/\b(immunology|rheumat|autoimmun)/, "rheumatology", "other"],
  [/\b(diabet|glucose|sugar)\b/, "diabetes", "other"],
  [/\b(biochemistry|chemistry|metabolic|renal|kidney|liver|electrolyte)\b/, "chemistry", "other"],
];

const words = (s: string) => ` ${normKey(s).replace(/[()[\],:;]/g, " ").replace(/\s+/g, " ")} `;

export function placeResult(code: string, display: string, panelDisplay?: string | null): Placement {
  if (isGlucoseCode(code)) return { group: "diabetes", sub: "sugar" };
  const known = BY_LOINC[code];
  if (known) return known;
  const name = words(display);
  const section = panelDisplay ? words(panelDisplay) : "";
  // "Sugar: Nil" or "Protein: +" on a urine report is a urine test, whatever its name.
  if (/\b(urine|urinalysis|stool)\b/.test(section)) {
    const sub = /\bstool\b/.test(section) ? "stool" : /\b(microalbumin|acr|albumin.?creatinine ratio)\b/.test(name) ? "albumin" : "urinalysis";
    return { group: "urine", sub };
  }
  for (const [re, group, sub] of NAME_RULES) if (re.test(name)) return { group, sub };
  for (const [re, group, sub] of SECTION_RULES) if (re.test(section)) return { group, sub };
  return { group: "other", sub: "other" };
}

// Blood sugar is always its own table. Another panel joins the table before it when
// most of their dates are shared (judged on the newest dates, which are what's shown).
export function blocksOf<S extends { key: string; times: number[] }>(subs: S[], recent = 8): { subs: S[]; times: number[] }[] {
  const blocks: { subs: S[]; times: number[] }[] = [];
  for (const x of subs) {
    const last = blocks.at(-1);
    if (last && x.key !== "sugar" && last.subs[0].key !== "sugar" && overlaps(last.times.slice(0, recent), x.times.slice(0, recent))) {
      last.subs.push(x);
      last.times = [...new Set([...last.times, ...x.times])].sort((a, b) => b - a);
    } else blocks.push({ subs: [x], times: [...x.times] });
  }
  return blocks;
}

function overlaps(a: number[], b: number[]) {
  const set = new Set(a);
  const shared = b.filter((t) => set.has(t)).length;
  return shared > 0 && shared * 2 >= Math.min(a.length, b.length);
}

// ---------- one blood sugar trend ----------

export type SugarSource = "lab" | "fingerstick";
export type SugarReading = { timing: GlucoseTiming; source: SugarSource; mmol: number };

type Obs = { code: string; display: string; valueNum: number | null; unit: string | null; category?: string };

// A glucose result in mmol/L with its timing, or null when it isn't a blood sugar
// (a urine glucose, an HbA1c, a text result).
export function sugarReading(o: Obs, panelDisplay?: string | null): SugarReading | null {
  if (o.valueNum === null) return null;
  const poc = glucoseTiming(o.code);
  if (poc) return { timing: poc.key, source: "fingerstick", mmol: o.valueNum };
  if (o.category === "vital_signs") return null;
  const place = placeResult(o.code, o.display, panelDisplay);
  if (place.group !== "diabetes" || place.sub !== "sugar") return null;
  const unit = normKey(o.unit ?? "");
  const mmol = unit === "mmol/l" ? Math.round(o.valueNum * 10) / 10 : unit === "mg/dl" || unit === "" ? mgToMmol(o.valueNum) : null;
  if (mmol === null) return null;
  const name = words(o.display);
  const timing: GlucoseTiming =
    o.code === "1558-6" || /\b(fasting|fbs|fpg|fbg)\b/.test(name)
      ? "fasting"
      : /\b(2 ?h|2 ?hrs?|two hours?|post ?prandial|ppbs|2hpp|2habf|abf|after (meal|breakfast|food)|pp)\b/.test(name)
        ? "post_meal"
        : "random";
  return { timing, source: "lab", mmol };
}

export const SUGAR_TIMINGS = GLUCOSE_TIMINGS;

// A blood glucose of any timing, lab or fingerstick (not a urine sugar, not HbA1c).
export function isBloodSugar(o: { code: string; display: string; category?: string }, panelDisplay?: string | null) {
  if (isGlucoseCode(o.code)) return true;
  if (o.category === "vital_signs") return false;
  const p = placeResult(o.code, o.display, panelDisplay);
  return p.group === "diabetes" && p.sub === "sugar";
}

// Where a result opens in the chart: blood sugars live on their own tab.
export function resultHref(chartBase: string, o: { code: string; display: string; category?: string }, panelDisplay?: string | null) {
  return isBloodSugar(o, panelDisplay) ? `${chartBase}/sugar` : `${chartBase}/results#${encodeURIComponent(o.code)}`;
}
export const sugarShort = (t: GlucoseTiming) => GLUCOSE_TIMINGS.find((x) => x.key === t)!.short;
export const sugarLabel = (t: GlucoseTiming) => GLUCOSE_TIMINGS.find((x) => x.key === t)!.label;
