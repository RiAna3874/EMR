// Seeds Meridian EMR with fully synthetic patients (no real PHI).
// A seeded PRNG keeps the data identical between runs, and "today" is
// the day the seed runs so the clinic schedule always has appointments.
import {
  PrismaClient,
  type Flag,
  type Sex,
  type AllergySeverity,
  type AllergyType,
} from "@prisma/client";

const prisma = new PrismaClient();

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
type MedDef = { drug: string; rxnorm: string; dose: string; route: string; frequency: string; indication?: string; status?: "active" | "on_hold" | "discontinued" };
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
      { drug: "Metformin 1000 mg tablet", rxnorm: "861004", dose: "1000 mg", route: "oral", frequency: "twice daily with meals", indication: "Type 2 diabetes" },
      { drug: "Lisinopril 20 mg tablet", rxnorm: "314077", dose: "20 mg", route: "oral", frequency: "once daily", indication: "Hypertension" },
      { drug: "Atorvastatin 40 mg tablet", rxnorm: "617311", dose: "40 mg", route: "oral", frequency: "nightly", indication: "Hyperlipidemia" },
      { drug: "Glipizide 5 mg tablet", rxnorm: "310488", dose: "5 mg", route: "oral", frequency: "once daily", indication: "Type 2 diabetes", status: "discontinued" },
    ],
    vitals: { sbp: 142, dbp: 88, hr: 78, weightKg: 88, heightCm: 163 },
    labBias: { glucose: 1.6, a1c: 1.45, ldl: 1.2, tg: 1.4, creatinine: 1.15 },
    reasonToday: "Diabetes follow-up", visitHour: 8,
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
      { drug: "Apixaban 5 mg tablet", rxnorm: "1364445", dose: "5 mg", route: "oral", frequency: "twice daily", indication: "Atrial fibrillation" },
      { drug: "Metoprolol succinate ER 50 mg tablet", rxnorm: "866436", dose: "50 mg", route: "oral", frequency: "once daily", indication: "Rate control" },
      { drug: "Furosemide 40 mg tablet", rxnorm: "313988", dose: "40 mg", route: "oral", frequency: "once daily", indication: "Heart failure" },
    ],
    vitals: { sbp: 128, dbp: 76, hr: 88, weightKg: 94, heightCm: 180, spo2: 94 },
    labBias: { creatinine: 1.7, bun: 1.6, egfr: 0.55, potassium: 1.12, hgb: 0.88 },
    reasonToday: "CHF check, weight gain", visitHour: 8,
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
      { drug: "Levothyroxine 75 mcg tablet", rxnorm: "966222", dose: "75 mcg", route: "oral", frequency: "once daily before breakfast", indication: "Hypothyroidism" },
      { drug: "Ferrous sulfate 325 mg tablet", rxnorm: "310325", dose: "325 mg", route: "oral", frequency: "once daily", indication: "Iron deficiency" },
    ],
    vitals: { sbp: 112, dbp: 70, hr: 84, weightKg: 61, heightCm: 165 },
    labBias: { tsh: 2.2, hgb: 0.8, mcv: 0.86, ferritin: 0.2 },
    reasonToday: "Fatigue, recheck thyroid", visitHour: 9,
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
      { drug: "Fluticasone/salmeterol 250/50 mcg inhaler", rxnorm: "896188", dose: "1 puff", route: "inhaled", frequency: "twice daily", indication: "Asthma" },
      { drug: "Albuterol HFA 90 mcg inhaler", rxnorm: "745679", dose: "2 puffs", route: "inhaled", frequency: "every 4 hours as needed", indication: "Wheezing" },
      { drug: "Omeprazole 20 mg capsule", rxnorm: "311353", dose: "20 mg", route: "oral", frequency: "once daily", indication: "GERD" },
      { drug: "Epinephrine 0.3 mg auto-injector", rxnorm: "727316", dose: "0.3 mg", route: "intramuscular", frequency: "once as needed", indication: "Anaphylaxis" },
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
      { drug: "Cholecalciferol 2000 unit capsule", rxnorm: "636676", dose: "2000 units", route: "oral", frequency: "once daily", indication: "Vitamin D" },
    ],
    vitals: { sbp: 136, dbp: 74, hr: 68, weightKg: 54, heightCm: 155 },
    labBias: { sodium: 0.97, vitd: 0.6 },
    reasonToday: "Annual wellness visit", visitHour: 10,
  },
  {
    firstName: "Jonah", lastName: "Kessler", sex: "male", age: 29,
    phone: "(555) 905-3378", address: "18 Orchard Way, Lakeview, OR 97630",
    conditions: [{ code: "F41.1", display: "Generalized anxiety disorder", onsetYearsAgo: 2 }],
    meds: [{ drug: "Sertraline 50 mg tablet", rxnorm: "312940", dose: "50 mg", route: "oral", frequency: "once daily", indication: "Anxiety" }],
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
      { drug: "Prednisone 20 mg tablet", rxnorm: "312617", dose: "40 mg", route: "oral", frequency: "once daily x5 days", indication: "COPD exacerbation", status: "discontinued" },
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
      { drug: "Cyclobenzaprine 10 mg tablet", rxnorm: "828320", dose: "10 mg", route: "oral", frequency: "nightly as needed", indication: "Back spasm", status: "on_hold" },
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
      { drug: "Aspirin 81 mg tablet", rxnorm: "243670", dose: "81 mg", route: "oral", frequency: "once daily", indication: "CAD" },
      { drug: "Rosuvastatin 20 mg tablet", rxnorm: "859751", dose: "20 mg", route: "oral", frequency: "once daily", indication: "CAD" },
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
      { drug: "Allopurinol 300 mg tablet", rxnorm: "197320", dose: "300 mg", route: "oral", frequency: "once daily", indication: "Gout" },
      { drug: "Losartan 50 mg tablet", rxnorm: "979485", dose: "50 mg", route: "oral", frequency: "once daily", indication: "Hypertension" },
    ],
    vitals: { sbp: 146, dbp: 92, hr: 74, weightKg: 97, heightCm: 179 },
    labBias: { uric: 1.5, creatinine: 1.1 },
  },
];

const practitioners = [
  { id: "prac_chen", name: "Dana Chen", role: "physician" as const, credentials: "MD" },
  { id: "prac_ibarra", name: "Rafael Ibarra", role: "physician" as const, credentials: "DO" },
  { id: "prac_lund", name: "Kirsten Lund", role: "nurse" as const, credentials: "RN" },
  { id: "prac_mbeki", name: "Thandi Mbeki", role: "front_desk" as const, credentials: null },
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

async function main() {
  await prisma.$transaction([
    prisma.observation.deleteMany(),
    prisma.diagnosticReport.deleteMany(),
    prisma.note.deleteMany(),
    prisma.encounter.deleteMany(),
    prisma.medicationRequest.deleteMany(),
    prisma.allergyIntolerance.deleteMany(),
    prisma.condition.deleteMany(),
    prisma.patient.deleteMany(),
    prisma.practitioner.deleteMany(),
  ]);

  await prisma.practitioner.createMany({ data: practitioners });
  const pcps = ["prac_chen", "prac_ibarra"];

  for (const [i, p] of patients.entries()) {
    const dob = new Date(today.getFullYear() - p.age, Math.floor(rand() * 12), 1 + Math.floor(rand() * 27));
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

    await prisma.medicationRequest.createMany({
      data: p.meds.map((m) => {
        const status = m.status ?? "active";
        const startAgo = 60 + Math.round(rand() * 1500);
        return {
          patientId: patient.id,
          drug: m.drug,
          rxnorm: m.rxnorm,
          dose: m.dose,
          route: m.route,
          frequency: m.frequency,
          indication: m.indication,
          status,
          start: daysAgo(startAgo),
          end: status === "discontinued" ? daysAgo(Math.round(startAgo / 3)) : null,
          prescriberId: pcpId,
        };
      }),
    });

    // Past office visits roughly quarterly, each with vitals; labs at most of them.
    const visitDaysAgo = [540, 360, 270, 180, 90, 21];
    const bmiHeight = p.vitals.heightCm / 100;
    for (const [vIdx, ago] of visitDaysAgo.entries()) {
      const start = daysAgo(ago, 9 + (i % 7), (i * 10) % 60);
      const encounter = await prisma.encounter.create({
        data: {
          patientId: patient.id, type: "office", status: "finished",
          reason: vIdx === visitDaysAgo.length - 1 ? "Follow-up" : "Routine follow-up",
          start, end: new Date(start.getTime() + 25 * 60_000), providerId: pcpId,
        },
      });

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
          const report = await prisma.diagnosticReport.create({
            data: {
              patientId: patient.id, code: panel.code, display: panel.display,
              performer: "Lakeview Reference Laboratory",
              effectiveAt: collected, issuedAt: new Date(collected.getTime() + 18 * 3_600_000),
              status: "final", source: "ordered",
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
          status: "signed", authorId: pcpId, createdAt: start,
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
          status: "signed", authorId: "prac_lund", createdAt: daysAgo(14, 15, 20), signedAt: daysAgo(14, 15, 32),
        },
      });
    }

    if (p.reasonToday) {
      const start = daysAgo(0, p.visitHour ?? 9, (i * 15) % 60);
      await prisma.encounter.create({
        data: {
          patientId: patient.id,
          type: p.telehealth ? "telehealth" : "office",
          status: (p.visitHour ?? 9) <= 9 ? "arrived" : "planned",
          reason: p.reasonToday, start, end: new Date(start.getTime() + 20 * 60_000), providerId: pcpId,
        },
      });
    }
    await prisma.encounter.create({
      data: {
        patientId: patient.id, type: "office", status: "planned", reason: "Routine follow-up",
        start: daysAgo(-(60 + i * 3), 10, 0), providerId: pcpId,
      },
    });
  }

  const counts = await Promise.all([prisma.patient.count(), prisma.observation.count(), prisma.note.count()]);
  console.log(`Seeded ${counts[0]} patients, ${counts[1]} observations, ${counts[2]} notes.`);
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
