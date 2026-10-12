// Orderables: everything a clinician can order from the Orders tab. Lab codes
// match the DiagnosticReport codes results file under (seeded and imported), so
// a result arriving for an ordered panel completes that order.
import type { OrderType } from "@prisma/client";

export type MedDefaults = { dose: string; route: string; frequency: string; quantity: string; refills: number };

export type Orderable = {
  code: string;
  display: string;
  type: OrderType;
  keywords?: string[];
  // Labs: no repeat sooner than this, unless the clinician means it.
  repeatDays?: number;
  // Medications: what the composer fills in, and allergy classes the drug belongs to.
  med?: MedDefaults & { classes: string[] };
  // Imaging with iodinated contrast.
  contrast?: boolean;
  specimen?: string;
  // Labs: other report or LOINC codes that also satisfy this order (a CMP covers a BMP).
  resultCodes?: string[];
};

export const ORDERABLES: Orderable[] = [
  // Labs
  { code: "58410-2", display: "Complete blood count (CBC)", type: "lab", keywords: ["cbc", "hemoglobin", "platelets", "wbc"], repeatDays: 7, specimen: "Blood, lavender top" },
  { code: "24323-8", display: "Comprehensive metabolic panel (CMP)", type: "lab", keywords: ["cmp", "chem", "electrolytes", "liver", "kidney", "creatinine"], repeatDays: 7, specimen: "Blood, gold top" },
  { code: "51990-0", display: "Basic metabolic panel (BMP)", type: "lab", keywords: ["bmp", "chem 7", "electrolytes", "potassium"], repeatDays: 3, resultCodes: ["24323-8"], specimen: "Blood, gold top" },
  { code: "57698-3", display: "Lipid panel", type: "lab", keywords: ["cholesterol", "ldl", "triglycerides", "lipids"], repeatDays: 60, specimen: "Blood, gold top (fasting preferred)" },
  { code: "4548-4", display: "Hemoglobin A1c", type: "lab", keywords: ["a1c", "hba1c", "diabetes", "glycated"], repeatDays: 80, specimen: "Blood, lavender top" },
  { code: "3016-3", display: "TSH", type: "lab", keywords: ["thyroid", "tsh"], repeatDays: 42, specimen: "Blood, gold top" },
  { code: "local:thyroid", display: "Free T4", type: "lab", keywords: ["thyroid", "t4", "ft4"], repeatDays: 42, resultCodes: ["3024-7"], specimen: "Blood, gold top" },
  { code: "local:iron", display: "Iron studies (iron, TIBC, ferritin)", type: "lab", keywords: ["iron", "ferritin", "tibc", "anemia"], repeatDays: 30, specimen: "Blood, gold top" },
  { code: "1989-3", display: "Vitamin D, 25-hydroxy", type: "lab", keywords: ["vitamin d", "25-oh"], repeatDays: 80, specimen: "Blood, gold top" },
  { code: "2132-9", display: "Vitamin B12", type: "lab", keywords: ["b12", "cobalamin"], repeatDays: 80, specimen: "Blood, gold top" },
  { code: "1988-5", display: "C-reactive protein", type: "lab", keywords: ["crp", "inflammation"], repeatDays: 2, specimen: "Blood, gold top" },
  { code: "30341-2", display: "Erythrocyte sedimentation rate", type: "lab", keywords: ["esr", "sed rate"], repeatDays: 2, specimen: "Blood, lavender top" },
  { code: "24356-8", display: "Urinalysis with microscopy", type: "lab", keywords: ["ua", "urine"], repeatDays: 1, specimen: "Urine, clean catch" },
  { code: "14959-1", display: "Urine microalbumin/creatinine ratio", type: "lab", keywords: ["uacr", "microalbumin", "kidney", "diabetes"], repeatDays: 80, specimen: "Urine, random" },
  { code: "30934-4", display: "BNP", type: "lab", keywords: ["bnp", "heart failure", "natriuretic"], repeatDays: 1, specimen: "Blood, lavender top" },
  { code: "2857-1", display: "PSA, total", type: "lab", keywords: ["psa", "prostate"], repeatDays: 180, specimen: "Blood, gold top" },
  { code: "5902-2", display: "Prothrombin time / INR", type: "lab", keywords: ["pt", "inr", "coag", "warfarin"], repeatDays: 1, specimen: "Blood, light blue top" },
  { code: "3084-1", display: "Uric acid", type: "lab", keywords: ["urate", "gout"], repeatDays: 30, specimen: "Blood, gold top" },

  // Imaging and diagnostics
  { code: "CPT:71046", display: "X-ray chest, 2 views", type: "imaging", keywords: ["cxr", "chest x-ray", "xray"] },
  { code: "CPT:71250", display: "CT chest without contrast", type: "imaging", keywords: ["ct chest", "lung"] },
  { code: "CPT:74177", display: "CT abdomen and pelvis with contrast", type: "imaging", keywords: ["ct abd", "ct a/p", "abdomen"], contrast: true },
  { code: "CPT:76700", display: "Ultrasound abdomen, complete", type: "imaging", keywords: ["us", "ultrasound", "liver", "gallbladder", "ruq"] },
  { code: "CPT:77080", display: "DEXA bone density, axial", type: "imaging", keywords: ["dexa", "dxa", "osteoporosis", "bone density"] },
  { code: "CPT:77067", display: "Mammogram, screening bilateral", type: "imaging", keywords: ["mammo", "breast"] },
  { code: "CPT:93306", display: "Echocardiogram, transthoracic complete", type: "imaging", keywords: ["echo", "tte", "heart failure", "ejection fraction"] },
  { code: "CPT:93000", display: "ECG, 12-lead", type: "procedure", keywords: ["ekg", "ecg", "electrocardiogram"] },
  { code: "CPT:94010", display: "Spirometry", type: "procedure", keywords: ["pft", "spirometry", "copd", "asthma"] },

  // Referrals
  { code: "REF:cardiology", display: "Referral to Cardiology", type: "referral", keywords: ["cardiology", "heart"] },
  { code: "REF:endocrinology", display: "Referral to Endocrinology", type: "referral", keywords: ["endo", "diabetes", "thyroid"] },
  { code: "REF:nephrology", display: "Referral to Nephrology", type: "referral", keywords: ["kidney", "ckd", "renal"] },
  { code: "REF:gastroenterology", display: "Referral to Gastroenterology", type: "referral", keywords: ["gi", "colonoscopy", "liver"] },
  { code: "REF:pulmonology", display: "Referral to Pulmonology", type: "referral", keywords: ["lung", "copd"] },
  { code: "REF:ophthalmology", display: "Referral to Ophthalmology (diabetic eye exam)", type: "referral", keywords: ["eye", "retina", "diabetic eye"] },
  { code: "REF:physical-therapy", display: "Referral to Physical Therapy", type: "referral", keywords: ["pt", "back pain", "rehab"] },
  { code: "REF:nutrition", display: "Referral to Nutrition (dietitian)", type: "referral", keywords: ["diet", "weight", "dietitian"] },

  // Medications (a small outpatient formulary)
  { code: "RX:723", display: "Amoxicillin 500 mg capsule", type: "medication", keywords: ["antibiotic"], med: { dose: "500 mg", route: "oral", frequency: "three times daily for 10 days", quantity: "30 capsules", refills: 0, classes: ["penicillin", "beta-lactam"] } },
  { code: "RX:562251", display: "Amoxicillin-clavulanate 875-125 mg tablet", type: "medication", keywords: ["augmentin", "antibiotic"], med: { dose: "1 tablet", route: "oral", frequency: "twice daily for 7 days", quantity: "14 tablets", refills: 0, classes: ["penicillin", "beta-lactam"] } },
  { code: "RX:309114", display: "Cephalexin 500 mg capsule", type: "medication", keywords: ["keflex", "antibiotic"], med: { dose: "500 mg", route: "oral", frequency: "four times daily for 7 days", quantity: "28 capsules", refills: 0, classes: ["cephalosporin", "beta-lactam"] } },
  { code: "RX:248656", display: "Azithromycin 250 mg tablet", type: "medication", keywords: ["z-pak", "zithromax", "antibiotic"], med: { dose: "500 mg day 1, then 250 mg", route: "oral", frequency: "once daily for 5 days", quantity: "6 tablets", refills: 0, classes: ["macrolide"] } },
  { code: "RX:1648755", display: "Nitrofurantoin monohydrate 100 mg capsule", type: "medication", keywords: ["macrobid", "uti", "antibiotic"], med: { dose: "100 mg", route: "oral", frequency: "twice daily for 5 days", quantity: "10 capsules", refills: 0, classes: [] } },
  { code: "RX:198335", display: "Sulfamethoxazole-trimethoprim DS 800-160 mg tablet", type: "medication", keywords: ["bactrim", "smx-tmp", "antibiotic"], med: { dose: "1 tablet", route: "oral", frequency: "twice daily for 3 days", quantity: "6 tablets", refills: 0, classes: ["sulfonamide"] } },
  { code: "RX:312617", display: "Prednisone 20 mg tablet", type: "medication", keywords: ["steroid"], med: { dose: "40 mg", route: "oral", frequency: "once daily for 5 days", quantity: "10 tablets", refills: 0, classes: ["corticosteroid"] } },
  { code: "RX:861007", display: "Metformin 500 mg tablet", type: "medication", keywords: ["diabetes"], med: { dose: "500 mg", route: "oral", frequency: "twice daily with meals", quantity: "60 tablets", refills: 3, classes: [] } },
  { code: "RX:314076", display: "Lisinopril 10 mg tablet", type: "medication", keywords: ["ace inhibitor", "hypertension", "blood pressure"], med: { dose: "10 mg", route: "oral", frequency: "once daily", quantity: "30 tablets", refills: 3, classes: ["ace-inhibitor"] } },
  { code: "RX:197361", display: "Amlodipine 5 mg tablet", type: "medication", keywords: ["hypertension", "blood pressure"], med: { dose: "5 mg", route: "oral", frequency: "once daily", quantity: "30 tablets", refills: 3, classes: [] } },
  { code: "RX:617310", display: "Atorvastatin 20 mg tablet", type: "medication", keywords: ["statin", "cholesterol"], med: { dose: "20 mg", route: "oral", frequency: "nightly", quantity: "30 tablets", refills: 3, classes: ["statin"] } },
  { code: "RX:966247", display: "Levothyroxine 50 mcg tablet", type: "medication", keywords: ["thyroid", "synthroid"], med: { dose: "50 mcg", route: "oral", frequency: "once daily before breakfast", quantity: "30 tablets", refills: 3, classes: [] } },
  { code: "RX:745679", display: "Albuterol HFA 90 mcg inhaler", type: "medication", keywords: ["inhaler", "asthma", "copd"], med: { dose: "2 puffs", route: "inhaled", frequency: "every 4 hours as needed", quantity: "1 inhaler", refills: 1, classes: [] } },
  { code: "RX:198053", display: "Omeprazole 20 mg capsule", type: "medication", keywords: ["ppi", "gerd", "reflux"], med: { dose: "20 mg", route: "oral", frequency: "once daily before breakfast", quantity: "30 capsules", refills: 2, classes: [] } },
  { code: "RX:197806", display: "Ibuprofen 600 mg tablet", type: "medication", keywords: ["nsaid", "pain"], med: { dose: "600 mg", route: "oral", frequency: "every 6 hours as needed with food", quantity: "30 tablets", refills: 0, classes: ["nsaid"] } },
  { code: "RX:313782", display: "Acetaminophen 500 mg tablet", type: "medication", keywords: ["tylenol", "paracetamol", "pain"], med: { dose: "1000 mg", route: "oral", frequency: "every 8 hours as needed", quantity: "60 tablets", refills: 0, classes: [] } },
  { code: "RX:993503", display: "Acetaminophen-codeine 300-30 mg tablet", type: "medication", keywords: ["tylenol 3", "opioid", "pain"], med: { dose: "1 tablet", route: "oral", frequency: "every 6 hours as needed", quantity: "12 tablets", refills: 0, classes: ["opioid", "codeine"] } },
  { code: "RX:312086", display: "Ondansetron 4 mg ODT", type: "medication", keywords: ["zofran", "nausea"], med: { dose: "4 mg", route: "oral", frequency: "every 8 hours as needed", quantity: "12 tablets", refills: 0, classes: [] } },
];

export const orderableByCode = new Map(ORDERABLES.map((o) => [o.code, o]));

export type OrderSet = { id: string; name: string; description: string; codes: string[] };

export const ORDER_SETS: OrderSet[] = [
  { id: "annual-labs", name: "Annual physical labs", description: "CBC, CMP, lipids, A1c, TSH", codes: ["58410-2", "24323-8", "57698-3", "4548-4", "3016-3"] },
  { id: "diabetes", name: "Diabetes follow-up", description: "A1c, CMP, lipids, urine albumin, eye exam", codes: ["4548-4", "24323-8", "57698-3", "14959-1", "REF:ophthalmology"] },
  { id: "anemia", name: "Anemia workup", description: "CBC, iron studies, B12", codes: ["58410-2", "local:iron", "2132-9"] },
  { id: "heart-failure", name: "Heart failure check", description: "BMP, BNP, CBC, echo", codes: ["51990-0", "30934-4", "58410-2", "CPT:93306"] },
  { id: "hypertension", name: "New hypertension", description: "BMP, lipids, UA, ECG", codes: ["51990-0", "57698-3", "24356-8", "CPT:93000"] },
];

export const typeLabels: Record<OrderType, string> = {
  lab: "Lab",
  imaging: "Imaging",
  medication: "Medication",
  referral: "Referral",
  procedure: "Procedure",
};

export function searchOrderables(q: string, limit = 12) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = ORDERABLES.map((o) => {
    const hay = [o.display, ...(o.keywords ?? [])].join(" ").toLowerCase();
    if (!terms.every((t) => hay.includes(t))) return null;
    const starts = o.display.toLowerCase().startsWith(terms[0]) || (o.keywords ?? []).some((k) => k.startsWith(terms[0]));
    return { o, score: starts ? 0 : 1 };
  }).filter((x): x is { o: Orderable; score: number } => x !== null);
  return scored.sort((a, b) => a.score - b.score || a.o.display.localeCompare(b.o.display)).slice(0, limit).map((x) => x.o);
}

// Report or result codes that satisfy (complete) a lab order.
export const satisfyingCodes = (o: Pick<Orderable, "code" | "resultCodes">) => [o.code, ...(o.resultCodes ?? [])];
