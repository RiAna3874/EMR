// Seeds Meridian EMR with fully synthetic patients (no real PHI).
// A seeded PRNG keeps the data identical between runs, and "today" is
// the day the seed runs so the clinic schedule always has appointments.
import {
  PrismaClient,
  type Flag,
  type Sex,
  type AllergySeverity,
  type AllergyType,
  type PatientTaking,
} from "@prisma/client";

import { ORDERABLES } from "../src/lib/orders/catalog";
import { productFor } from "../src/lib/meds/formulary";
import { hashPassword } from "../src/lib/password";
import { docContent, docDraftFromExtraction, suggestOrder, type DocDraft, type ExtractedDocument } from "../src/lib/documents/draft";
import { readFileSync } from "node:fs";
import { matchProblem } from "../src/lib/problems/link";

const prisma = new PrismaClient();
const orderables = new Map(ORDERABLES.map((o) => [o.code, o]));

let seed = 20261012;
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;

const DAY = 86_400_000;
const today = new Date();
today.setHours(0, 0, 0, 0);
const daysAgo = (d: number, hour = 9, minute = 0) => {
  const t = new Date(today.getTime() - d * DAY);
  t.setHours(hour, minute, 0, 0);
  return t;
};

type ConditionDef = { code: string; display: string; onsetYearsAgo: number; status?: "active" | "resolved" };
type MedDef = {
  drug: string; rxnorm: string; dose: string; route: string; frequency: string; indication?: string; status?: "active" | "on_hold" | "discontinued";
  // Prescription and pharmacy fill details (see seedMeds).
  refillsLeft?: number; lateDays?: number; historical?: boolean; endReason?: string;
  taking?: "not_taking" | "taking_differently"; takingNote?: string;
  request?: { comment?: string; pendNote?: string };
  // Today, the resident changed this prescription from an earlier one.
  residentChangedFrom?: { drug: string; rxnorm: string; dose: string };
};
type AllergyDef = { substance: string; type: AllergyType; reaction: string; severity: AllergySeverity; verified?: boolean };

// Lab "drift" lets a profile push particular analytes high or low.
type LabBias = Partial<Record<string, number>>;

type PatientDef = {
  firstName: string;
  lastName: string;
  sex: Sex;
  age: number;
  phone: string;
  address: string;
  language?: string;
  codeStatus?: string;
  nka?: boolean;
  allergies?: AllergyDef[];
  conditions: ConditionDef[];
  meds: MedDef[];
  vitals: { sbp: number; dbp: number; hr: number; weightKg: number; heightCm: number; spo2?: number };
  labBias?: LabBias;
  reasonToday?: string;
  orders?: { code: string; status: "pending" | "signed"; daysAgo: number; priority?: "routine" | "urgent" | "stat"; indication?: string; orderSet?: string; dueInDays?: number }[];
  telehealth?: boolean;
  visitHour?: number;
};

const patients: PatientDef[] = [
  {
    firstName: "Aiyana", lastName: "Brightwater", sex: "female", age: 58,
    phone: "(555) 201-4410", address: "14 Juniper Ct, Lakeview, OR 97630",
    allergies: [{ substance: "Penicillin", type: "drug", reaction: "Hives", severity: "moderate", verified: true }],
    conditions: [
      { code: "E11.9", display: "Type 2 diabetes mellitus without complications", onsetYearsAgo: 9 },
      { code: "I10", display: "Essential (primary) hypertension", onsetYearsAgo: 12 },
      { code: "E78.5", display: "Hyperlipidemia, unspecified", onsetYearsAgo: 7 },
    ],
    meds: [
      { drug: "Metformin 1000 mg tablet", rxnorm: "861004", dose: "1000 mg", route: "oral", frequency: "twice daily with meals", indication: "Type 2 diabetes", residentChangedFrom: { drug: "Metformin 500 mg tablet", rxnorm: "861007", dose: "500 mg" } },
      { drug: "Lisinopril 20 mg tablet", rxnorm: "314077", dose: "20 mg", route: "oral", frequency: "once daily", indication: "Hypertension", refillsLeft: 0, request: { comment: "Patient requests 90-day supply." } },
      { drug: "Atorvastatin 40 mg tablet", rxnorm: "617311", dose: "40 mg", route: "oral", frequency: "nightly", indication: "Hyperlipidemia" },
      { drug: "Glipizide 5 mg tablet", rxnorm: "310488", dose: "5 mg", route: "oral", frequency: "once daily", indication: "Type 2 diabetes", status: "discontinued", endReason: "Hypoglycemia" },
    ],
    vitals: { sbp: 142, dbp: 88, hr: 78, weightKg: 88, heightCm: 163 },
    labBias: { glucose: 1.6, a1c: 1.45, ldl: 1.2, tg: 1.4, creatinine: 1.15 },
    reasonToday: "Diabetes follow-up", visitHour: 8,
    orders: [
      { code: "58410-2", status: "signed", daysAgo: 6, indication: "Type 2 diabetes mellitus without complications", dueInDays: 0 },
      { code: "14959-1", status: "signed", daysAgo: 3, indication: "Type 2 diabetes mellitus without complications", dueInDays: 0 },
      { code: "REF:ophthalmology", status: "signed", daysAgo: 3, indication: "Type 2 diabetes mellitus without complications" },
    ],
  },
  {
    firstName: "Marcus", lastName: "Okonkwo-Hale", sex: "male", age: 67,
    phone: "(555) 318-0092", address: "902 Ridge Rd, Lakeview, OR 97630",
    codeStatus: "DNR/DNI",
    nka: true,
    conditions: [
      { code: "I48.91", display: "Atrial fibrillation, unspecified", onsetYearsAgo: 4 },
      { code: "N18.3", display: "Chronic kidney disease, stage 3", onsetYearsAgo: 3 },
      { code: "I50.9", display: "Heart failure, unspecified", onsetYearsAgo: 2 },
    ],
    meds: [
      { drug: "Apixaban 5 mg tablet", rxnorm: "1364445", dose: "5 mg", route: "oral", frequency: "twice daily", indication: "Atrial fibrillation", refillsLeft: 0, request: {} },
      { drug: "Metoprolol succinate ER 50 mg tablet", rxnorm: "866436", dose: "50 mg", route: "oral", frequency: "once daily", indication: "Rate control" },
      { drug: "Furosemide 40 mg tablet", rxnorm: "313988", dose: "40 mg", route: "oral", frequency: "once daily", indication: "Heart failure" },
    ],
    vitals: { sbp: 128, dbp: 76, hr: 88, weightKg: 94, heightCm: 180, spo2: 94 },
    labBias: { creatinine: 1.7, bun: 1.6, egfr: 0.55, potassium: 1.12, hgb: 0.88 },
    reasonToday: "CHF check, weight gain", visitHour: 8,
    orders: [
      { code: "CPT:93306", status: "signed", daysAgo: 2, priority: "urgent", indication: "Heart failure, unspecified", dueInDays: 5 },
      { code: "30934-4", status: "signed", daysAgo: 0, priority: "stat", indication: "Heart failure, unspecified", dueInDays: 0 },
    ],
  },
  {
    firstName: "Priya", lastName: "Raman", sex: "female", age: 34,
    phone: "(555) 774-2215", address: "51 Cedar St Apt 3, Lakeview, OR 97630",
    nka: true,
    conditions: [
      { code: "E03.9", display: "Hypothyroidism, unspecified", onsetYearsAgo: 5 },
      { code: "D50.9", display: "Iron deficiency anemia, unspecified", onsetYearsAgo: 1 },
    ],
    meds: [
      { drug: "Levothyroxine 75 mcg tablet", rxnorm: "966222", dose: "75 mcg", route: "oral", frequency: "once daily before breakfast", indication: "Hypothyroidism", refillsLeft: 0, request: {} },
      { drug: "Ferrous sulfate 325 mg tablet", rxnorm: "310325", dose: "325 mg", route: "oral", frequency: "once daily", indication: "Iron deficiency" },
    ],
    vitals: { sbp: 112, dbp: 70, hr: 84, weightKg: 61, heightCm: 165 },
    labBias: { tsh: 2.2, hgb: 0.8, mcv: 0.86, ferritin: 0.2 },
    reasonToday: "Fatigue, recheck thyroid", visitHour: 9,
    orders: [
      { code: "58410-2", status: "pending", daysAgo: 0, indication: "Iron deficiency anemia, unspecified", orderSet: "Anemia workup" },
      { code: "local:iron", status: "pending", daysAgo: 0, indication: "Iron deficiency anemia, unspecified", orderSet: "Anemia workup" },
      { code: "2132-9", status: "pending", daysAgo: 0, indication: "Iron deficiency anemia, unspecified", orderSet: "Anemia workup" },
    ],
  },
  {
    firstName: "Theodore", lastName: "Vance", sex: "male", age: 45,
    phone: "(555) 640-8831", address: "7 Harbor View Ln, Lakeview, OR 97630",
    allergies: [
      { substance: "Sulfamethoxazole/trimethoprim", type: "drug", reaction: "Rash", severity: "mild", verified: true },
      { substance: "Peanuts", type: "food", reaction: "Anaphylaxis", severity: "severe", verified: true },
    ],
    conditions: [
      { code: "J45.40", display: "Moderate persistent asthma, uncomplicated", onsetYearsAgo: 20 },
      { code: "K21.9", display: "Gastro-esophageal reflux disease without esophagitis", onsetYearsAgo: 3 },
    ],
    meds: [
      { drug: "Fluticasone-salmeterol 250-50 mcg inhaler", rxnorm: "896188", dose: "1 puff", route: "inhaled", frequency: "twice daily", indication: "Asthma" },
      { drug: "Albuterol HFA 90 mcg inhaler", rxnorm: "745679", dose: "2 puffs", route: "inhaled", frequency: "every 4 hours as needed", indication: "Wheezing" },
      { drug: "Omeprazole 20 mg capsule", rxnorm: "198053", dose: "20 mg", route: "oral", frequency: "once daily", indication: "GERD" },
      { drug: "Epinephrine 0.3 mg auto-injector", rxnorm: "727316", dose: "0.3 mg", route: "intramuscular", frequency: "once as needed", indication: "Anaphylaxis", refillsLeft: 1 },
    ],
    vitals: { sbp: 124, dbp: 80, hr: 72, weightKg: 82, heightCm: 178, spo2: 97 },
    reasonToday: "Asthma check", visitHour: 9,
  },
  {
    firstName: "Rosalind", lastName: "Ferreira", sex: "female", age: 76,
    phone: "(555) 112-9054", address: "3300 Mill Pond Rd, Lakeview, OR 97630",
    language: "Portuguese",
    allergies: [{ substance: "Codeine", type: "drug", reaction: "Nausea and vomiting", severity: "moderate", verified: false }],
    conditions: [
      { code: "M81.0", display: "Age-related osteoporosis without current fracture", onsetYearsAgo: 6 },
      { code: "I10", display: "Essential (primary) hypertension", onsetYearsAgo: 20 },
      { code: "F03.90", display: "Unspecified dementia without behavioral disturbance", onsetYearsAgo: 2 },
      { code: "S72.001A", display: "Fracture of right femoral neck", onsetYearsAgo: 8, status: "resolved" },
    ],
    meds: [
      { drug: "Alendronate 70 mg tablet", rxnorm: "904420", dose: "70 mg", route: "oral", frequency: "once weekly", indication: "Osteoporosis" },
      { drug: "Amlodipine 5 mg tablet", rxnorm: "197361", dose: "5 mg", route: "oral", frequency: "once daily", indication: "Hypertension" },
      { drug: "Donepezil 10 mg tablet", rxnorm: "997223", dose: "10 mg", route: "oral", frequency: "nightly", indication: "Dementia" },
      { drug: "Cholecalciferol 2000 unit capsule", rxnorm: "636676", dose: "2000 units", route: "oral", frequency: "once daily", indication: "Vitamin D", historical: true },
    ],
    vitals: { sbp: 136, dbp: 74, hr: 68, weightKg: 54, heightCm: 155 },
    labBias: { sodium: 0.97, vitd: 0.6 },
    reasonToday: "Annual wellness visit", visitHour: 10,
    orders: [{ code: "CPT:77080", status: "signed", daysAgo: 30, indication: "Age-related osteoporosis without current fracture", dueInDays: 14 }],
  },
  {
    firstName: "Jonah", lastName: "Kessler", sex: "male", age: 29,
    phone: "(555) 905-3378", address: "18 Orchard Way, Lakeview, OR 97630",
    conditions: [{ code: "F41.1", display: "Generalized anxiety disorder", onsetYearsAgo: 2 }],
    meds: [{ drug: "Sertraline 50 mg tablet", rxnorm: "312940", dose: "50 mg", route: "oral", frequency: "once daily", indication: "Anxiety", lateDays: 24, taking: "taking_differently", takingNote: "Skips doses on weekends; worried about side effects" }],
    vitals: { sbp: 118, dbp: 72, hr: 76, weightKg: 75, heightCm: 183 },
    reasonToday: "Medication follow-up", telehealth: true, visitHour: 10,
  },
  {
    firstName: "Lucia", lastName: "Montenegro", sex: "female", age: 51,
    phone: "(555) 482-6601", address: "620 Aspen Blvd, Lakeview, OR 97630",
    language: "Spanish",
    nka: true,
    conditions: [
      { code: "E66.9", display: "Obesity, unspecified", onsetYearsAgo: 10 },
      { code: "R73.03", display: "Prediabetes", onsetYearsAgo: 2 },
      { code: "K76.0", display: "Fatty (change of) liver, not elsewhere classified", onsetYearsAgo: 1 },
    ],
    meds: [{ drug: "Semaglutide 0.5 mg/dose pen", rxnorm: "1991306", dose: "0.5 mg", route: "subcutaneous", frequency: "once weekly", indication: "Weight management" }],
    vitals: { sbp: 134, dbp: 86, hr: 82, weightKg: 102, heightCm: 160 },
    labBias: { a1c: 1.12, glucose: 1.15, alt: 2.1, ast: 1.7, tg: 1.6, ldl: 1.15 },
    reasonToday: "Weight check, abnormal LFTs", visitHour: 11,
  },
  {
    firstName: "Hiroshi", lastName: "Tanabe", sex: "male", age: 61,
    phone: "(555) 327-1188", address: "45 Pinecrest Dr, Lakeview, OR 97630",
    allergies: [{ substance: "Iodinated contrast media", type: "drug", reaction: "Hives, flushing", severity: "moderate", verified: true }],
    conditions: [
      { code: "J44.9", display: "Chronic obstructive pulmonary disease, unspecified", onsetYearsAgo: 5 },
      { code: "Z87.891", display: "History of nicotine dependence", onsetYearsAgo: 5 },
    ],
    meds: [
      { drug: "Tiotropium 18 mcg inhalation capsule", rxnorm: "485032", dose: "18 mcg", route: "inhaled", frequency: "once daily", indication: "COPD" },
      { drug: "Albuterol HFA 90 mcg inhaler", rxnorm: "745679", dose: "2 puffs", route: "inhaled", frequency: "every 4 hours as needed", indication: "COPD" },
      { drug: "Prednisone 20 mg tablet", rxnorm: "312617", dose: "40 mg", route: "oral", frequency: "once daily x5 days", indication: "COPD exacerbation", status: "discontinued", endReason: "Course completed" },
    ],
    vitals: { sbp: 130, dbp: 82, hr: 90, weightKg: 70, heightCm: 172, spo2: 92 },
    labBias: { hgb: 1.1, wbc: 1.3 },
    reasonToday: "Shortness of breath", visitHour: 13,
  },
  {
    firstName: "Esther", lastName: "Abernathy", sex: "female", age: 42,
    phone: "(555) 266-7720", address: "11 Willow Bend, Lakeview, OR 97630",
    conditions: [
      { code: "M54.50", display: "Low back pain, unspecified", onsetYearsAgo: 1 },
      { code: "G43.909", display: "Migraine, unspecified, not intractable", onsetYearsAgo: 15 },
    ],
    meds: [
      { drug: "Sumatriptan 50 mg tablet", rxnorm: "313461", dose: "50 mg", route: "oral", frequency: "at migraine onset, may repeat in 2 h", indication: "Migraine" },
      { drug: "Cyclobenzaprine 10 mg tablet", rxnorm: "828320", dose: "10 mg", route: "oral", frequency: "nightly as needed", indication: "Back spasm", status: "on_hold", taking: "not_taking", takingNote: "Back spasm resolved" },
    ],
    vitals: { sbp: 120, dbp: 78, hr: 70, weightKg: 68, heightCm: 170 },
    reasonToday: "Back pain", visitHour: 14,
  },
  {
    firstName: "Samuel", lastName: "Whitfield", sex: "male", age: 72,
    phone: "(555) 893-4402", address: "1200 Lakeshore Dr, Lakeview, OR 97630",
    nka: true,
    conditions: [
      { code: "I25.10", display: "Atherosclerotic heart disease of native coronary artery", onsetYearsAgo: 7 },
      { code: "E11.65", display: "Type 2 diabetes mellitus with hyperglycemia", onsetYearsAgo: 15 },
      { code: "N40.0", display: "Benign prostatic hyperplasia", onsetYearsAgo: 6 },
    ],
    meds: [
      { drug: "Aspirin 81 mg tablet", rxnorm: "243670", dose: "81 mg", route: "oral", frequency: "once daily", indication: "CAD", historical: true },
      { drug: "Rosuvastatin 20 mg tablet", rxnorm: "859751", dose: "20 mg", route: "oral", frequency: "once daily", indication: "CAD", refillsLeft: 0, request: { pendNote: "Protocol met: lipid panel 3 weeks ago, visit 3 weeks ago. Ready to approve." } },
      { drug: "Insulin glargine 100 unit/mL pen", rxnorm: "847232", dose: "28 units", route: "subcutaneous", frequency: "nightly", indication: "Type 2 diabetes" },
      { drug: "Tamsulosin 0.4 mg capsule", rxnorm: "863669", dose: "0.4 mg", route: "oral", frequency: "nightly", indication: "BPH" },
    ],
    vitals: { sbp: 138, dbp: 70, hr: 64, weightKg: 85, heightCm: 175 },
    labBias: { glucose: 2.0, a1c: 1.7, creatinine: 1.25, potassium: 1.08 },
    reasonToday: "Hyperglycemia follow-up", visitHour: 15,
  },
  {
    firstName: "Naomi", lastName: "Castellanos", sex: "female", age: 26,
    phone: "(555) 509-2263", address: "88 Birch Hollow, Lakeview, OR 97630",
    nka: true,
    conditions: [{ code: "L70.0", display: "Acne vulgaris", onsetYearsAgo: 8 }],
    meds: [{ drug: "Tretinoin 0.025% cream", rxnorm: "199890", dose: "thin layer", route: "topical", frequency: "nightly", indication: "Acne" }],
    vitals: { sbp: 108, dbp: 66, hr: 66, weightKg: 58, heightCm: 168 },
  },
  {
    firstName: "Desmond", lastName: "Achterberg", sex: "male", age: 55,
    phone: "(555) 731-0049", address: "2 Foxglove Path, Lakeview, OR 97630",
    allergies: [{ substance: "Latex", type: "environment", reaction: "Contact dermatitis", severity: "mild", verified: true }],
    conditions: [
      { code: "M10.9", display: "Gout, unspecified", onsetYearsAgo: 4 },
      { code: "I10", display: "Essential (primary) hypertension", onsetYearsAgo: 6 },
    ],
    meds: [
      { drug: "Allopurinol 300 mg tablet", rxnorm: "197320", dose: "300 mg", route: "oral", frequency: "once daily", indication: "Gout", refillsLeft: 0, request: {} },
      { drug: "Losartan 50 mg tablet", rxnorm: "979485", dose: "50 mg", route: "oral", frequency: "once daily", indication: "Hypertension" },
    ],
    vitals: { sbp: 146, dbp: 92, hr: 74, weightKg: 97, heightCm: 179 },
    labBias: { uric: 1.5, creatinine: 1.1 },
  },
];

// Synthetic staff. Every account signs in with DEMO_PASSWORD; the sign-in page
// lists them outside production. Dana Chen is also the demo administrator.
const DEMO_PASSWORD = "meridian";
const practitioners = [
  { id: "prac_chen", username: "dchen", name: "Dana Chen", role: "physician" as const, credentials: "MD", isAdmin: true },
  { id: "prac_ibarra", username: "ribarra", name: "Rafael Ibarra", role: "physician" as const, credentials: "DO" },
  { id: "prac_brandt", username: "lbrandt", name: "Leo Brandt", role: "resident" as const, credentials: "MD" },
  { id: "prac_marsh", username: "hmarsh", name: "Helena Marsh", role: "physician" as const, credentials: "MD" },
  { id: "prac_lund", username: "klund", name: "Kirsten Lund", role: "nurse" as const, credentials: "RN" },
  { id: "prac_mbeki", username: "tmbeki", name: "Thandi Mbeki", role: "front_desk" as const, credentials: null },
];

// Reference ranges are adult values; LOINC codes are real so filed results line up
// with the lab-import feature later.
type Analyte = { key: string; loinc: string; display: string; unit: string; low: number; high: number; mid: number; sd: number; dp: number; critLow?: number; critHigh?: number; male?: [number, number, number] };
const panels: { code: string; display: string; analytes: Analyte[] }[] = [
  {
    code: "58410-2", display: "Complete blood count (CBC)",
    analytes: [
      { key: "wbc", loinc: "6690-2", display: "WBC", unit: "10*3/uL", low: 4.0, high: 11.0, mid: 7, sd: 1.2, dp: 1, critLow: 2, critHigh: 30 },
      { key: "hgb", loinc: "718-7", display: "Hemoglobin", unit: "g/dL", low: 12.0, high: 15.5, mid: 13.6, sd: 0.6, dp: 1, critLow: 7, critHigh: 20, male: [13.5, 17.5, 15.2] },
      { key: "hct", loinc: "4544-3", display: "Hematocrit", unit: "%", low: 36, high: 46, mid: 41, sd: 1.8, dp: 1, male: [41, 53, 45] },
      { key: "mcv", loinc: "787-2", display: "MCV", unit: "fL", low: 80, high: 100, mid: 89, sd: 3, dp: 0 },
      { key: "plt", loinc: "777-3", display: "Platelets", unit: "10*3/uL", low: 150, high: 400, mid: 260, sd: 40, dp: 0, critLow: 50, critHigh: 1000 },
    ],
  },
  {
    code: "24323-8", display: "Comprehensive metabolic panel (CMP)",
    analytes: [
      { key: "sodium", loinc: "2951-2", display: "Sodium", unit: "mmol/L", low: 135, high: 145, mid: 140, sd: 1.5, dp: 0, critLow: 120, critHigh: 160 },
      { key: "potassium", loinc: "2823-3", display: "Potassium", unit: "mmol/L", low: 3.5, high: 5.1, mid: 4.2, sd: 0.25, dp: 1, critLow: 2.8, critHigh: 6.2 },
      { key: "chloride", loinc: "2075-0", display: "Chloride", unit: "mmol/L", low: 98, high: 107, mid: 102, sd: 1.5, dp: 0 },
      { key: "co2", loinc: "2028-9", display: "CO2", unit: "mmol/L", low: 22, high: 29, mid: 25, sd: 1.2, dp: 0 },
      { key: "bun", loinc: "3094-0", display: "BUN", unit: "mg/dL", low: 7, high: 20, mid: 14, sd: 2.5, dp: 0 },
      { key: "creatinine", loinc: "2160-0", display: "Creatinine", unit: "mg/dL", low: 0.6, high: 1.2, mid: 0.9, sd: 0.08, dp: 2 },
      { key: "egfr", loinc: "33914-3", display: "eGFR", unit: "mL/min/1.73m2", low: 60, high: 120, mid: 92, sd: 6, dp: 0 },
      { key: "glucose", loinc: "2345-7", display: "Glucose", unit: "mg/dL", low: 70, high: 99, mid: 88, sd: 6, dp: 0, critLow: 50, critHigh: 400 },
      { key: "calcium", loinc: "17861-6", display: "Calcium", unit: "mg/dL", low: 8.6, high: 10.3, mid: 9.4, sd: 0.25, dp: 1 },
      { key: "alt", loinc: "1742-6", display: "ALT", unit: "U/L", low: 7, high: 56, mid: 24, sd: 6, dp: 0 },
      { key: "ast", loinc: "1920-8", display: "AST", unit: "U/L", low: 10, high: 40, mid: 22, sd: 4, dp: 0 },
    ],
  },
  {
    code: "57698-3", display: "Lipid panel",
    analytes: [
      { key: "chol", loinc: "2093-3", display: "Total cholesterol", unit: "mg/dL", low: 0, high: 199, mid: 180, sd: 15, dp: 0 },
      { key: "ldl", loinc: "13457-7", display: "LDL cholesterol", unit: "mg/dL", low: 0, high: 99, mid: 95, sd: 12, dp: 0 },
      { key: "hdl", loinc: "2085-9", display: "HDL cholesterol", unit: "mg/dL", low: 40, high: 999, mid: 55, sd: 6, dp: 0 },
      { key: "tg", loinc: "2571-8", display: "Triglycerides", unit: "mg/dL", low: 0, high: 149, mid: 120, sd: 18, dp: 0 },
    ],
  },
  {
    code: "4548-4", display: "Hemoglobin A1c",
    analytes: [{ key: "a1c", loinc: "4548-4", display: "Hemoglobin A1c", unit: "%", low: 4.0, high: 5.6, mid: 5.3, sd: 0.15, dp: 1 }],
  },
  {
    code: "3016-3", display: "TSH",
    analytes: [{ key: "tsh", loinc: "3016-3", display: "TSH", unit: "m[IU]/L", low: 0.4, high: 4.0, mid: 2.0, sd: 0.4, dp: 2 }],
  },
];

function flagFor(value: number, a: { low: number; high: number; critLow?: number; critHigh?: number }): Flag {
  if (a.critLow !== undefined && value < a.critLow) return "LL";
  if (a.critHigh !== undefined && value > a.critHigh) return "HH";
  if (value < a.low) return "L";
  if (value > a.high) return "H";
  return "N";
}

// The seed wipes every table before loading synthetic patients, so it must never
// run against a live clinic's database.
async function refuseOnLiveData() {
  if (process.env.NODE_ENV === "production" && process.env.MERIDIAN_DEMO_ACCOUNTS !== "1") {
    throw new Error("Refusing to load synthetic demo data in production (NODE_ENV=production). Live sites start empty: see docs/DEPLOY.md.");
  }
  const demoUsernames = practitioners.map((p) => p.username);
  const real = await prisma.practitioner.findMany({ where: { username: { notIn: demoUsernames } }, select: { username: true }, take: 5 });
  // Accounts made at /setup or /admin/users mean this database is in real use.
  if (real.length) {
    throw new Error(
      `Refusing to seed: this database has staff accounts that aren't demo accounts (${real.map((r) => r.username ?? "unnamed").join(", ")}). ` +
        "Seeding would erase everything in it. Use a separate database for the demo.",
    );
  }
}

async function main() {
  await refuseOnLiveData();
  // The access log refuses DELETE (append-only); a demo reseed empties it with TRUNCATE.
  await prisma.$executeRawUnsafe(`TRUNCATE "AuditEvent"`);
  await prisma.$transaction([
    prisma.chatMessage.deleteMany(),
    prisma.conversationMember.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.observation.deleteMany(),
    prisma.diagnosticReport.deleteMany(),
    prisma.mediaItem.deleteMany(),
    prisma.clinicalDocument.deleteMany(),
    prisma.serviceRequest.deleteMany(),
    prisma.documentReference.deleteMany(),
    prisma.importJob.deleteMany(),
    prisma.noteAddendum.deleteMany(),
    prisma.noteVersion.deleteMany(),
    prisma.note.deleteMany(),
    prisma.smartPhrase.deleteMany(),
    prisma.encounterDiagnosis.deleteMany(),
    prisma.encounterEvent.deleteMany(),
    prisma.encounter.deleteMany(),
    prisma.scheduleBlock.deleteMany(),
    prisma.scheduleSession.deleteMany(),
    prisma.refillRequest.deleteMany(),
    prisma.medicationDispense.deleteMany(),
    prisma.medicationRequest.deleteMany(),
    prisma.allergyIntolerance.deleteMany(),
    prisma.condition.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.pharmacy.deleteMany(),
    prisma.practitioner.deleteMany(),
  ]);
  await prisma.pharmacy.createMany({ data: pharmacies });

  await prisma.practitioner.createMany({
    data: await Promise.all(practitioners.map(async (p) => ({ ...p, passwordHash: await hashPassword(DEMO_PASSWORD) }))),
  });
  const pcps = ["prac_chen", "prac_ibarra"];
  await seedTemplates();

  for (const [i, p] of patients.entries()) {
    // UTC midnight: DOB is a date column, so a local midnight east of UTC would store the day before.
    const dob = new Date(Date.UTC(today.getFullYear() - p.age, Math.floor(rand() * 12), 1 + Math.floor(rand() * 27)));
    const pcpId = pcps[i % 2];
    const patient = await prisma.patient.create({
      data: {
        mrn: `M${(1004417 + i * 7331).toString()}`,
        firstName: p.firstName,
        lastName: p.lastName,
        dob,
        sex: p.sex,
        phone: p.phone,
        address: p.address,
        preferredLanguage: p.language ?? "English",
        codeStatus: p.codeStatus ?? "Full code",
        allergyStatus: p.allergies?.length ? "has_allergies" : p.nka ? "no_known_allergies" : "not_reviewed",
        pcpId,
        insurancePayer: PAYERS[i % PAYERS.length],
        insuranceMemberId: `${PAYERS[i % PAYERS.length].slice(0, 3).toUpperCase()}${(48213077 + i * 90731).toString()}`,
        preferredPharmacyId: pharmacies[i % pharmacies.length].id,
      },
    });

    await prisma.condition.createMany({
      data: p.conditions.map((c, idx) => ({
        patientId: patient.id,
        code: c.code,
        display: c.display,
        status: c.status ?? "active",
        onset: daysAgo(Math.round(c.onsetYearsAgo * 365 + rand() * 60)),
        resolvedAt: c.status === "resolved" ? daysAgo(Math.round(c.onsetYearsAgo * 365 - 120)) : null,
        priority: idx + 1,
      })),
    });

    if (p.allergies?.length) {
      await prisma.allergyIntolerance.createMany({
        data: p.allergies.map((a) => ({ patientId: patient.id, ...a, verified: a.verified ?? false, recordedAt: daysAgo(400 + Math.round(rand() * 900)) })),
      });
    }

    await seedMeds(i, p, patient.id, pcpId);

    // Past office visits roughly quarterly, each with vitals; labs at most of them.
    const visitDaysAgo = [540, 360, 270, 180, 90, 21];
    const bmiHeight = p.vitals.heightCm / 100;
    for (const [vIdx, ago] of visitDaysAgo.entries()) {
      const start = daysAgo(ago, 9 + (i % 7), (i * 10) % 60);
      const encounter = await prisma.encounter.create({
        data: {
          patientId: patient.id, type: "office", status: "checked_out", visitType: "follow_up",
          reason: vIdx === visitDaysAgo.length - 1 ? "Follow-up" : "Routine follow-up",
          start, end: new Date(start.getTime() + 25 * 60_000), providerId: pcpId,
        },
      });

      // The last visit was documented on the visit screen: diagnoses from the problem
      // list, advice and a follow-up, so its printed visit prescription has content.
      if (vIdx === visitDaysAgo.length - 1) {
        const top = await prisma.condition.findMany({ where: { patientId: patient.id, status: "active" }, orderBy: { priority: "asc" }, take: 2 });
        await prisma.encounterDiagnosis.createMany({
          data: top.map((c, r) => ({ encounterId: encounter.id, patientId: patient.id, display: c.display, code: c.code, conditionId: c.id, rank: r + 1, addedById: pcpId })),
        });
        const due = new Date(start);
        due.setMonth(due.getMonth() + 3);
        await prisma.encounter.update({
          where: { id: encounter.id },
          data: {
            chiefComplaint: "Follow-up of chronic conditions",
            advice: ["Eat less salt. Avoid extra salt at the table.", "Walk briskly for 30 minutes every day.", "Bring this prescription and your reports at the next visit."].join("\n"),
            followUpInterval: "3m",
            followUpDate: new Date(Date.UTC(due.getFullYear(), due.getMonth(), due.getDate())),
          },
        });
      }

      // Trend: values ease toward the patient's current state over time.
      const progress = (vIdx + 1) / visitDaysAgo.length;
      const weight = round(p.vitals.weightKg * (1.03 - 0.03 * progress) + between(-0.8, 0.8), 1);
      const vitalRows = [
        { code: "8480-6", display: "Systolic BP", value: Math.round(p.vitals.sbp + between(-8, 8)), unit: "mm[Hg]", low: 90, high: 129 },
        { code: "8462-4", display: "Diastolic BP", value: Math.round(p.vitals.dbp + between(-5, 5)), unit: "mm[Hg]", low: 60, high: 79 },
        { code: "8867-4", display: "Heart rate", value: Math.round(p.vitals.hr + between(-6, 6)), unit: "/min", low: 60, high: 100 },
        { code: "9279-1", display: "Respiratory rate", value: Math.round(between(13, 18)), unit: "/min", low: 12, high: 20 },
        { code: "8310-5", display: "Temperature", value: round(between(36.4, 37.1), 1), unit: "Cel", low: 36.1, high: 37.8 },
        { code: "59408-5", display: "SpO2", value: Math.round((p.vitals.spo2 ?? 98) + between(-1, 1)), unit: "%", low: 95, high: 100 },
        { code: "29463-7", display: "Weight", value: weight, unit: "kg" },
        { code: "8302-2", display: "Height", value: p.vitals.heightCm, unit: "cm" },
        { code: "39156-5", display: "BMI", value: round(weight / (bmiHeight * bmiHeight), 1), unit: "kg/m2", low: 18.5, high: 24.9 },
        { code: "72514-3", display: "Pain score", value: Math.round(between(0, p.reasonToday === "Back pain" ? 6 : 2)), unit: "{score}" },
      ];
      await prisma.observation.createMany({
        data: vitalRows.map((v, idx) => ({
          patientId: patient.id, encounterId: encounter.id, category: "vital_signs" as const,
          code: v.code, display: v.display, valueNum: v.value, unit: v.unit,
          refLow: v.low, refHigh: v.high,
          flag: v.low !== undefined && v.high !== undefined ? flagFor(v.value, { low: v.low, high: v.high }) : null,
          effectiveAt: start, sortOrder: idx,
        })),
      });

      if (vIdx === 0 || vIdx === 2 || vIdx >= 4) {
        const collected = new Date(start.getTime() + 30 * 60_000);
        for (const panel of panels) {
          if (panel.code === "3016-3" && !p.labBias?.tsh && vIdx < 4) continue;
          const issuedAt = new Date(collected.getTime() + 18 * 3_600_000);
          const order = await prisma.serviceRequest.create({
            data: {
              patientId: patient.id, type: "lab", code: panel.code, display: panel.display,
              status: "completed", indication: p.conditions[0]?.display, orderedById: pcpId,
              createdAt: start, signedAt: start, completedAt: issuedAt,
            },
          });
          // Results from the latest visit are still waiting in the PCP's Inbox.
          const reviewed = vIdx < visitDaysAgo.length - 1;
          const report = await prisma.diagnosticReport.create({
            data: {
              patientId: patient.id, code: panel.code, display: panel.display,
              performer: "Lakeview Reference Laboratory",
              effectiveAt: collected, issuedAt,
              status: "final", source: "ordered", orderId: order.id,
              reviewedAt: reviewed ? new Date(issuedAt.getTime() + 20 * 3_600_000) : null,
              reviewedById: reviewed ? pcpId : null,
            },
          });
          await prisma.observation.createMany({
            data: panel.analytes.map((a, idx) => {
              const [low, high, mid] = p.sex === "male" && a.male ? a.male : [a.low, a.high, a.mid];
              const bias = p.labBias?.[a.key] ?? 1;
              // The bias grows in over time, so later results show the trend.
              const effective = 1 + (bias - 1) * (0.6 + 0.4 * progress);
              const value = round(Math.max(0, mid * effective + between(-a.sd, a.sd)), a.dp);
              const range = { low, high, critLow: a.critLow, critHigh: a.critHigh };
              const refText = low === 0 ? `<${high + (a.dp ? 0 : 1)}` : high >= 999 ? `>${low}` : null;
              return {
                patientId: patient.id, encounterId: encounter.id, reportId: report.id,
                category: "laboratory" as const, code: a.loinc, display: a.display,
                valueNum: value, unit: a.unit,
                refLow: low === 0 ? null : low, refHigh: high >= 999 ? null : high, refText,
                flag: flagFor(value, range), effectiveAt: collected, sortOrder: idx,
              };
            }),
          });
        }
      }

      await prisma.note.create({
        data: {
          patientId: patient.id, encounterId: encounter.id, type: "progress",
          title: "Office visit",
          body: progressNote(p, vitalRows),
          status: "signed", authorId: pcpId, createdAt: start, serviceAt: start, templateId: "progress_soap",
          signedAt: new Date(start.getTime() + 3 * 3_600_000),
        },
      });
    }

    // A recent phone note for some, and a draft for the most recent visit of others.
    if (i % 3 === 0) {
      await prisma.note.create({
        data: {
          patientId: patient.id, type: "phone", title: "Telephone encounter",
          body: `Patient called regarding recent lab results. Reviewed values with patient. Questions answered; will discuss further at the next visit.`,
          status: "signed", authorId: "prac_lund", createdAt: daysAgo(14, 15, 20), serviceAt: daysAgo(14, 15, 20), signedAt: daysAgo(14, 15, 32),
        },
      });
    }

    if (p.reasonToday) {
      const start = daysAgo(0, p.visitHour ?? 9, [0, 20, 40][i % 3]);
      const vt = p.telehealth ? "video" : p.reasonToday === "Annual wellness visit" ? "annual" : p.reasonToday === "Shortness of breath" ? "same_day" : "follow_up";
      // Patient 3 didn't come in this morning.
      const todayVisit = await clinicVisit({ patientId: patient.id, providerId: pcpId, start, visitType: vt, reason: p.reasonToday, noShow: i === 3 });
      await todayNotes(i, p, patient.id, todayVisit.id, start);
    }
    await historyNotes(i, p, patient.id);
    for (const o of p.orders ?? []) {
      const def = orderables.get(o.code)!;
      const signed = o.status !== "pending";
      await prisma.serviceRequest.create({
        data: {
          patientId: patient.id, type: def.type, code: o.code, display: def.display,
          status: o.status, priority: o.priority ?? "routine", indication: o.indication, orderSet: o.orderSet,
          orderedById: pcpId, createdAt: daysAgo(o.daysAgo, 11), signedAt: signed ? daysAgo(o.daysAgo, 11) : null,
          expectedAt: o.dueInDays !== undefined ? daysAgo(-o.dueInDays, 0) : null,
        },
      });
    }

    await clinicVisit({ patientId: patient.id, providerId: pcpId, start: weekday(daysAgo(-(60 + i * 3), 10, 0)), visitType: "follow_up", reason: "Routine follow-up" });
    // A missed visit in the past for one patient.
    if (i === 3) {
      const missed = await prisma.encounter.create({
        data: { patientId: patient.id, type: "office", status: "no_show", visitType: "follow_up", reason: "Follow-up", start: daysAgo(45, 9, 0), end: daysAgo(45, 9, 20), providerId: pcpId, statusAt: daysAgo(45, 9, 20) },
      });
      await prisma.encounterEvent.create({ data: { encounterId: missed.id, action: "noShow", byId: "prac_mbeki", at: daysAgo(45, 9, 20) } });
    }
  }
  await seedClinicDay();
  await seedChat();

  await prisma.smartPhrase.createMany({
    data: [
      {
        ownerId: "prac_chen", name: "dmfoot", description: "Diabetic foot exam",
        body: "Diabetic foot exam: skin {Skin:intact|callus ***|ulcer ***}. Monofilament sensation {Monofilament:intact bilaterally|decreased ***}. Dorsalis pedis pulses {Pulses:2+ bilaterally|diminished ***}.",
      },
      {
        ownerId: "prac_chen", name: "uri", description: "Viral URI plan",
        body: "Likely viral upper respiratory infection. Supportive care with fluids, rest and {Symptomatic:acetaminophen|saline nasal spray|honey for cough}. Antibiotics not indicated. Return if fever over 3 days, shortness of breath or worsening symptoms.",
      },
    ],
  });

  const counts = await Promise.all([prisma.patient.count(), prisma.observation.count(), prisma.note.count()]);
  await seedOutsideDocuments();
  console.log(`Seeded ${counts[0]} patients, ${counts[1]} observations, ${counts[2]} notes.`);
}

// Synthetic pharmacies (not real businesses).
const pharmacies = [
  { id: "pharm_lakeview", name: "Lakeview Community Pharmacy", address: "220 N Main St, Lakeview, OR 97630", phone: "(555) 201-7700", fax: "(555) 201-7701" },
  { id: "pharm_cascade", name: "Cascade Drug #212", address: "1450 Center St, Lakeview, OR 97630", phone: "(555) 201-3390", fax: "(555) 201-3391" },
  { id: "pharm_riverside", name: "Riverside Pharmacy", address: "9 Water St, Paisley, OR 97636", phone: "(555) 943-2210", fax: null },
  { id: "pharm_mail", name: "MedSure Mail Order Pharmacy", address: "PO Box 4400, Portland, OR 97208", phone: "(555) 800-6274", fax: "(555) 800-6275", mailOrder: true },
];

// Current prescriptions with pharmacy fill history, an earlier prescription each
// replaced, refill requests from pharmacies, and today's medication review.
async function seedMeds(i: number, p: PatientDef, patientId: string, pcpId: string) {
  const pharmacyId = pharmacies[i % pharmacies.length].id;
  const roomedToday = !!p.reasonToday && (p.visitHour ?? 9) <= 9;
  const reviewedAt = roomedToday ? daysAgo(0, (p.visitHour ?? 9) - 1, 50) : i === 10 ? null : daysAgo(21, 9 + (i % 7), 15);
  await prisma.patient.update({
    where: { id: patientId },
    data: { medsReviewedAt: reviewedAt, medsReviewedById: reviewedAt ? (roomedToday ? "prac_lund" : pcpId) : null },
  });

  for (const m of p.meds) {
    const status = m.status ?? "active";
    const product = productFor({ rxnorm: m.rxnorm, drug: m.drug });
    const startAgo = 200 + Math.round(rand() * 1400);
    const taking: PatientTaking | null = reviewedAt && status !== "discontinued" ? (m.taking ?? "taking") : null;
    const review = { taking, takingNote: taking ? (m.takingNote ?? null) : null, takingAt: taking ? reviewedAt : null };

    if (m.historical) {
      await prisma.medicationRequest.create({
        data: {
          patientId, drug: m.drug, rxnorm: m.rxnorm, dose: m.dose, route: m.route, frequency: m.frequency, indication: m.indication,
          status, start: daysAgo(startAgo), rxClass: "historical", authoredAt: daysAgo(startAgo), pharmacyNote: "Over the counter", ...review,
        },
      });
      continue;
    }

    if (status === "discontinued") {
      const endAgo = Math.round(startAgo / 3);
      await prisma.medicationRequest.create({
        data: {
          patientId, drug: m.drug, rxnorm: m.rxnorm, dose: m.dose, route: m.route, frequency: m.frequency, indication: m.indication,
          status, start: daysAgo(startAgo), end: daysAgo(endAgo), endReason: m.endReason ?? "Discontinued", endedById: pcpId,
          prescriberId: pcpId, authoredAt: daysAgo(startAgo), quantity: product?.quantity, refills: product?.refills ?? 0, pharmacyId,
        },
      });
      continue;
    }

    const supply = product?.days ?? 30;
    const refills = product?.refills ?? 3;
    const refillsLeft = m.refillsLeft ?? Math.min(refills, 1 + Math.floor(rand() * refills));
    const fills = refills - refillsLeft + 1;
    // The last fill runs out a few days to most of a supply from now, or lateDays ago.
    const runsOutIn = m.lateDays !== undefined ? -m.lateDays : m.request ? 3 : Math.round(between(6, Math.max(8, supply - 5)));
    const lastFillAgo = supply - runsOutIn;
    const authoredAgo = lastFillAgo + (fills - 1) * supply + 1;

    const prior = await prisma.medicationRequest.create({
      data: {
        patientId, drug: m.residentChangedFrom?.drug ?? m.drug, rxnorm: m.residentChangedFrom?.rxnorm ?? m.rxnorm,
        dose: m.residentChangedFrom?.dose ?? m.dose, route: m.route, frequency: m.frequency, indication: m.indication,
        status: m.residentChangedFrom ? "active" : "replaced",
        start: daysAgo(Math.max(startAgo, authoredAgo + 365)), end: m.residentChangedFrom ? null : daysAgo(authoredAgo),
        endReason: m.residentChangedFrom ? null : "Reordered", endedById: m.residentChangedFrom ? null : pcpId,
        prescriberId: pcpId, authoredAt: daysAgo(authoredAgo + (m.residentChangedFrom ? 0 : 365)),
        quantity: product?.quantity, daysSupply: supply, refills, pharmacyId, sentAt: daysAgo(authoredAgo + 365),
      },
    });
    const current = m.residentChangedFrom
      ? prior
      : await prisma.medicationRequest.create({
          data: {
            patientId, drug: m.drug, rxnorm: m.rxnorm, dose: m.dose, route: m.route, frequency: m.frequency, indication: m.indication,
            status, start: prior.start, prescriberId: pcpId, authoredAt: daysAgo(authoredAgo, 11), sentAt: daysAgo(authoredAgo, 11),
            quantity: product?.quantity, daysSupply: supply, refills, pharmacyId, priorId: prior.id, ...review,
          },
        });
    await prisma.medicationDispense.createMany({
      data: Array.from({ length: fills }, (_, n) => ({
        patientId, medicationId: current.id, pharmacyId, quantity: product?.quantity ?? "30 tablets", daysSupply: supply,
        filledAt: daysAgo(lastFillAgo + (fills - 1 - n) * supply, 15),
      })),
    });

    if (m.request) {
      const pended = !!m.request.pendNote;
      await prisma.refillRequest.create({
        data: {
          patientId, medicationId: current.id, pharmacyId, requestedAt: daysAgo(pended ? 2 : 1, 7, 40 + i),
          pharmacyComment: m.request.comment ?? null, status: pended ? "pended" : "requested",
          pendedById: pended ? "prac_lund" : null, pendedAt: pended ? daysAgo(1, 10, 5) : null, pendNote: m.request.pendNote ?? null,
        },
      });
    }

    // The resident's change from this morning's visit: sent, waiting on Dr. Chen's cosignature.
    if (m.residentChangedFrom) {
      const at = daysAgo(0, 8, 45);
      await prisma.medicationRequest.update({ where: { id: prior.id }, data: { status: "replaced", end: at, endReason: `Changed to ${m.drug}`, endedById: "prac_brandt" } });
      await prisma.medicationRequest.create({
        data: {
          patientId, drug: m.drug, rxnorm: m.rxnorm, dose: m.dose, route: m.route, frequency: m.frequency, indication: m.indication,
          status, start: prior.start, prescriberId: "prac_brandt", cosignerId: "prac_chen", authoredAt: at, sentAt: at,
          quantity: product?.quantity, daysSupply: supply, refills, pharmacyId, priorId: prior.id, ...review,
        },
      });
    }
  }
}

// Notes that show the documentation workflow: a resident's notes waiting on
// Dr. Chen's cosignature and a pended note of hers with blanks still to fill.
async function todayNotes(i: number, p: PatientDef, patientId: string, encounterId: string, start: Date) {
  const problems = p.conditions.filter((c) => c.status !== "resolved");
  const ap = problems.map((c, n) => `${n + 1}. ${c.display} (${c.code})`);
  if (i === 0 || i === 2) {
    const signedAt = new Date(start.getTime() + 50 * 60_000);
    await prisma.note.create({
      data: {
        patientId, encounterId, type: "progress", templateId: "progress_soap", title: "Office visit (resident)",
        body: [
          "CHIEF COMPLAINT", p.reasonToday ?? "Follow-up", "",
          "SUBJECTIVE",
          i === 0
            ? `${p.firstName} reports checking glucose twice daily, fasting readings mostly 130s to 150s. No hypoglycemia. Occasional tingling in both feet at night.`
            : `${p.firstName} reports 3 months of fatigue, worse in the afternoon, with cold intolerance and dry skin. Sleeping 8 hours. No weight change.`,
          "",
          "OBJECTIVE", "Vitals reviewed and stable. General: well appearing.",
          i === 0 ? "Feet: monofilament sensation decreased at both great toes. Pulses 2+." : "Thyroid: not enlarged, no nodules. Skin: dry.",
          "",
          "ASSESSMENT AND PLAN",
          ...ap.flatMap((l, n) => (n === 0 ? [l, i === 0 ? "   A1c above goal. Increase metformin; recheck A1c in 3 months. Refer for diabetic foot care." : "   Check TSH and free T4 today; adjust levothyroxine if needed."] : [l, "   Stable, continue current management."])),
          "",
          "Discussed with attending Dr. Chen.",
          "Return to clinic in 3 months or sooner as needed.",
        ].join("\n"),
        status: "pending_cosign", authorId: "prac_brandt", cosignerId: "prac_chen",
        createdAt: start, serviceAt: start, signedAt,
      },
    });
  }
  if (i === 8) {
    await prisma.note.create({
      data: {
        patientId, encounterId, type: "progress", templateId: "progress_soap", title: "Office visit",
        body: [
          "CHIEF COMPLAINT", "Back pain", "",
          "SUBJECTIVE",
          `${p.firstName} reports low back pain for 2 weeks after lifting boxes, worse with bending. No leg weakness, numbness, or bladder or bowel changes.`,
          "Tried ibuprofen with {Relief:no relief|partial relief|good relief}.", "",
          "OBJECTIVE", "General: in mild distress.",
          "Back: paraspinal tenderness at L4-L5. Straight leg raise ***. Strength 5/5 bilaterally.", "",
          "ASSESSMENT AND PLAN",
          "1. Acute low back pain without sciatica (M54.50)",
          "Assessment: likely mechanical strain, no red flags.",
          "Plan: ***", "",
          "Return to clinic in {Return:1 week|2 weeks|1 month} or sooner as needed.",
        ].join("\n"),
        status: "draft", authorId: "prac_chen", createdAt: start, serviceAt: start,
      },
    });
  }
}

// Older notes of other kinds: a cardiology consult, a procedure, a new-patient H&P, an addendum.
async function historyNotes(i: number, p: PatientDef, patientId: string) {
  if (i === 1) {
    const at = daysAgo(95, 14, 0);
    await prisma.note.create({
      data: {
        patientId, type: "consult", templateId: "consult", title: "Cardiology consult",
        body: [
          "REASON FOR CONSULTATION", "Asked by Rafael Ibarra, DO to evaluate heart failure with reduced ejection fraction and medication optimization.", "",
          "HISTORY OF PRESENT ILLNESS",
          `${p.firstName} is a ${p.age} y.o. male with HFrEF (EF 35% on last echo) reporting stable NYHA class II symptoms. Sleeps on two pillows. No syncope.`, "",
          "IMPRESSION", "Chronic HFrEF, euvolemic today, on partial guideline-directed therapy.", "",
          "RECOMMENDATIONS",
          "1. Continue current beta blocker; titrate as heart rate allows.",
          "2. Consider adding an SGLT2 inhibitor if eGFR permits.",
          "3. Daily weights; call for a gain of more than 2 lb in a day or 5 lb in a week.",
          "4. Repeat echocardiogram in 6 months.", "",
          "Thank you for this consultation. We will see the patient again in clinic in 3 months.",
        ].join("\n"),
        status: "signed", authorId: "prac_marsh", createdAt: at, serviceAt: at, signedAt: new Date(at.getTime() + 2 * 3_600_000),
      },
    });
  }
  if (i === 4) {
    const at = daysAgo(150, 11, 30);
    await prisma.note.create({
      data: {
        patientId, type: "procedure", templateId: "procedure_joint", title: "Joint injection",
        body: [
          "PROCEDURE", "Right knee corticosteroid injection.", "",
          "INDICATION", "Right knee osteoarthritis with persistent pain despite acetaminophen and physical therapy.", "",
          "CONSENT",
          "Risks including bleeding, infection, pain and damage to surrounding structures, benefits and alternatives were discussed. Verbal informed consent obtained from the patient. A time-out was performed confirming patient, site and procedure.", "",
          "DESCRIPTION",
          "Landmarks identified via palpation. The site was prepped with chlorhexidine. Using a 22 gauge needle, 40 mg triamcinolone mixed with 4 mL 1% lidocaine was injected without resistance.",
          "Complications: none. Patient tolerated the procedure well.", "",
          "AFTERCARE", "Ice as needed, avoid strenuous use for 48 hours. Watch for redness, warmth or fever. No repeat injection in this joint for at least 3 months.",
        ].join("\n"),
        status: "signed", authorId: "prac_chen", createdAt: at, serviceAt: at, signedAt: new Date(at.getTime() + 3_600_000),
      },
    });
  }
  if (i === 10) {
    const at = daysAgo(540, 9, 40);
    await prisma.note.create({
      data: {
        patientId, type: "history_physical", templateId: "hp_new", title: "New patient history and physical",
        body: [
          "CHIEF COMPLAINT", "Establish care.", "",
          "HISTORY OF PRESENT ILLNESS", `${p.firstName} is a ${p.age} y.o. female establishing care after moving to the area. Feels well. No acute concerns.`, "",
          "PAST MEDICAL HISTORY", ...p.conditions.map((c, n) => `${n + 1}. ${c.display} (${c.code})`), "",
          "SOCIAL HISTORY", "Tobacco: never. Alcohol: social. Occupation: graduate student.", "",
          "FAMILY HISTORY", "Mother with hypertension. Father with type 2 diabetes.", "",
          "PHYSICAL EXAM", "General: alert, oriented, in no acute distress. Cardiovascular: regular rate and rhythm. Lungs: clear bilaterally.", "",
          "ASSESSMENT AND PLAN", "1. Encounter to establish care (Z76.89): records requested, routine labs ordered.", "",
          "Return to clinic in 1 year or sooner as needed.",
        ].join("\n"),
        status: "signed", authorId: "prac_chen", createdAt: at, serviceAt: at, signedAt: new Date(at.getTime() + 2 * 3_600_000),
      },
    });
  }
  if (i === 0) {
    // Addend the most recent office visit once its labs came back.
    const last = await prisma.note.findFirst({ where: { patientId, type: "progress", status: "signed" }, orderBy: { serviceAt: "desc" } });
    if (last) {
      await prisma.noteAddendum.create({
        data: { noteId: last.id, authorId: "prac_chen", signedAt: new Date(last.serviceAt.getTime() + 2 * DAY), body: "Labs from this visit reviewed. A1c above goal; will intensify therapy at the next visit. Patient notified through the portal." },
      });
      await prisma.note.update({ where: { id: last.id }, data: { status: "addended" } });
    }
  }
}

// Outside documents from samples/, as if uploaded through Import: one filed and
// reviewed, one filed by the resident and waiting in the PCP's Inbox, and one a
// nurse has prepared that still needs a physician to verify it.
async function seedOutsideDocuments() {
  const pngSize = (b: Buffer) => ({ width: b.readUInt32BE(16), height: b.readUInt32BE(20) });
  async function importDoc(o: {
    lastName: string;
    sample: string;
    uploadedById: string;
    createdAt: Date;
    filed?: { byId: string; at: Date; reviewedById?: string };
    edit?: (d: DocDraft) => void;
  }) {
    const patient = await prisma.patient.findFirstOrThrow({ where: { lastName: o.lastName } });
    const data = readFileSync(`samples/${o.sample}.png`);
    const size = pngSize(data);
    const extraction = JSON.parse(readFileSync(`samples/${o.sample}.extraction.json`, "utf8")) as ExtractedDocument;
    const draft = docDraftFromExtraction(extraction, [size]);
    const orders = await prisma.serviceRequest.findMany({ where: { patientId: patient.id, status: "signed", type: { in: ["imaging", "referral", "procedure"] } } });
    draft.orderId = suggestOrder(draft, orders.map((x) => ({ id: x.id, type: x.type, code: x.code, display: x.display, signedAt: (x.signedAt ?? x.createdAt).toISOString() })));
    o.edit?.(draft);
    const job = await prisma.importJob.create({
      data: {
        patientId: patient.id,
        kind: "document",
        status: o.filed ? "filed" : "needs_review",
        model: "fixture",
        extraction,
        draft,
        createdById: o.uploadedById,
        createdAt: o.createdAt,
        filedAt: o.filed?.at,
        filedById: o.filed?.byId,
        documents: {
          create: {
            patientId: patient.id,
            kind: o.filed ? draft.type : "clinical_document",
            fileName: `${o.sample}.png`,
            mimeType: "image/png",
            size: data.length,
            ...size,
            data,
            uploadedById: o.uploadedById,
            uploadedAt: o.createdAt,
          },
        },
      },
    });
    if (!o.filed) return;
    const serviceDate = new Date(`${draft.serviceDate}T00:00:00Z`);
    for (const d of draft.diagnoses.filter((x) => x.addToProblems)) {
      await prisma.condition.create({
        data: { patientId: patient.id, code: d.icd10 || "R69", display: d.text, status: "active", onset: serviceDate, priority: 50, comment: `From imaging report: ${draft.title}, ${draft.organization}` },
      });
    }
    if (draft.orderId) await prisma.serviceRequest.update({ where: { id: draft.orderId }, data: { status: "completed", completedAt: o.filed.at } });
    await prisma.clinicalDocument.create({
      data: {
        patientId: patient.id,
        type: draft.type,
        title: draft.title,
        organization: draft.organization || null,
        author: draft.author || null,
        serviceDate,
        content: docContent(draft),
        importJobId: job.id,
        orderId: draft.orderId,
        filedById: o.filed.byId,
        filedAt: o.filed.at,
        reviewedAt: o.filed.reviewedById ? o.filed.at : null,
        reviewedById: o.filed.reviewedById ?? null,
      },
    });
  }

  await importDoc({
    lastName: "Tanabe",
    sample: "synthetic-ct-chest-report",
    uploadedById: "prac_lund",
    createdAt: daysAgo(20, 10, 5),
    filed: { byId: "prac_ibarra", at: daysAgo(20, 12, 30), reviewedById: "prac_ibarra" },
    edit: (d) => {
      d.diagnoses.forEach((x) => (x.addToProblems = x.icd10 === "R91.1"));
      d.diagnoses.forEach((x) => (x.text = x.icd10 === "R91.1" ? "Solitary pulmonary nodule, right upper lobe, 7 mm" : x.text));
    },
  });
  await importDoc({
    lastName: "Montenegro",
    sample: "synthetic-ruq-ultrasound",
    uploadedById: "prac_lund",
    createdAt: daysAgo(1, 9, 10),
    filed: { byId: "prac_brandt", at: daysAgo(1, 11, 45) },
    edit: (d) => {
      const stones = d.diagnoses.find((x) => x.icd10 === "K80.20")!;
      Object.assign(stones, { addToProblems: true, text: "Calculus of gallbladder without cholecystitis" });
    },
  });
  await importDoc({ lastName: "Brightwater", sample: "synthetic-eye-consult-letter", uploadedById: "prac_lund", createdAt: daysAgo(0, 7, 40) });
}

function progressNote(p: PatientDef, vitals: { display: string; value: number; unit: string }[]) {
  const v = Object.fromEntries(vitals.map((x) => [x.display, x.value]));
  const problems = p.conditions.filter((c) => c.status !== "resolved");
  return [
    `SUBJECTIVE`,
    `${p.firstName} presents for follow-up of chronic conditions. Reports taking medications as prescribed. No new complaints today.`,
    ``,
    `OBJECTIVE`,
    `BP ${v["Systolic BP"]}/${v["Diastolic BP"]}, HR ${v["Heart rate"]}, RR ${v["Respiratory rate"]}, T ${v["Temperature"]} C, SpO2 ${v["SpO2"]}%, Wt ${v["Weight"]} kg.`,
    `General: alert, in no acute distress. Heart: regular rate. Lungs: clear bilaterally.`,
    ``,
    `ASSESSMENT AND PLAN`,
    ...problems.map((c, idx) => `${idx + 1}. ${c.display} (${c.code}): stable. Continue current management.`),
    ``,
    `Return to clinic in 3 months or sooner as needed.`,
  ].join("\n");
}

// Provider templates: weekday sessions with a lunch break. Everyone also works
// today's weekday, so the seeded clinic day always sits inside open sessions.
const PAYERS = ["Cascade Health Plan", "Lakeview Medicare Advantage", "Pinecrest Community Medicaid", "Northstar PPO"];
const TEMPLATES: { id: string; days: number[]; sessions: [number, number][]; slot: number }[] = [
  { id: "prac_chen", days: [1, 2, 3, 4, 5], sessions: [[8 * 60, 12 * 60], [13 * 60, 17 * 60]], slot: 20 },
  { id: "prac_ibarra", days: [1, 2, 3, 4, 5], sessions: [[8 * 60, 12 * 60], [13 * 60, 16 * 60 + 40]], slot: 20 },
  { id: "prac_brandt", days: [1, 3, 4], sessions: [[8 * 60, 12 * 60], [13 * 60, 16 * 60]], slot: 20 },
  { id: "prac_marsh", days: [2, 4], sessions: [[9 * 60, 12 * 60], [13 * 60, 16 * 60]], slot: 20 },
];

async function seedTemplates() {
  await prisma.scheduleSession.createMany({
    data: TEMPLATES.flatMap((t) =>
      [...new Set([...t.days, today.getDay()])].flatMap((weekday) =>
        t.sessions.map(([startMin, endMin]) => ({ practitionerId: t.id, weekday, startMin, endMin, slotMinutes: t.slot })),
      ),
    ),
  });
  const tomorrow = weekday(daysAgo(-1, 0, 0));
  const nextFriday = daysAgo(-(((5 - today.getDay() + 7) % 7) + 7), 0, 0);
  await prisma.scheduleBlock.createMany({
    data: [
      { practitionerId: "prac_marsh", start: daysAgo(0, 11, 0), end: daysAgo(0, 12, 0), reason: "Echo reading" },
      { practitionerId: "prac_ibarra", start: new Date(tomorrow.getTime() + 13 * 3_600_000), end: new Date(tomorrow.getTime() + 15 * 3_600_000), reason: "Hospital committee" },
      { practitionerId: "prac_chen", start: nextFriday, end: new Date(nextFriday.getTime() + DAY - 60_000), reason: "Vacation" },
    ],
  });
}

// Saturday and Sunday move to the following Monday.
function weekday(d: Date) {
  const out = new Date(d);
  while (out.getDay() === 0 || out.getDay() === 6) out.setDate(out.getDate() + 1);
  return out;
}

const VISIT_MINUTES: Record<string, number> = { follow_up: 20, same_day: 20, video: 20, new_patient: 40, annual: 40, procedure: 40, consult: 40 };
const ROOMS = ["Exam 1", "Exam 2", "Exam 3", "Exam 4", "Exam 5", "Exam 6"];
let roomTurn = 0;

// An appointment booked by the front desk. One that falls today is walked through
// the clinic day as far as the seed's clock allows: checked in a few minutes early,
// roomed, seen, done and checked out, so My Day shows a clinic in progress.
async function clinicVisit({
  patientId, providerId, start, visitType, reason, noShow, cancelled,
}: { patientId: string; providerId: string; start: Date; visitType: string; reason: string; noShow?: boolean; cancelled?: string }) {
  const minutes = VISIT_MINUTES[visitType];
  const end = new Date(start.getTime() + minutes * 60_000);
  const video = visitType === "video";
  const now = Date.now();
  const at = (m: number) => new Date(start.getTime() + m * 60_000);
  const isToday = start.toDateString() === today.toDateString();
  const steps: { action: string; at: Date; by: string; status: "arrived" | "roomed" | "in_progress" | "finished" | "checked_out" }[] = isToday && !noShow && !cancelled
    ? [
        { action: "arrive", at: at(video ? -4 : -8), by: "prac_mbeki", status: "arrived" as const },
        ...(video ? [] : [{ action: "room", at: at(5), by: "prac_lund", status: "roomed" as const }]),
        { action: "start", at: at(video ? 2 : 12), by: providerId, status: "in_progress" as const },
        { action: "complete", at: at(minutes + 8), by: providerId, status: "finished" as const },
        { action: "checkOut", at: at(minutes + 15), by: "prac_mbeki", status: "checked_out" as const },
      ].filter((s) => s.at.getTime() <= now)
    : [];
  const last = steps.at(-1);
  const missed = noShow && isToday && now > at(20).getTime();
  const roomed = steps.some((s) => s.action === "room");
  const encounter = await prisma.encounter.create({
    data: {
      patientId, providerId, start, end, visitType, reason,
      type: video ? "telehealth" : "office",
      status: cancelled ? "cancelled" : missed ? "no_show" : (last?.status ?? "planned"),
      statusAt: last?.at ?? (missed ? at(20) : daysAgo(12, 10)),
      arrivedAt: steps[0]?.at ?? null,
      copayCents: steps.length && !video ? 50000 : null,
      copayMethod: steps.length && !video ? "cash" : null,
      room: roomed ? ROOMS[roomTurn++ % ROOMS.length] : null,
      chiefComplaint: roomed ? reason : null,
      allergiesReviewedAt: roomed ? steps[1].at : null,
      medsReviewedAt: roomed ? steps[1].at : null,
      cancelReason: cancelled ?? null,
    },
  });
  await prisma.encounterEvent.createMany({
    data: [
      { encounterId: encounter.id, action: "booked", byId: "prac_mbeki", at: daysAgo(12, 10) },
      ...steps.map((s) => ({ encounterId: encounter.id, action: s.action, byId: s.by, at: s.at, detail: s.action === "room" ? encounter.room : null })),
      ...(missed ? [{ encounterId: encounter.id, action: "noShow", byId: "prac_mbeki", at: at(20) }] : []),
      ...(cancelled ? [{ encounterId: encounter.id, action: "cancel", byId: "prac_mbeki", at: daysAgo(0, 7, 40), detail: cancelled }] : []),
    ],
  });
  return encounter;
}

// The rest of the clinic: the resident's and the cardiologist's patients today,
// a cancellation, and scattered bookings over the next two weeks so open-slot
// search has a realistic mix of free and taken times.
async function seedClinicDay() {
  const all = await prisma.patient.findMany({ orderBy: { mrn: "asc" } });
  const pt = (i: number) => all[i].id;
  await clinicVisit({ patientId: pt(10), providerId: "prac_brandt", start: daysAgo(0, 8, 40), visitType: "follow_up", reason: "Acne follow-up" });
  await clinicVisit({ patientId: pt(11), providerId: "prac_brandt", start: daysAgo(0, 13, 40), visitType: "same_day", reason: "Gout flare, right toe" });
  await clinicVisit({ patientId: pt(1), providerId: "prac_marsh", start: daysAgo(0, 9, 20), visitType: "consult", reason: "Heart failure follow-up" });
  await clinicVisit({ patientId: pt(4), providerId: "prac_marsh", start: daysAgo(0, 14, 0), visitType: "consult", reason: "Palpitations" });
  await clinicVisit({ patientId: pt(10), providerId: "prac_chen", start: daysAgo(0, 16, 0), visitType: "follow_up", reason: "Rash", cancelled: "Patient ill" });

  const providers = ["prac_chen", "prac_ibarra", "prac_chen", "prac_ibarra", "prac_brandt"];
  const taken = new Set<string>();
  for (let n = 0; n < 40; n++) {
    const providerId = providers[n % providers.length];
    const template = TEMPLATES.find((t) => t.id === providerId)!;
    const day = weekday(daysAgo(-(1 + Math.floor(rand() * 13)), 0, 0));
    if (!template.days.includes(day.getDay())) continue;
    const [from, to] = template.sessions[Math.floor(rand() * template.sessions.length)];
    const startMin = from + 20 * Math.floor(rand() * ((to - from) / 20));
    const start = new Date(day.getTime() + startMin * 60_000);
    const key = `${providerId}-${start.getTime()}`;
    const blocked = await prisma.scheduleBlock.count({ where: { practitionerId: providerId, start: { lt: new Date(start.getTime() + 20 * 60_000) }, end: { gt: start } } });
    if (taken.has(key) || blocked) continue;
    taken.add(key);
    const patientId = pt(Math.floor(rand() * all.length));
    const clash = await prisma.encounter.count({ where: { patientId, start: { gte: day, lt: new Date(day.getTime() + DAY) } } });
    if (clash) continue;
    await clinicVisit({ patientId, providerId, start, visitType: rand() < 0.25 ? "same_day" : "follow_up", reason: rand() < 0.5 ? "Follow-up" : "Medication check" });
  }
}

// Secure chat for the demo: an urgent nurse message waiting for Dr. Chen, a
// consult note from cardiology, a resident's question, the front desk asking to
// overbook, and a clinic huddle group. Times are minutes before seeding.
async function seedChat() {
  const patient = async (lastName: string) => (await prisma.patient.findFirstOrThrow({ where: { lastName } })).id;
  const ago = (min: number) => new Date(Date.now() - min * 60_000);
  type Line = [sender: string, minutesAgo: number, body: string, urgent?: boolean];
  async function conversation(opts: { title?: string; patientId?: string; members: string[]; read: Record<string, number>; muted?: string[]; lines: Line[] }) {
    const first = Math.max(...opts.lines.map((l) => l[1]));
    await prisma.conversation.create({
      data: {
        title: opts.title ?? null,
        patientId: opts.patientId ?? null,
        createdById: opts.lines[0][0],
        createdAt: ago(first),
        lastMessageAt: ago(Math.min(...opts.lines.map((l) => l[1]))),
        members: {
          create: opts.members.map((id) => ({
            practitionerId: id,
            joinedAt: ago(first + 1),
            lastReadAt: opts.read[id] === undefined ? null : ago(opts.read[id]),
            muted: opts.muted?.includes(id) ?? false,
          })),
        },
        messages: { create: opts.lines.map(([senderId, min, body, urgent]) => ({ senderId, body, urgent: !!urgent, createdAt: ago(min) })) },
      },
    });
  }

  await conversation({
    patientId: await patient("Brightwater"),
    members: ["prac_lund", "prac_chen"],
    read: { prac_lund: 6, prac_chen: 95 },
    lines: [
      ["prac_lund", 100, "Ms. Brightwater is checked in for her 8:00. Fasting labs drawn."],
      ["prac_chen", 96, "Thanks, room her when you can."],
      ["prac_lund", 6, "Repeat BP 182/104 after 10 min seated. Headache since this morning, no chest pain, no vision change, no weakness. Room her now or wait for you?", true],
    ],
  });
  await conversation({
    patientId: await patient("Okonkwo-Hale"),
    members: ["prac_marsh", "prac_chen"],
    read: { prac_marsh: 40, prac_chen: 300 },
    lines: [["prac_marsh", 40, "Saw Mr. Okonkwo-Hale this morning. Up 2.5 kg with ankle edema, so I increased furosemide to 40 mg twice daily. Could you get a BMP in one week and send me the result?"]],
  });
  await conversation({
    patientId: await patient("Achterberg"),
    members: ["prac_brandt", "prac_chen"],
    read: { prac_brandt: 12, prac_chen: 15 },
    lines: [
      ["prac_brandt", 25, "Quick question on Mr. Achterberg before his 1:40: urate was 9.1 last month on allopurinol 300. Go up to 400 now, or wait until this flare settles?"],
      ["prac_brandt", 24, "He's taking colchicine for the flare."],
      ["prac_chen", 15, "Don't change the dose mid-flare, but don't stop it either. Treat the flare, then titrate once it has settled and recheck urate in 4 weeks."],
    ],
  });
  await conversation({
    patientId: await patient("Raman"),
    members: ["prac_mbeki", "prac_chen"],
    read: { prac_mbeki: 50, prac_chen: 55 },
    lines: [
      ["prac_mbeki", 62, "Ms. Raman is at the window asking to be seen today. Can I overbook her at 3:40?"],
      ["prac_chen", 55, "Yes, that's fine. Book it as same-day."],
    ],
  });
  await conversation({
    title: "Lakeview huddle",
    members: ["prac_chen", "prac_ibarra", "prac_brandt", "prac_lund", "prac_mbeki"],
    read: { prac_chen: 80, prac_ibarra: 85, prac_brandt: 30, prac_lund: 18, prac_mbeki: 18 },
    lines: [
      ["prac_lund", 90, "Morning all. Room 4 is out until facilities fixes the exam light, use 5 and 6."],
      ["prac_ibarra", 85, "Thanks. I'm at committee 1 to 3 tomorrow, so please don't book me then."],
      ["prac_mbeki", 18, "Dr. Brandt's 1:40 called, running about 15 minutes late."],
    ],
  });

  await prisma.practitioner.update({ where: { id: "prac_marsh" }, data: { chatStatus: "busy", chatStatusNote: "Reading echos until noon" } });
  await prisma.practitioner.update({ where: { id: "prac_ibarra" }, data: { chatStatus: "away", chatStatusNote: "Hospital rounds" } });

  // Link each medication and order to the problem its indication names, so the
  // problem list and a note's assessment and plan show them under it.
  for (const c of await prisma.patient.findMany({ select: { id: true, conditions: { where: { status: "active" }, select: { id: true, display: true } } } })) {
    const [meds, orders] = await Promise.all([
      prisma.medicationRequest.findMany({ where: { patientId: c.id, indication: { not: null } }, select: { id: true, indication: true } }),
      prisma.serviceRequest.findMany({ where: { patientId: c.id, indication: { not: null } }, select: { id: true, indication: true } }),
    ]);
    for (const m of meds) {
      const p = matchProblem(m.indication, c.conditions);
      if (p) await prisma.medicationRequest.update({ where: { id: m.id }, data: { conditionId: p.id } });
    }
    for (const o of orders) {
      const p = matchProblem(o.indication, c.conditions);
      if (p) await prisma.serviceRequest.update({ where: { id: o.id }, data: { conditionId: p.id } });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
