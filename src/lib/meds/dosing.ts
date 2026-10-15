// Pick lists for writing a dose and frequency: dose units, frequencies with the
// abbreviations people type to find them (BID, q8h, qhs), the doses commonly
// used for a medication, and a list of outside and over-the-counter medications
// that aren't on the clinic formulary. Doses are still stored as one string
// ("500 mg"), so older free-text doses read and edit exactly as before.
import { FORMULARY, productFor, type Product } from "./formulary";

export type PickOption = { value: string; hint?: string; keywords?: string[] };

// Canonical units are plural where they count things; "1 tablet" is written
// singular by joinDose.
export const DOSE_UNITS: PickOption[] = [
  { value: "mg", hint: "milligrams" },
  { value: "mcg", hint: "micrograms", keywords: ["ug", "µg", "microgram"] },
  { value: "g", hint: "grams", keywords: ["gram", "gm"] },
  { value: "mL", hint: "millilitres", keywords: ["ml", "cc", "millilitre", "milliliter"] },
  { value: "units", hint: "e.g. insulin", keywords: ["u", "unit"] },
  { value: "IU", hint: "international units", keywords: ["international"] },
  { value: "mEq", hint: "milliequivalents", keywords: ["meq"] },
  { value: "mmol", hint: "millimoles" },
  { value: "mg/kg", hint: "per kg body weight", keywords: ["weight", "kg"] },
  { value: "%", hint: "percent strength", keywords: ["percent"] },
  { value: "tablets", keywords: ["tab", "tablet", "pill"] },
  { value: "capsules", keywords: ["cap", "capsule"] },
  { value: "puffs", hint: "inhaler", keywords: ["puff", "inhalation"] },
  { value: "sprays", hint: "nasal or oral", keywords: ["spray"] },
  { value: "drops", keywords: ["drop", "gtt"] },
  { value: "teaspoons", hint: "5 mL", keywords: ["tsp", "teaspoon"] },
  { value: "tablespoons", hint: "15 mL", keywords: ["tbsp", "tablespoon"] },
  { value: "sachets", keywords: ["sachet", "packet", "ors"] },
  { value: "patches", keywords: ["patch", "transdermal"] },
  { value: "suppositories", keywords: ["suppository", "rectal"] },
  { value: "applications", hint: "thin layer", keywords: ["apply", "application", "cream", "ointment"] },
  { value: "vials", keywords: ["vial"] },
  { value: "ampoules", keywords: ["ampoule", "amp"] },
];

const SINGULAR: Record<string, string> = {
  tablets: "tablet", capsules: "capsule", puffs: "puff", sprays: "spray", drops: "drop", teaspoons: "teaspoon",
  tablespoons: "tablespoon", sachets: "sachet", patches: "patch", suppositories: "suppository", applications: "application",
  vials: "vial", ampoules: "ampoule", units: "unit",
};
const UNIT_BY_WORD = new Map<string, string>();
for (const u of DOSE_UNITS) {
  UNIT_BY_WORD.set(u.value.toLowerCase(), u.value);
  for (const k of u.keywords ?? []) if (!UNIT_BY_WORD.has(k.toLowerCase())) UNIT_BY_WORD.set(k.toLowerCase(), u.value);
}
for (const [plural, one] of Object.entries(SINGULAR)) UNIT_BY_WORD.set(one, plural);

// The canonical unit for what someone typed ("tab" → "tablets"), if we know it.
export function resolveUnit(typed: string) {
  const t = typed.trim().toLowerCase();
  return UNIT_BY_WORD.get(t) ?? (t.length > 2 ? UNIT_BY_WORD.get(t.replace(/s$/, "")) : undefined) ?? null;
}

// "1000 mg" → { amount: "1000", unit: "mg" }. Anything else (a taper, "thin
// layer", a unit we don't know) stays whole in amount with no unit, so nothing
// typed before is lost.
export function splitDose(dose: string): { amount: string; unit: string } {
  const m = dose.trim().match(/^(\d+(?:[.,]\d+)?(?:\s*(?:-|to)\s*\d+(?:[.,]\d+)?)?)\s*(\S+)$/i);
  const unit = m && resolveUnit(m[2]);
  if (m && unit) return { amount: m[1], unit };
  return { amount: dose.trim(), unit: "" };
}

export function joinDose(amount: string, unit: string) {
  const a = amount.trim();
  if (!a) return "";
  if (!unit) return a;
  const u = Number(a) === 1 && SINGULAR[unit] ? SINGULAR[unit] : unit;
  return u === "%" ? `${a}%` : `${a} ${u}`;
}

// Frequencies are stored in words (the sig maths and printed prescriptions read
// them); the abbreviations are only for finding them.
export const FREQUENCIES: PickOption[] = [
  { value: "once daily", hint: "daily, QD", keywords: ["qd", "od", "daily", "1x"] },
  { value: "twice daily", hint: "BID", keywords: ["bid", "bd", "2x", "q12h"] },
  { value: "three times daily", hint: "TID", keywords: ["tid", "tds", "3x"] },
  { value: "four times daily", hint: "QID", keywords: ["qid", "qds", "4x"] },
  { value: "once daily in the morning", hint: "QAM", keywords: ["qam", "morning", "am"] },
  { value: "nightly", hint: "QHS, at bedtime", keywords: ["qhs", "hs", "bedtime", "night", "pm"] },
  { value: "once daily before breakfast", hint: "AC", keywords: ["ac", "empty stomach", "before food"] },
  { value: "twice daily with meals", hint: "BID with food", keywords: ["bid", "food", "meals", "pc"] },
  { value: "three times daily with meals", hint: "TID with food", keywords: ["tid", "food", "meals", "pc"] },
  { value: "every 4 hours", hint: "q4h", keywords: ["q4h"] },
  { value: "every 6 hours", hint: "q6h", keywords: ["q6h"] },
  { value: "every 8 hours", hint: "q8h", keywords: ["q8h"] },
  { value: "every 12 hours", hint: "q12h", keywords: ["q12h"] },
  { value: "every 4 hours as needed", hint: "q4h PRN", keywords: ["q4h", "prn"] },
  { value: "every 6 hours as needed", hint: "q6h PRN", keywords: ["q6h", "prn"] },
  { value: "every 8 hours as needed", hint: "q8h PRN", keywords: ["q8h", "prn"] },
  { value: "once daily as needed", hint: "daily PRN", keywords: ["prn", "qd"] },
  { value: "as needed", hint: "PRN", keywords: ["prn", "sos"] },
  { value: "once weekly", hint: "weekly", keywords: ["qweek", "qw", "weekly"] },
  { value: "every other day", hint: "QOD", keywords: ["qod", "alternate"] },
  { value: "once monthly", hint: "monthly", keywords: ["monthly", "qmonth"] },
  { value: "once", hint: "single dose, STAT", keywords: ["stat", "single", "one time"] },
];

export const ROUTES = [
  "oral", "sublingual", "inhaled", "nasal", "subcutaneous", "intramuscular", "intravenous",
  "topical", "transdermal", "ophthalmic", "otic", "rectal", "vaginal",
];

// Common adult doses by ingredient, in the order they're usually reached for.
// Hand-written for the medications on the formulary and the outside list below.
const COMMON_DOSES: [RegExp, string[]][] = [
  [/amoxicillin-clavulanate/i, ["1 tablet"]],
  [/amoxicillin/i, ["250 mg", "500 mg", "875 mg", "1 g"]],
  [/cephalexin/i, ["250 mg", "500 mg"]],
  [/azithromycin/i, ["250 mg", "500 mg"]],
  [/clarithromycin/i, ["250 mg", "500 mg"]],
  [/nitrofurantoin/i, ["50 mg", "100 mg"]],
  [/prednisolone|prednisone/i, ["5 mg", "10 mg", "20 mg", "40 mg", "60 mg"]],
  [/ibuprofen/i, ["200 mg", "400 mg", "600 mg", "800 mg"]],
  [/naproxen/i, ["220 mg", "250 mg", "500 mg"]],
  [/acetaminophen-codeine|paracetamol-codeine/i, ["1 tablet", "2 tablets"]],
  [/acetaminophen|paracetamol/i, ["500 mg", "650 mg", "1000 mg"]],
  [/oxycodone/i, ["2.5 mg", "5 mg", "10 mg"]],
  [/tramadol/i, ["25 mg", "50 mg", "100 mg"]],
  [/cyclobenzaprine/i, ["5 mg", "10 mg"]],
  [/ondansetron/i, ["4 mg", "8 mg"]],
  [/domperidone/i, ["10 mg"]],
  [/sumatriptan/i, ["25 mg", "50 mg", "100 mg"]],
  [/metformin/i, ["500 mg", "850 mg", "1000 mg"]],
  [/glipizide/i, ["2.5 mg", "5 mg", "10 mg"]],
  [/gliclazide/i, ["30 mg", "40 mg", "60 mg", "80 mg"]],
  [/insulin/i, ["4 units", "6 units", "8 units", "10 units", "12 units", "20 units"]],
  [/rybelsus|semaglutide.*tablet/i, ["3 mg", "7 mg", "14 mg"]],
  [/semaglutide|ozempic|wegovy/i, ["0.25 mg", "0.5 mg", "1 mg", "1.7 mg", "2 mg", "2.4 mg"]],
  [/tirzepatide|mounjaro|zepbound/i, ["2.5 mg", "5 mg", "7.5 mg", "10 mg", "12.5 mg", "15 mg"]],
  [/dulaglutide|trulicity/i, ["0.75 mg", "1.5 mg", "3 mg", "4.5 mg"]],
  [/liraglutide|victoza|saxenda/i, ["0.6 mg", "1.2 mg", "1.8 mg", "3 mg"]],
  [/exenatide|byetta|bydureon/i, ["5 mcg", "10 mcg", "2 mg"]],
  [/lisinopril/i, ["2.5 mg", "5 mg", "10 mg", "20 mg", "40 mg"]],
  [/losartan/i, ["25 mg", "50 mg", "100 mg"]],
  [/amlodipine/i, ["2.5 mg", "5 mg", "10 mg"]],
  [/metoprolol/i, ["25 mg", "50 mg", "100 mg", "200 mg"]],
  [/bisoprolol/i, ["1.25 mg", "2.5 mg", "5 mg", "10 mg"]],
  [/furosemide/i, ["20 mg", "40 mg", "80 mg"]],
  [/apixaban/i, ["2.5 mg", "5 mg"]],
  [/aspirin/i, ["75 mg", "81 mg", "325 mg"]],
  [/atorvastatin/i, ["10 mg", "20 mg", "40 mg", "80 mg"]],
  [/rosuvastatin/i, ["5 mg", "10 mg", "20 mg", "40 mg"]],
  [/albuterol|salbutamol/i, ["1 puff", "2 puffs"]],
  [/fluticasone-salmeterol/i, ["1 puff", "2 puffs"]],
  [/fluticasone/i, ["1 spray", "2 sprays"]],
  [/tiotropium/i, ["18 mcg"]],
  [/epinephrine/i, ["0.15 mg", "0.3 mg"]],
  [/levothyroxine/i, ["25 mcg", "50 mcg", "75 mcg", "88 mcg", "100 mcg", "112 mcg", "125 mcg"]],
  [/ferrous|iron/i, ["65 mg", "200 mg", "325 mg"]],
  [/esomeprazole/i, ["20 mg", "40 mg"]],
  [/omeprazole/i, ["10 mg", "20 mg", "40 mg"]],
  [/pantoprazole/i, ["20 mg", "40 mg"]],
  [/famotidine/i, ["10 mg", "20 mg", "40 mg"]],
  [/sertraline/i, ["25 mg", "50 mg", "100 mg"]],
  [/alendronate/i, ["70 mg"]],
  [/donepezil/i, ["5 mg", "10 mg"]],
  [/cholecalciferol|vitamin d/i, ["1000 IU", "2000 IU", "5000 IU", "50000 IU"]],
  [/tamsulosin/i, ["0.4 mg", "0.8 mg"]],
  [/allopurinol/i, ["100 mg", "200 mg", "300 mg"]],
  [/tretinoin/i, ["1 application"]],
  [/fish oil|omega-3/i, ["1000 mg", "2000 mg"]],
  [/vitamin b12|cyanocobalamin/i, ["500 mcg", "1000 mcg"]],
  [/folic acid/i, ["400 mcg", "1 mg", "5 mg"]],
  [/calcium/i, ["500 mg", "600 mg", "1000 mg"]],
  [/magnesium/i, ["250 mg", "400 mg"]],
  [/zinc/i, ["10 mg", "20 mg"]],
  [/melatonin/i, ["1 mg", "3 mg", "5 mg"]],
  [/multivitamin/i, ["1 tablet"]],
  [/cetirizine/i, ["5 mg", "10 mg"]],
  [/loratadine/i, ["10 mg"]],
  [/fexofenadine/i, ["120 mg", "180 mg"]],
  [/diphenhydramine/i, ["25 mg", "50 mg"]],
  [/montelukast/i, ["10 mg"]],
  [/loperamide/i, ["2 mg", "4 mg"]],
  [/oral rehydration/i, ["1 sachet"]],
  [/senna/i, ["8.6 mg", "17.2 mg"]],
  [/polyethylene glycol/i, ["17 g"]],
  [/hydrocortisone/i, ["1 application"]],
  [/artificial tears/i, ["1 drop", "2 drops"]],
];

// Common outside and over-the-counter medications that aren't on the formulary,
// with the dose and frequency to start from.
export type OutsideMed = { display: string; dose: string; route: string; frequency: string; keywords?: string[] };

export const OUTSIDE_MEDS: OutsideMed[] = [
  { display: "Fish oil 1000 mg capsule", dose: "1000 mg", route: "oral", frequency: "once daily", keywords: ["omega-3", "supplement"] },
  { display: "Vitamin B12 (cyanocobalamin) 1000 mcg tablet", dose: "1000 mcg", route: "oral", frequency: "once daily", keywords: ["supplement", "vitamin"] },
  { display: "Folic acid 5 mg tablet", dose: "5 mg", route: "oral", frequency: "once daily", keywords: ["supplement", "vitamin", "pregnancy"] },
  { display: "Calcium carbonate 500 mg + vitamin D3 tablet", dose: "1 tablet", route: "oral", frequency: "twice daily", keywords: ["supplement", "bone"] },
  { display: "Magnesium oxide 400 mg tablet", dose: "400 mg", route: "oral", frequency: "once daily", keywords: ["supplement"] },
  { display: "Zinc sulfate 20 mg tablet", dose: "20 mg", route: "oral", frequency: "once daily", keywords: ["supplement", "diarrhea"] },
  { display: "Multivitamin tablet", dose: "1 tablet", route: "oral", frequency: "once daily", keywords: ["supplement", "vitamin"] },
  { display: "Melatonin 3 mg tablet", dose: "3 mg", route: "oral", frequency: "nightly", keywords: ["sleep", "insomnia"] },
  { display: "Loratadine 10 mg tablet", dose: "10 mg", route: "oral", frequency: "once daily", keywords: ["antihistamine", "allergy", "claritin"] },
  { display: "Diphenhydramine 25 mg capsule", dose: "25 mg", route: "oral", frequency: "nightly as needed", keywords: ["antihistamine", "benadryl", "sleep"] },
  { display: "Pantoprazole 40 mg tablet", dose: "40 mg", route: "oral", frequency: "once daily before breakfast", keywords: ["ppi", "gastric", "reflux"] },
  { display: "Famotidine 20 mg tablet", dose: "20 mg", route: "oral", frequency: "twice daily", keywords: ["h2", "gastric", "reflux", "pepcid"] },
  { display: "Antacid (aluminium-magnesium hydroxide) suspension", dose: "10 mL", route: "oral", frequency: "three times daily as needed", keywords: ["gastric", "heartburn"] },
  { display: "Loperamide 2 mg capsule", dose: "2 mg", route: "oral", frequency: "as needed", keywords: ["diarrhea", "imodium"] },
  { display: "Senna 8.6 mg tablet", dose: "17.2 mg", route: "oral", frequency: "nightly as needed", keywords: ["constipation", "laxative"] },
  { display: "Polyethylene glycol 3350 powder", dose: "17 g", route: "oral", frequency: "once daily as needed", keywords: ["constipation", "laxative", "miralax"] },
  { display: "Ibuprofen 200 mg tablet", dose: "400 mg", route: "oral", frequency: "every 8 hours as needed", keywords: ["nsaid", "pain", "advil"] },
  { display: "Prednisolone 5 mg tablet", dose: "5 mg", route: "oral", frequency: "once daily in the morning", keywords: ["steroid"] },
  { display: "Salbutamol 100 mcg inhaler", dose: "2 puffs", route: "inhaled", frequency: "every 4 hours as needed", keywords: ["albuterol", "asthma", "ventolin"] },
  { display: "Fluticasone 50 mcg nasal spray", dose: "2 sprays", route: "nasal", frequency: "once daily", keywords: ["allergy", "flonase", "rhinitis"] },
  { display: "Artificial tears eye drops", dose: "1 drop", route: "ophthalmic", frequency: "four times daily as needed", keywords: ["dry eye", "lubricant"] },
  { display: "Hydrocortisone 1% cream", dose: "1 application", route: "topical", frequency: "twice daily", keywords: ["steroid", "itch", "rash"] },
];

// What a medication picker offers: the clinic formulary first, then outside
// medications, with what to prefill when one is chosen.
export type MedChoice = { display: string; dose: string; route: string; frequency: string; keywords: string[]; formulary: boolean };

export const MED_CHOICES: MedChoice[] = [
  ...FORMULARY.map((p) => ({ display: p.display, dose: p.dose, route: p.route, frequency: p.frequency, keywords: p.keywords ?? [], formulary: true })),
  ...OUTSIDE_MEDS.map((m) => ({ ...m, keywords: m.keywords ?? [], formulary: false })),
];

export const medChoiceByName = new Map(MED_CHOICES.map((m) => [m.display.toLowerCase(), m]));

// Doses to offer for a medication, most likely first: its usual starting dose,
// then the common ones for the ingredient. Empty when we don't know the drug.
export function doseSuggestions(drug: string, product?: Product): string[] {
  const p = product ?? productFor({ drug });
  const out: string[] = [];
  const add = (d?: string) => {
    if (d && !out.some((x) => x.toLowerCase() === d.toLowerCase())) out.push(d);
  };
  add(p?.dose ?? medChoiceByName.get(drug.toLowerCase())?.dose);
  const name = p?.display ?? drug;
  for (const [match, doses] of COMMON_DOSES) {
    if (match.test(name)) {
      doses.forEach(add);
      break;
    }
  }
  if (p?.countable && out.length) {
    add(`1 ${p.unit.replace(/s$/, "")}`);
    add(`2 ${p.unit}`);
  }
  return out;
}

// Does an option match what's typed? Every word must appear in its value, hint
// or keywords, so "q8 prn" finds "every 8 hours as needed".
export function matchesPick(option: PickOption, query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return true;
  const hay = [option.value, option.hint ?? "", ...(option.keywords ?? [])].join(" ").toLowerCase();
  return terms.every((t) => hay.includes(t));
}
