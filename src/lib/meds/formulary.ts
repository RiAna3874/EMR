// The clinic's prescribable products: strength, how they're dispensed, and the
// default sig the prescription composer fills in. Codes are "RX:<RxNorm>", the
// same codes the Orders catalog and the medication list use.

export type Product = {
  rxnorm: string;
  display: string;
  keywords?: string[];
  // Strength of one tablet, capsule or puff in mg (mcg / 1000), when doses are
  // counted in units; lets the composer work out quantity and days supply.
  unitMg?: number;
  unit: string; // what is dispensed: "tablets", "capsules", "inhaler"…
  countable: boolean; // false for inhalers, pens, creams: quantity is packages
  dose: string;
  route: string;
  frequency: string;
  prnReason?: string;
  days: number; // default course or supply length
  quantity: string;
  refills: number;
  otc?: boolean;
};

const tab = (p: Omit<Product, "unit" | "countable"> & { unit?: string }): Product => ({ unit: "tablets", countable: true, ...p });
const cap = (p: Omit<Product, "unit" | "countable">): Product => ({ ...p, unit: "capsules", countable: true });
const pkg = (p: Omit<Product, "countable">): Product => ({ ...p, countable: false });

export const FORMULARY: Product[] = [
  // Antibiotics and short courses
  cap({ rxnorm: "723", display: "Amoxicillin 500 mg capsule", keywords: ["antibiotic"], unitMg: 500, dose: "500 mg", route: "oral", frequency: "three times daily", days: 10, quantity: "30 capsules", refills: 0 }),
  tab({ rxnorm: "562251", display: "Amoxicillin-clavulanate 875-125 mg tablet", keywords: ["augmentin", "antibiotic"], dose: "1 tablet", route: "oral", frequency: "twice daily", days: 7, quantity: "14 tablets", refills: 0 }),
  cap({ rxnorm: "309114", display: "Cephalexin 500 mg capsule", keywords: ["keflex", "antibiotic"], unitMg: 500, dose: "500 mg", route: "oral", frequency: "four times daily", days: 7, quantity: "28 capsules", refills: 0 }),
  tab({ rxnorm: "248656", display: "Azithromycin 250 mg tablet", keywords: ["z-pak", "zithromax", "antibiotic"], unitMg: 250, dose: "500 mg day 1, then 250 mg", route: "oral", frequency: "once daily", days: 5, quantity: "6 tablets", refills: 0 }),
  tab({ rxnorm: "197517", display: "Clarithromycin 500 mg tablet", keywords: ["biaxin", "antibiotic"], unitMg: 500, dose: "500 mg", route: "oral", frequency: "twice daily", days: 10, quantity: "20 tablets", refills: 0 }),
  cap({ rxnorm: "1648755", display: "Nitrofurantoin monohydrate 100 mg capsule", keywords: ["macrobid", "uti", "antibiotic"], unitMg: 100, dose: "100 mg", route: "oral", frequency: "twice daily", days: 5, quantity: "10 capsules", refills: 0 }),
  tab({ rxnorm: "198335", display: "Sulfamethoxazole-trimethoprim DS 800-160 mg tablet", keywords: ["bactrim", "smx-tmp", "antibiotic"], dose: "1 tablet", route: "oral", frequency: "twice daily", days: 3, quantity: "6 tablets", refills: 0 }),
  tab({ rxnorm: "312617", display: "Prednisone 20 mg tablet", keywords: ["steroid"], unitMg: 20, dose: "40 mg", route: "oral", frequency: "once daily", days: 5, quantity: "10 tablets", refills: 0 }),

  // Pain, nausea, spasm
  tab({ rxnorm: "197806", display: "Ibuprofen 600 mg tablet", keywords: ["nsaid", "pain"], unitMg: 600, dose: "600 mg", route: "oral", frequency: "every 6 hours as needed with food", prnReason: "pain", days: 7, quantity: "30 tablets", refills: 0 }),
  tab({ rxnorm: "198013", display: "Naproxen 500 mg tablet", keywords: ["nsaid", "pain", "aleve"], unitMg: 500, dose: "500 mg", route: "oral", frequency: "twice daily as needed with food", prnReason: "pain", days: 14, quantity: "28 tablets", refills: 0 }),
  tab({ rxnorm: "313782", display: "Acetaminophen 500 mg tablet", keywords: ["tylenol", "paracetamol", "pain"], unitMg: 500, dose: "1000 mg", route: "oral", frequency: "every 8 hours as needed", prnReason: "pain", days: 10, quantity: "60 tablets", refills: 0, otc: true }),
  tab({ rxnorm: "993503", display: "Acetaminophen-codeine 300-30 mg tablet", keywords: ["tylenol 3", "opioid", "pain"], dose: "1 tablet", route: "oral", frequency: "every 6 hours as needed", prnReason: "severe pain", days: 3, quantity: "12 tablets", refills: 0 }),
  tab({ rxnorm: "1049621", display: "Oxycodone 5 mg tablet", keywords: ["opioid", "pain", "roxicodone"], unitMg: 5, dose: "5 mg", route: "oral", frequency: "every 6 hours as needed", prnReason: "severe pain", days: 3, quantity: "12 tablets", refills: 0 }),
  tab({ rxnorm: "835603", display: "Tramadol 50 mg tablet", keywords: ["opioid", "pain", "ultram"], unitMg: 50, dose: "50 mg", route: "oral", frequency: "every 6 hours as needed", prnReason: "pain", days: 5, quantity: "20 tablets", refills: 0 }),
  tab({ rxnorm: "828320", display: "Cyclobenzaprine 10 mg tablet", keywords: ["flexeril", "muscle relaxant", "spasm"], unitMg: 10, dose: "10 mg", route: "oral", frequency: "nightly as needed", prnReason: "muscle spasm", days: 10, quantity: "10 tablets", refills: 0 }),
  tab({ rxnorm: "312086", display: "Ondansetron 4 mg ODT", keywords: ["zofran", "nausea"], unitMg: 4, dose: "4 mg", route: "oral", frequency: "every 8 hours as needed", prnReason: "nausea", days: 4, quantity: "12 tablets", refills: 0 }),
  tab({ rxnorm: "313461", display: "Sumatriptan 50 mg tablet", keywords: ["imitrex", "migraine"], unitMg: 50, dose: "50 mg", route: "oral", frequency: "at migraine onset, may repeat in 2 hours", prnReason: "migraine", days: 30, quantity: "9 tablets", refills: 2 }),

  // Diabetes
  tab({ rxnorm: "861007", display: "Metformin 500 mg tablet", keywords: ["diabetes", "glucophage"], unitMg: 500, dose: "500 mg", route: "oral", frequency: "twice daily with meals", days: 30, quantity: "60 tablets", refills: 3 }),
  tab({ rxnorm: "861004", display: "Metformin 1000 mg tablet", keywords: ["diabetes", "glucophage"], unitMg: 1000, dose: "1000 mg", route: "oral", frequency: "twice daily with meals", days: 90, quantity: "180 tablets", refills: 3 }),
  tab({ rxnorm: "310488", display: "Glipizide 5 mg tablet", keywords: ["diabetes", "sulfonylurea"], unitMg: 5, dose: "5 mg", route: "oral", frequency: "once daily with breakfast", days: 90, quantity: "90 tablets", refills: 3 }),
  pkg({ rxnorm: "847232", display: "Insulin glargine 100 unit/mL pen", keywords: ["diabetes", "lantus", "basal"], unit: "pens (3 mL)", dose: "10 units", route: "subcutaneous", frequency: "nightly", days: 30, quantity: "5 pens", refills: 3 }),
  pkg({ rxnorm: "1991306", display: "Semaglutide 0.5 mg/dose pen", keywords: ["ozempic", "glp-1", "diabetes", "weight"], unit: "pen", dose: "0.5 mg", route: "subcutaneous", frequency: "once weekly", days: 28, quantity: "1 pen", refills: 3 }),

  // Heart and blood pressure
  tab({ rxnorm: "314076", display: "Lisinopril 10 mg tablet", keywords: ["ace inhibitor", "hypertension", "blood pressure"], unitMg: 10, dose: "10 mg", route: "oral", frequency: "once daily", days: 30, quantity: "30 tablets", refills: 3 }),
  tab({ rxnorm: "314077", display: "Lisinopril 20 mg tablet", keywords: ["ace inhibitor", "hypertension", "blood pressure"], unitMg: 20, dose: "20 mg", route: "oral", frequency: "once daily", days: 90, quantity: "90 tablets", refills: 3 }),
  tab({ rxnorm: "979485", display: "Losartan 50 mg tablet", keywords: ["arb", "hypertension", "blood pressure", "cozaar"], unitMg: 50, dose: "50 mg", route: "oral", frequency: "once daily", days: 90, quantity: "90 tablets", refills: 3 }),
  tab({ rxnorm: "197361", display: "Amlodipine 5 mg tablet", keywords: ["hypertension", "blood pressure", "norvasc"], unitMg: 5, dose: "5 mg", route: "oral", frequency: "once daily", days: 30, quantity: "30 tablets", refills: 3 }),
  tab({ rxnorm: "308135", display: "Amlodipine 10 mg tablet", keywords: ["hypertension", "blood pressure", "norvasc"], unitMg: 10, dose: "10 mg", route: "oral", frequency: "once daily", days: 90, quantity: "90 tablets", refills: 3 }),
  tab({ rxnorm: "866436", display: "Metoprolol succinate ER 50 mg tablet", keywords: ["beta blocker", "toprol", "rate control"], unitMg: 50, dose: "50 mg", route: "oral", frequency: "once daily", days: 90, quantity: "90 tablets", refills: 3 }),
  tab({ rxnorm: "313988", display: "Furosemide 40 mg tablet", keywords: ["lasix", "diuretic", "heart failure"], unitMg: 40, dose: "40 mg", route: "oral", frequency: "once daily", days: 90, quantity: "90 tablets", refills: 3 }),
  tab({ rxnorm: "1364445", display: "Apixaban 5 mg tablet", keywords: ["eliquis", "anticoagulant", "atrial fibrillation"], unitMg: 5, dose: "5 mg", route: "oral", frequency: "twice daily", days: 90, quantity: "180 tablets", refills: 3 }),
  tab({ rxnorm: "243670", display: "Aspirin 81 mg tablet", keywords: ["antiplatelet", "baby aspirin"], unitMg: 81, dose: "81 mg", route: "oral", frequency: "once daily", days: 90, quantity: "90 tablets", refills: 3, otc: true }),
  tab({ rxnorm: "617310", display: "Atorvastatin 20 mg tablet", keywords: ["statin", "cholesterol", "lipitor"], unitMg: 20, dose: "20 mg", route: "oral", frequency: "nightly", days: 30, quantity: "30 tablets", refills: 3 }),
  tab({ rxnorm: "617311", display: "Atorvastatin 40 mg tablet", keywords: ["statin", "cholesterol", "lipitor"], unitMg: 40, dose: "40 mg", route: "oral", frequency: "nightly", days: 90, quantity: "90 tablets", refills: 3 }),
  tab({ rxnorm: "859751", display: "Rosuvastatin 20 mg tablet", keywords: ["statin", "cholesterol", "crestor"], unitMg: 20, dose: "20 mg", route: "oral", frequency: "once daily", days: 90, quantity: "90 tablets", refills: 3 }),

  // Lungs
  pkg({ rxnorm: "745679", display: "Albuterol HFA 90 mcg inhaler", keywords: ["inhaler", "asthma", "copd", "rescue"], unit: "inhaler (200 puffs)", dose: "2 puffs", route: "inhaled", frequency: "every 4 hours as needed", prnReason: "wheezing or shortness of breath", days: 30, quantity: "1 inhaler", refills: 1 }),
  pkg({ rxnorm: "896188", display: "Fluticasone-salmeterol 250-50 mcg inhaler", keywords: ["advair", "asthma", "copd"], unit: "inhaler (60 doses)", dose: "1 puff", route: "inhaled", frequency: "twice daily", days: 30, quantity: "1 inhaler", refills: 5 }),
  pkg({ rxnorm: "485032", display: "Tiotropium 18 mcg inhalation capsule", keywords: ["spiriva", "copd"], unit: "capsules with device", dose: "18 mcg", route: "inhaled", frequency: "once daily", days: 30, quantity: "30 capsules", refills: 5 }),
  pkg({ rxnorm: "727316", display: "Epinephrine 0.3 mg auto-injector", keywords: ["epipen", "anaphylaxis", "allergy"], unit: "2-pack", dose: "0.3 mg", route: "intramuscular", frequency: "once as needed, may repeat in 5 to 15 minutes", prnReason: "anaphylaxis", days: 365, quantity: "1 two-pack", refills: 1 }),

  // Other chronic
  tab({ rxnorm: "966247", display: "Levothyroxine 50 mcg tablet", keywords: ["thyroid", "synthroid"], unitMg: 0.05, dose: "50 mcg", route: "oral", frequency: "once daily before breakfast", days: 30, quantity: "30 tablets", refills: 3 }),
  tab({ rxnorm: "966222", display: "Levothyroxine 75 mcg tablet", keywords: ["thyroid", "synthroid"], unitMg: 0.075, dose: "75 mcg", route: "oral", frequency: "once daily before breakfast", days: 90, quantity: "90 tablets", refills: 3 }),
  tab({ rxnorm: "310325", display: "Ferrous sulfate 325 mg tablet", keywords: ["iron", "anemia"], unitMg: 325, dose: "325 mg", route: "oral", frequency: "once daily", days: 90, quantity: "90 tablets", refills: 3, otc: true }),
  cap({ rxnorm: "198053", display: "Omeprazole 20 mg capsule", keywords: ["ppi", "gerd", "reflux", "prilosec"], unitMg: 20, dose: "20 mg", route: "oral", frequency: "once daily before breakfast", days: 90, quantity: "90 capsules", refills: 3 }),
  tab({ rxnorm: "312940", display: "Sertraline 50 mg tablet", keywords: ["ssri", "zoloft", "anxiety", "depression"], unitMg: 50, dose: "50 mg", route: "oral", frequency: "once daily", days: 90, quantity: "90 tablets", refills: 3 }),
  tab({ rxnorm: "904420", display: "Alendronate 70 mg tablet", keywords: ["fosamax", "osteoporosis", "bisphosphonate"], unitMg: 70, dose: "70 mg", route: "oral", frequency: "once weekly, upright with water, 30 minutes before food", days: 84, quantity: "12 tablets", refills: 3 }),
  tab({ rxnorm: "997223", display: "Donepezil 10 mg tablet", keywords: ["aricept", "dementia"], unitMg: 10, dose: "10 mg", route: "oral", frequency: "nightly", days: 90, quantity: "90 tablets", refills: 3 }),
  cap({ rxnorm: "636676", display: "Cholecalciferol 2000 unit capsule", keywords: ["vitamin d"], dose: "2000 units", route: "oral", frequency: "once daily", days: 90, quantity: "90 capsules", refills: 3, otc: true }),
  cap({ rxnorm: "863669", display: "Tamsulosin 0.4 mg capsule", keywords: ["flomax", "bph", "prostate"], unitMg: 0.4, dose: "0.4 mg", route: "oral", frequency: "nightly", days: 90, quantity: "90 capsules", refills: 3 }),
  tab({ rxnorm: "197320", display: "Allopurinol 300 mg tablet", keywords: ["gout", "zyloprim", "uric acid"], unitMg: 300, dose: "300 mg", route: "oral", frequency: "once daily", days: 90, quantity: "90 tablets", refills: 3 }),
  tab({ rxnorm: "197319", display: "Allopurinol 100 mg tablet", keywords: ["gout", "zyloprim", "uric acid"], unitMg: 100, dose: "100 mg", route: "oral", frequency: "once daily", days: 90, quantity: "90 tablets", refills: 3 }),
  pkg({ rxnorm: "199890", display: "Tretinoin 0.025% cream", keywords: ["retin-a", "acne"], unit: "tube (45 g)", dose: "thin layer", route: "topical", frequency: "nightly", days: 60, quantity: "1 tube", refills: 2 }),
];

export const productByCode = new Map(FORMULARY.map((p) => [`RX:${p.rxnorm}`, p]));
export const productByName = new Map(FORMULARY.map((p) => [p.display.toLowerCase(), p]));

export const productFor = (m: { rxnorm?: string | null; drug?: string; code?: string | null }) =>
  (m.code ? productByCode.get(m.code) : undefined) ??
  (m.rxnorm ? productByCode.get(`RX:${m.rxnorm}`) : undefined) ??
  (m.drug ? productByName.get(m.drug.toLowerCase()) : undefined);
