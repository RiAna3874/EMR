// Drug knowledge for prescribing checks: ingredients and their classes, dose
// limits, kidney and older-adult cautions, interactions, and what a refill
// protocol wants to see. A small hand-written table for a synthetic clinic, not a
// licensed drug database; ingredients are found by name, so the checks work for
// any medication on the list, including ones documented as free text. Common
// Bangladeshi brand names (Napa, Seclo, ...) match their generic.

export type Monitor = { label: string; codes: string[]; months: number };

export type Ingredient = {
  id: string;
  name: string;
  match: RegExp;
  classes: string[];
  controlled?: boolean; // a narcotic or psychotropic: no refills, smallest amount needed
  maxDailyMg?: number;
  maxDailyMgOlder?: number; // 65 and over
  renal?: { stopBelow?: number; cautionBelow?: number; stop?: string; caution?: string };
  olderAdult?: string; // a Beers-style caution at 65 and over
  monitor?: Monitor[];
};

const BMP: Monitor = { label: "Potassium and creatinine", codes: ["51990-0", "24323-8", "2823-3", "2160-0"], months: 12 };
const LIPIDS: Monitor = { label: "Lipid panel", codes: ["57698-3", "13457-7"], months: 12 };

export const INGREDIENTS: Ingredient[] = [
  { id: "amoxicillin", name: "amoxicillin", match: /amoxicillin|moxacil|fimoxyl/i, classes: ["penicillin", "beta-lactam"] },
  { id: "cephalexin", name: "cephalexin", match: /cephalexin/i, classes: ["cephalosporin", "beta-lactam"] },
  { id: "azithromycin", name: "azithromycin", match: /azithromycin|zimax|azithrocin/i, classes: ["macrolide", "qt-prolonging"] },
  { id: "clarithromycin", name: "clarithromycin", match: /clarithromycin/i, classes: ["macrolide", "qt-prolonging", "cyp3a4-inhibitor"], maxDailyMg: 1000 },
  {
    id: "nitrofurantoin", name: "nitrofurantoin", match: /nitrofurantoin/i, classes: [],
    renal: { cautionBelow: 30, caution: "nitrofurantoin is less effective and more toxic." },
  },
  { id: "sulfamethoxazole", name: "sulfamethoxazole-trimethoprim", match: /sulfamethoxazole|bactrim/i, classes: ["sulfonamide", "potassium-raising"] },
  { id: "prednisone", name: "prednisone", match: /prednisone/i, classes: ["corticosteroid"] },
  {
    id: "metformin", name: "metformin", match: /metformin/i, classes: ["glucose-lowering"], maxDailyMg: 2550,
    renal: { stopBelow: 30, cautionBelow: 45, stop: "Metformin is contraindicated", caution: "don't start metformin below 45." },
    monitor: [
      { label: "Hemoglobin A1c", codes: ["4548-4"], months: 6 },
      { label: "Kidney function (eGFR)", codes: ["33914-3", "2160-0"], months: 12 },
    ],
  },
  { id: "glipizide", name: "glipizide", match: /glipizide/i, classes: ["sulfonylurea", "glucose-lowering"], maxDailyMg: 40, olderAdult: "sulfonylureas cause prolonged hypoglycemia." },
  { id: "insulin", name: "insulin", match: /insulin/i, classes: ["insulin", "glucose-lowering"], monitor: [{ label: "Hemoglobin A1c", codes: ["4548-4"], months: 6 }] },
  { id: "semaglutide", name: "semaglutide", match: /semaglutide/i, classes: ["glp1", "glucose-lowering"] },
  { id: "lisinopril", name: "lisinopril", match: /lisinopril/i, classes: ["ace-inhibitor", "potassium-raising"], maxDailyMg: 80, monitor: [BMP] },
  { id: "losartan", name: "losartan", match: /losartan|osartil|angilock/i, classes: ["arb", "potassium-raising"], maxDailyMg: 100, monitor: [BMP] },
  { id: "amlodipine", name: "amlodipine", match: /amlodipine|camlodin|amdocal/i, classes: ["calcium-channel-blocker"], maxDailyMg: 10 },
  { id: "metoprolol", name: "metoprolol", match: /metoprolol/i, classes: ["beta-blocker"], maxDailyMg: 400 },
  { id: "furosemide", name: "furosemide", match: /furosemide/i, classes: ["loop-diuretic"], monitor: [{ ...BMP, months: 6 }] },
  { id: "atorvastatin", name: "atorvastatin", match: /atorvastatin/i, classes: ["statin"], maxDailyMg: 80, monitor: [LIPIDS] },
  { id: "rosuvastatin", name: "rosuvastatin", match: /rosuvastatin/i, classes: ["statin"], maxDailyMg: 40, monitor: [LIPIDS] },
  { id: "apixaban", name: "apixaban", match: /apixaban/i, classes: ["anticoagulant"], maxDailyMg: 20, monitor: [{ label: "CBC and creatinine", codes: ["58410-2", "718-7"], months: 12 }, BMP] },
  { id: "warfarin", name: "warfarin", match: /warfarin/i, classes: ["anticoagulant"], monitor: [{ label: "INR", codes: ["5902-2"], months: 1 }] },
  { id: "aspirin", name: "aspirin", match: /aspirin|ecosprin/i, classes: ["antiplatelet", "salicylate"] },
  { id: "clopidogrel", name: "clopidogrel", match: /clopidogrel/i, classes: ["antiplatelet"] },
  {
    id: "ibuprofen", name: "ibuprofen", match: /ibuprofen/i, classes: ["nsaid"], maxDailyMg: 3200,
    renal: { cautionBelow: 45, caution: "NSAIDs can worsen kidney function." },
    olderAdult: "avoid regular NSAID use; GI bleeding and kidney injury are more likely.",
  },
  {
    id: "naproxen", name: "naproxen", match: /naproxen/i, classes: ["nsaid"], maxDailyMg: 1500,
    renal: { cautionBelow: 45, caution: "NSAIDs can worsen kidney function." },
    olderAdult: "avoid regular NSAID use; GI bleeding and kidney injury are more likely.",
  },
  { id: "acetaminophen", name: "acetaminophen", match: /acetaminophen|paracetamol|\bnapa\b|\bace\b/i, classes: ["analgesic"], maxDailyMg: 4000, maxDailyMgOlder: 3000 },
  { id: "codeine", name: "codeine", match: /codeine/i, classes: ["opioid", "codeine", "cns-depressant"], controlled: true, olderAdult: "opioids raise fall and confusion risk." },
  { id: "oxycodone", name: "oxycodone", match: /oxycodone/i, classes: ["opioid", "cns-depressant"], controlled: true, olderAdult: "opioids raise fall and confusion risk." },
  {
    id: "tramadol", name: "tramadol", match: /tramadol/i, classes: ["opioid", "serotonergic", "cns-depressant"], controlled: true, maxDailyMg: 400,
    renal: { cautionBelow: 30, caution: "give tramadol no more than every 12 hours (max 200 mg a day)." },
  },
  {
    id: "cyclobenzaprine", name: "cyclobenzaprine", match: /cyclobenzaprine/i, classes: ["muscle-relaxant", "cns-depressant", "serotonergic"], maxDailyMg: 30,
    olderAdult: "muscle relaxants are anticholinergic and sedating; poorly tolerated.",
  },
  { id: "ondansetron", name: "ondansetron", match: /ondansetron/i, classes: ["antiemetic", "qt-prolonging", "serotonergic"], maxDailyMg: 24 },
  { id: "sertraline", name: "sertraline", match: /sertraline/i, classes: ["ssri", "serotonergic"], maxDailyMg: 200 },
  { id: "sumatriptan", name: "sumatriptan", match: /sumatriptan/i, classes: ["triptan", "serotonergic"], maxDailyMg: 200 },
  { id: "levothyroxine", name: "levothyroxine", match: /levothyroxine|thyrox/i, classes: ["thyroid"], monitor: [{ label: "TSH", codes: ["3016-3"], months: 12 }] },
  { id: "iron", name: "iron", match: /ferrous|iron/i, classes: ["iron"] },
  { id: "calcium", name: "calcium", match: /calcium carbonate|calcium citrate/i, classes: ["calcium"] },
  { id: "omeprazole", name: "omeprazole", match: /(?<!es)omeprazole|seclo|losectil/i, classes: ["ppi"] },
  { id: "albuterol", name: "albuterol", match: /albuterol|salbutamol|azmasol|ventolin/i, classes: ["saba"] },
  { id: "fluticasone", name: "fluticasone-salmeterol", match: /fluticasone/i, classes: ["inhaled-steroid", "laba"] },
  { id: "tiotropium", name: "tiotropium", match: /tiotropium/i, classes: ["lama"] },
  { id: "epinephrine", name: "epinephrine", match: /epinephrine/i, classes: [] },
  {
    id: "alendronate", name: "alendronate", match: /alendronate/i, classes: ["bisphosphonate"],
    renal: { stopBelow: 35, stop: "Alendronate is not recommended" },
  },
  { id: "donepezil", name: "donepezil", match: /donepezil/i, classes: ["cholinesterase-inhibitor"] },
  { id: "cholecalciferol", name: "vitamin D", match: /cholecalciferol|vitamin d/i, classes: [] },
  { id: "tamsulosin", name: "tamsulosin", match: /tamsulosin/i, classes: ["alpha-blocker"] },
  { id: "tretinoin", name: "tretinoin", match: /tretinoin/i, classes: ["retinoid"] },
  { id: "esomeprazole", name: "esomeprazole", match: /esomeprazole|maxpro|sergel|nexum/i, classes: ["ppi"] },
  { id: "pantoprazole", name: "pantoprazole", match: /pantoprazole|pantonix/i, classes: ["ppi"] },
  { id: "fexofenadine", name: "fexofenadine", match: /fexofenadine|\bfexo\b|telfast/i, classes: ["antihistamine"], maxDailyMg: 180 },
  { id: "cetirizine", name: "cetirizine", match: /cetirizine|alatrol/i, classes: ["antihistamine"], maxDailyMg: 10 },
  { id: "montelukast", name: "montelukast", match: /montelukast|monas/i, classes: [], maxDailyMg: 10 },
  { id: "domperidone", name: "domperidone", match: /domperidone|omidon/i, classes: ["antiemetic", "qt-prolonging"], maxDailyMg: 30, olderAdult: "domperidone raises the risk of heart rhythm problems; use the lowest dose briefly." },
  { id: "metronidazole", name: "metronidazole", match: /metronidazole|flagyl|filmet|amodis/i, classes: ["nitroimidazole"], maxDailyMg: 4000 },
  { id: "ciprofloxacin", name: "ciprofloxacin", match: /ciprofloxacin|ciprocin/i, classes: ["fluoroquinolone", "qt-prolonging"], maxDailyMg: 1500 },
  { id: "cefixime", name: "cefixime", match: /cefixime|cef-3/i, classes: ["cephalosporin", "beta-lactam"], maxDailyMg: 400 },
  { id: "flucloxacillin", name: "flucloxacillin", match: /flucloxacillin/i, classes: ["penicillin", "beta-lactam"], maxDailyMg: 4000 },
  { id: "gliclazide", name: "gliclazide", match: /gliclazide/i, classes: ["sulfonylurea", "glucose-lowering"], maxDailyMg: 320, olderAdult: "sulfonylureas cause prolonged hypoglycemia." },
  { id: "bisoprolol", name: "bisoprolol", match: /bisoprolol|bisocor|concor/i, classes: ["beta-blocker"], maxDailyMg: 20 },
  { id: "albendazole", name: "albendazole", match: /albendazole/i, classes: [] },
  { id: "ors", name: "oral rehydration salts", match: /oral rehydration|\bors\b|orsaline/i, classes: [] },
  {
    id: "allopurinol", name: "allopurinol", match: /allopurinol/i, classes: ["xanthine-oxidase-inhibitor"], maxDailyMg: 800,
    renal: { cautionBelow: 30, caution: "start allopurinol low and titrate slowly." },
    monitor: [{ label: "Uric acid", codes: ["3084-1"], months: 12 }],
  },
];

export function ingredientsOf(drug: string): Ingredient[] {
  return INGREDIENTS.filter((i) => i.match.test(drug));
}

export const classesOf = (drug: string) => [...new Set(ingredientsOf(drug).flatMap((i) => i.classes))];

// Allergy entries are free text; map common ones to the drug classes they cover.
const allergyClasses: [RegExp, string[]][] = [
  [/penicillin|amoxicillin|ampicillin|augmentin|flucloxacillin|moxacil|fimoxyl/i, ["penicillin"]],
  [/cephalosporin|cephalexin|cefdinir|ceftriaxone|cefixime|cefuroxime|keflex/i, ["cephalosporin"]],
  [/quinolone|ciprofloxacin|levofloxacin|ofloxacin/i, ["fluoroquinolone"]],
  [/metronidazole|flagyl/i, ["nitroimidazole"]],
  [/sulfa|sulfamethoxazole|bactrim/i, ["sulfonamide"]],
  [/codeine/i, ["codeine"]],
  [/morphine|oxycodone|hydrocodone|opioid/i, ["opioid"]],
  [/nsaid|ibuprofen|naproxen|diclofenac|ketorolac/i, ["nsaid"]],
  [/aspirin|salicylate/i, ["salicylate", "nsaid"]],
  [/macrolide|azithromycin|erythromycin|clarithromycin/i, ["macrolide"]],
  [/statin/i, ["statin"]],
  [/ace inhibitor|lisinopril|enalapril/i, ["ace-inhibitor"]],
  [/contrast|iodine/i, ["iodinated-contrast"]],
];

export function classesForAllergy(substance: string) {
  return allergyClasses.flatMap(([re, classes]) => (re.test(substance) ? classes : []));
}

export type Interaction = { a: string; b: string; level: "stop" | "caution"; text: string };

// `a` and `b` are an ingredient id or "class:<class>". Order doesn't matter.
export const INTERACTIONS: Interaction[] = [
  { a: "class:nsaid", b: "class:anticoagulant", level: "stop", text: "Major bleeding risk with an NSAID and an anticoagulant. Prefer acetaminophen; if an NSAID is needed, keep it short and add a PPI." },
  { a: "class:nsaid", b: "class:antiplatelet", level: "caution", text: "Higher GI bleeding risk; ibuprofen can also blunt aspirin's heart protection." },
  { a: "class:anticoagulant", b: "class:antiplatelet", level: "caution", text: "Added bleeding risk. Confirm both are still indicated." },
  { a: "class:ace-inhibitor", b: "class:arb", level: "stop", text: "Dual RAAS blockade raises the risk of hyperkalemia and kidney injury without added benefit." },
  { a: "sulfamethoxazole", b: "class:potassium-raising", level: "caution", text: "Trimethoprim raises potassium; check a potassium level if the course is more than a few days." },
  { a: "class:nsaid", b: "class:ace-inhibitor", level: "caution", text: "NSAIDs blunt the blood pressure effect and can cause kidney injury, especially with a diuretic." },
  { a: "class:nsaid", b: "class:arb", level: "caution", text: "NSAIDs blunt the blood pressure effect and can cause kidney injury, especially with a diuretic." },
  { a: "class:nsaid", b: "class:corticosteroid", level: "caution", text: "Higher risk of GI bleeding and ulcers together." },
  { a: "class:corticosteroid", b: "class:glucose-lowering", level: "caution", text: "Steroids raise blood glucose; check sugars more often during the course." },
  { a: "clarithromycin", b: "atorvastatin", level: "stop", text: "Clarithromycin raises atorvastatin levels (rhabdomyolysis risk). Hold the statin during the course or use azithromycin." },
  { a: "clarithromycin", b: "class:anticoagulant", level: "caution", text: "Clarithromycin raises anticoagulant levels and bleeding risk." },
  { a: "class:opioid", b: "class:muscle-relaxant", level: "caution", text: "Additive sedation and breathing suppression with an opioid and a muscle relaxant." },
  { a: "class:serotonergic", b: "class:serotonergic", level: "caution", text: "Two serotonergic drugs: watch for serotonin syndrome (agitation, tremor, fever)." },
  { a: "class:qt-prolonging", b: "class:qt-prolonging", level: "caution", text: "Both prolong the QT interval; consider an ECG if there are other risk factors." },
  { a: "levothyroxine", b: "class:iron", level: "caution", text: "Iron reduces levothyroxine absorption. Take them at least 4 hours apart." },
  { a: "levothyroxine", b: "class:calcium", level: "caution", text: "Calcium reduces levothyroxine absorption. Take them at least 4 hours apart." },
  { a: "class:sulfonylurea", b: "class:insulin", level: "caution", text: "Higher risk of hypoglycemia together." },
  { a: "metronidazole", b: "warfarin", level: "stop", text: "Metronidazole sharply raises the INR on warfarin. Avoid, or reduce the warfarin dose and check the INR within a few days." },
  { a: "ciprofloxacin", b: "warfarin", level: "caution", text: "Ciprofloxacin can raise the INR on warfarin; check it during the course." },
  { a: "ciprofloxacin", b: "class:iron", level: "caution", text: "Iron blocks ciprofloxacin absorption. Take ciprofloxacin 2 hours before or 6 hours after." },
  { a: "ciprofloxacin", b: "class:calcium", level: "caution", text: "Calcium blocks ciprofloxacin absorption. Take ciprofloxacin 2 hours before or 6 hours after." },
  { a: "ciprofloxacin", b: "class:corticosteroid", level: "caution", text: "Higher risk of tendon rupture with a fluoroquinolone and a steroid, especially over 60." },
];

// Two different drugs from one of these classes is usually a duplicate.
export const DUPLICATE_CLASSES: Record<string, string> = {
  statin: "statins",
  "ace-inhibitor": "ACE inhibitors",
  arb: "ARBs",
  ssri: "SSRIs",
  ppi: "proton pump inhibitors",
  antihistamine: "antihistamines",
  fluoroquinolone: "fluoroquinolones",
  nsaid: "NSAIDs",
  "beta-blocker": "beta blockers",
  anticoagulant: "anticoagulants",
  sulfonylurea: "sulfonylureas",
  opioid: "opioids",
};

const matchesKey = (ing: Ingredient, key: string) => (key.startsWith("class:") ? ing.classes.includes(key.slice(6)) : ing.id === key);

// The interactions between two drugs, by name.
export function interactionsBetween(drugA: string, drugB: string): Interaction[] {
  const as = ingredientsOf(drugA);
  const bs = ingredientsOf(drugB);
  const out: Interaction[] = [];
  for (const rule of INTERACTIONS) {
    const hit =
      as.some((x) => bs.some((y) => x.id !== y.id && ((matchesKey(x, rule.a) && matchesKey(y, rule.b)) || (matchesKey(x, rule.b) && matchesKey(y, rule.a)))));
    if (hit && !out.includes(rule)) out.push(rule);
  }
  return out;
}
