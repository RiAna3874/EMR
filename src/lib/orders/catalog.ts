// Orderables: everything a clinician can order from the Orders tab. Lab codes
// match the DiagnosticReport codes results file under (seeded and imported), so
// a result arriving for an ordered panel completes that order.
import type { OrderType } from "@prisma/client";
import { FORMULARY, productFor, writesOwnSig, type Product } from "@/lib/meds/formulary";
import { classesOf } from "@/lib/meds/drugs";

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
  { code: "58410-2", display: "Complete blood count (CBC)", type: "lab", keywords: ["cbc", "hemoglobin", "platelets", "wbc", "anemia"], repeatDays: 7, specimen: "Blood, lavender top" },
  { code: "24323-8", display: "Comprehensive metabolic panel (CMP)", type: "lab", keywords: ["cmp", "chem", "electrolytes", "liver", "kidney", "creatinine"], repeatDays: 7, specimen: "Blood, gold top" },
  { code: "51990-0", display: "Basic metabolic panel (BMP)", type: "lab", keywords: ["bmp", "chem 7", "electrolytes", "potassium"], repeatDays: 3, resultCodes: ["24323-8"], specimen: "Blood, gold top" },
  { code: "57698-3", display: "Lipid panel", type: "lab", keywords: ["cholesterol", "ldl", "triglycerides", "lipid"], repeatDays: 60, specimen: "Blood, gold top (fasting preferred)" },
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

  // Medications: the prescribing formulary (src/lib/meds/formulary.ts).
  ...FORMULARY.map(medOrderable),
];

function medOrderable(p: Product): Orderable {
  return {
    code: `RX:${p.rxnorm}`,
    display: p.display,
    type: "medication",
    keywords: p.keywords,
    med: { dose: p.dose, route: p.route, frequency: p.frequency, quantity: p.quantity, refills: p.refills, classes: classesOf(p.display) },
  };
}

export const orderableByCode = new Map(ORDERABLES.map((o) => [o.code, o]));

// As orderableByCode, plus medications prescribed off-list by name, from the DGDA registry
// or from the generic names list.
export function orderableFor(code: string): Orderable | undefined {
  const known = orderableByCode.get(code);
  if (known) return known;
  const p = code.startsWith("RX:") ? productFor({ code }) : undefined;
  return writesOwnSig(p) ? medOrderable(p!) : undefined;
}

// `problem`: a word in the name of the problem the set is usually for, to link its orders by default.
export type OrderSet = { id: string; name: string; description: string; codes: string[]; problem?: string };

export const ORDER_SETS: OrderSet[] = [
  { id: "annual-labs", name: "Annual physical labs", description: "CBC, CMP, lipids, A1c, TSH", codes: ["58410-2", "24323-8", "57698-3", "4548-4", "3016-3"] },
  { id: "diabetes", name: "Diabetes follow-up", description: "A1c, CMP, lipids, urine albumin, eye exam", codes: ["4548-4", "24323-8", "57698-3", "14959-1", "REF:ophthalmology"], problem: "diabetes" },
  { id: "anemia", name: "Anemia workup", description: "CBC, iron studies, B12", codes: ["58410-2", "local:iron", "2132-9"], problem: "anemia" },
  { id: "heart-failure", name: "Heart failure check", description: "BMP, BNP, CBC, echo", codes: ["51990-0", "30934-4", "58410-2", "CPT:93306"], problem: "heart failure" },
  { id: "hypertension", name: "New hypertension", description: "BMP, lipids, UA, ECG", codes: ["51990-0", "57698-3", "24356-8", "CPT:93000"], problem: "hypertension" },
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

// Order sets whose name or contents match every typed word.
export function searchOrderSets(q: string, limit = 4) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return ORDER_SETS.filter((s) => {
    const hay = [s.name, s.description, "order set", s.problem ?? ""].join(" ").toLowerCase();
    return terms.every((t) => hay.includes(t));
  }).slice(0, limit);
}

export const orderSetById = new Map(ORDER_SETS.map((s) => [s.id, s]));

// Report or result codes that satisfy (complete) a lab order.
export const satisfyingCodes = (o: Pick<Orderable, "code" | "resultCodes">) => [o.code, ...(o.resultCodes ?? [])];
