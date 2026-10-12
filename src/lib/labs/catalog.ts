// Reference catalog for imported lab results: LOINC code, the unit we store
// (UCUM), the names labs print, critical limits and the plausible range used to
// catch misreads. Every entry has a "home" panel so an imported result lands in
// the same Results section as the same test ordered here, and trends line up.

export type Panel = { code: string; display: string };

export const PANELS = {
  cbc: { code: "58410-2", display: "Complete blood count (CBC)" },
  cmp: { code: "24323-8", display: "Comprehensive metabolic panel (CMP)" },
  lipid: { code: "57698-3", display: "Lipid panel" },
  a1c: { code: "4548-4", display: "Hemoglobin A1c" },
  tsh: { code: "3016-3", display: "TSH" },
  thyroid: { code: "local:thyroid", display: "Thyroid hormones" },
  iron: { code: "local:iron", display: "Iron studies" },
  vitd: { code: "1989-3", display: "Vitamin D, 25-hydroxy" },
  b12: { code: "2132-9", display: "Vitamin B12" },
  crp: { code: "1988-5", display: "C-reactive protein" },
  esr: { code: "30341-2", display: "Erythrocyte sedimentation rate" },
} satisfies Record<string, Panel>;

export type Analyte = {
  loinc: string;
  display: string;
  unit: string; // UCUM, the unit we store and trend in
  panel: keyof typeof PANELS;
  aliases: string[];
  critLow?: number;
  critHigh?: number;
  plausible: [number, number]; // outside this (in `unit`) the value is almost certainly a misread
  molar?: { unit: string; factor: number }; // other-unit → `unit` multiplier for analyte-specific conversions
};

export const ANALYTES: Analyte[] = [
  // CBC
  { loinc: "6690-2", display: "WBC", unit: "10*3/uL", panel: "cbc", aliases: ["wbc", "white blood cells", "white blood cell count", "white cell count", "total wbc count", "total leucocyte count", "total leukocyte count", "tlc", "total count", "leukocytes"], critLow: 2, critHigh: 30, plausible: [0.1, 500] },
  { loinc: "789-8", display: "RBC", unit: "10*6/uL", panel: "cbc", aliases: ["rbc", "red blood cells", "red blood cell count", "red cell count", "total rbc count", "erythrocytes", "rbc count"], plausible: [0.5, 10] },
  { loinc: "718-7", display: "Hemoglobin", unit: "g/dL", panel: "cbc", aliases: ["hemoglobin", "haemoglobin", "hgb", "hb", "hb%"], critLow: 7, critHigh: 20, plausible: [2, 26] },
  { loinc: "4544-3", display: "Hematocrit", unit: "%", panel: "cbc", aliases: ["hematocrit", "haematocrit", "hct", "pcv", "packed cell volume"], plausible: [5, 80] },
  { loinc: "787-2", display: "MCV", unit: "fL", panel: "cbc", aliases: ["mcv", "mean corpuscular volume", "mean cell volume"], plausible: [40, 160] },
  { loinc: "785-6", display: "MCH", unit: "pg", panel: "cbc", aliases: ["mch", "mean corpuscular hemoglobin", "mean corpuscular haemoglobin", "mean cell hemoglobin"], plausible: [10, 60] },
  { loinc: "786-4", display: "MCHC", unit: "g/dL", panel: "cbc", aliases: ["mchc", "mean corpuscular hemoglobin concentration", "mean corpuscular haemoglobin concentration"], plausible: [20, 45] },
  { loinc: "788-0", display: "RDW", unit: "%", panel: "cbc", aliases: ["rdw", "rdw-cv", "rdw cv", "red cell distribution width"], plausible: [5, 40] },
  { loinc: "777-3", display: "Platelets", unit: "10*3/uL", panel: "cbc", aliases: ["platelets", "platelet count", "plt", "platelet", "thrombocytes"], critLow: 50, critHigh: 1000, plausible: [1, 3000] },
  { loinc: "32623-1", display: "MPV", unit: "fL", panel: "cbc", aliases: ["mpv", "mean platelet volume"], plausible: [3, 20] },
  { loinc: "770-8", display: "Neutrophils %", unit: "%", panel: "cbc", aliases: ["neutrophils", "neutrophil", "neutrophils %", "neutrophil %", "polymorphs", "segmented neutrophils", "neut %"], plausible: [0, 100] },
  { loinc: "736-9", display: "Lymphocytes %", unit: "%", panel: "cbc", aliases: ["lymphocytes", "lymphocyte", "lymphocytes %", "lymph %"], plausible: [0, 100] },
  { loinc: "5905-5", display: "Monocytes %", unit: "%", panel: "cbc", aliases: ["monocytes", "monocyte", "monocytes %", "mono %"], plausible: [0, 100] },
  { loinc: "713-8", display: "Eosinophils %", unit: "%", panel: "cbc", aliases: ["eosinophils", "eosinophil", "eosinophils %", "eos %"], plausible: [0, 100] },
  { loinc: "706-2", display: "Basophils %", unit: "%", panel: "cbc", aliases: ["basophils", "basophil", "basophils %", "baso %"], plausible: [0, 100] },
  { loinc: "751-8", display: "Neutrophils, absolute", unit: "10*3/uL", panel: "cbc", aliases: ["absolute neutrophil count", "anc", "neutrophils absolute", "neutrophils #", "neut #"], critLow: 0.5, plausible: [0, 300] },
  { loinc: "731-0", display: "Lymphocytes, absolute", unit: "10*3/uL", panel: "cbc", aliases: ["absolute lymphocyte count", "alc", "lymphocytes absolute", "lymphocytes #", "lymph #"], plausible: [0, 300] },
  { loinc: "30341-2", display: "ESR", unit: "mm/h", panel: "esr", aliases: ["esr", "erythrocyte sedimentation rate", "sed rate", "esr (westergren)", "esr westergren"], plausible: [0, 200] },

  // Metabolic
  { loinc: "2951-2", display: "Sodium", unit: "mmol/L", panel: "cmp", aliases: ["sodium", "na", "na+", "serum sodium", "s. sodium"], critLow: 120, critHigh: 160, plausible: [90, 200], molar: { unit: "meq/L", factor: 1 } },
  { loinc: "2823-3", display: "Potassium", unit: "mmol/L", panel: "cmp", aliases: ["potassium", "k", "k+", "serum potassium", "s. potassium"], critLow: 2.8, critHigh: 6.2, plausible: [1, 10], molar: { unit: "meq/L", factor: 1 } },
  { loinc: "2075-0", display: "Chloride", unit: "mmol/L", panel: "cmp", aliases: ["chloride", "cl", "cl-", "serum chloride", "s. chloride"], plausible: [60, 150], molar: { unit: "meq/L", factor: 1 } },
  { loinc: "2028-9", display: "CO2", unit: "mmol/L", panel: "cmp", aliases: ["co2", "carbon dioxide", "bicarbonate", "hco3", "total co2", "tco2", "serum bicarbonate"], plausible: [5, 60], molar: { unit: "meq/L", factor: 1 } },
  { loinc: "3094-0", display: "BUN", unit: "mg/dL", panel: "cmp", aliases: ["bun", "blood urea nitrogen", "urea nitrogen"], plausible: [1, 300], molar: { unit: "mmol/L", factor: 2.801 } },
  { loinc: "3091-6", display: "Urea", unit: "mg/dL", panel: "cmp", aliases: ["urea", "serum urea", "s. urea", "blood urea", "s.urea"], plausible: [2, 600], molar: { unit: "mmol/L", factor: 6.006 } },
  { loinc: "2160-0", display: "Creatinine", unit: "mg/dL", panel: "cmp", aliases: ["creatinine", "serum creatinine", "s. creatinine", "s.creatinine", "creat"], plausible: [0.1, 25], molar: { unit: "umol/L", factor: 1 / 88.42 } },
  { loinc: "33914-3", display: "eGFR", unit: "mL/min/1.73m2", panel: "cmp", aliases: ["egfr", "estimated gfr", "gfr", "egfr (ckd-epi)", "egfr ckd-epi", "estimated glomerular filtration rate"], plausible: [1, 200] },
  { loinc: "2345-7", display: "Glucose", unit: "mg/dL", panel: "cmp", aliases: ["glucose", "serum glucose", "plasma glucose", "random blood sugar", "rbs", "random glucose", "blood glucose", "blood sugar", "glucose random", "rbg"], critLow: 50, critHigh: 400, plausible: [10, 2000], molar: { unit: "mmol/L", factor: 18.016 } },
  { loinc: "1558-6", display: "Glucose, fasting", unit: "mg/dL", panel: "cmp", aliases: ["fasting glucose", "fasting blood sugar", "fbs", "fasting plasma glucose", "fpg", "glucose fasting", "fasting blood glucose", "fbg"], critLow: 50, critHigh: 400, plausible: [10, 2000], molar: { unit: "mmol/L", factor: 18.016 } },
  { loinc: "17861-6", display: "Calcium", unit: "mg/dL", panel: "cmp", aliases: ["calcium", "ca", "serum calcium", "total calcium", "s. calcium"], critLow: 6, critHigh: 13, plausible: [2, 20], molar: { unit: "mmol/L", factor: 4.008 } },
  { loinc: "1742-6", display: "ALT", unit: "U/L", panel: "cmp", aliases: ["alt", "sgpt", "alt (sgpt)", "sgpt (alt)", "alanine aminotransferase", "alanine transaminase", "s. alt"], plausible: [1, 10000] },
  { loinc: "1920-8", display: "AST", unit: "U/L", panel: "cmp", aliases: ["ast", "sgot", "ast (sgot)", "sgot (ast)", "aspartate aminotransferase", "aspartate transaminase", "s. ast"], plausible: [1, 10000] },
  { loinc: "6768-6", display: "Alkaline phosphatase", unit: "U/L", panel: "cmp", aliases: ["alkaline phosphatase", "alp", "alk phos", "alk. phosphatase", "s. alkaline phosphatase"], plausible: [5, 5000] },
  { loinc: "1975-2", display: "Bilirubin, total", unit: "mg/dL", panel: "cmp", aliases: ["total bilirubin", "bilirubin total", "bilirubin", "t. bilirubin", "s. bilirubin", "serum bilirubin", "tbil"], plausible: [0, 50], molar: { unit: "umol/L", factor: 1 / 17.1 } },
  { loinc: "1968-7", display: "Bilirubin, direct", unit: "mg/dL", panel: "cmp", aliases: ["direct bilirubin", "bilirubin direct", "conjugated bilirubin", "d. bilirubin", "dbil"], plausible: [0, 40], molar: { unit: "umol/L", factor: 1 / 17.1 } },
  { loinc: "1751-7", display: "Albumin", unit: "g/dL", panel: "cmp", aliases: ["albumin", "serum albumin", "s. albumin", "alb"], plausible: [0.5, 7], molar: { unit: "g/L", factor: 0.1 } },
  { loinc: "2885-2", display: "Protein, total", unit: "g/dL", panel: "cmp", aliases: ["total protein", "protein total", "serum protein", "s. total protein"], plausible: [1, 15], molar: { unit: "g/L", factor: 0.1 } },
  { loinc: "2324-2", display: "GGT", unit: "U/L", panel: "cmp", aliases: ["ggt", "gamma gt", "gamma-glutamyl transferase", "gamma glutamyl transferase", "ggtp"], plausible: [1, 5000] },
  { loinc: "3084-1", display: "Uric acid", unit: "mg/dL", panel: "cmp", aliases: ["uric acid", "serum uric acid", "s. uric acid", "urate"], plausible: [0.5, 25], molar: { unit: "umol/L", factor: 1 / 59.48 } },
  { loinc: "19123-9", display: "Magnesium", unit: "mg/dL", panel: "cmp", aliases: ["magnesium", "mg", "serum magnesium"], plausible: [0.3, 10], molar: { unit: "mmol/L", factor: 2.431 } },
  { loinc: "2777-1", display: "Phosphorus", unit: "mg/dL", panel: "cmp", aliases: ["phosphorus", "phosphate", "inorganic phosphorus", "serum phosphorus"], plausible: [0.3, 20], molar: { unit: "mmol/L", factor: 3.097 } },

  // Lipids
  { loinc: "2093-3", display: "Total cholesterol", unit: "mg/dL", panel: "lipid", aliases: ["total cholesterol", "cholesterol", "cholesterol total", "serum cholesterol", "s. cholesterol", "t. cholesterol"], plausible: [30, 1500], molar: { unit: "mmol/L", factor: 38.67 } },
  { loinc: "13457-7", display: "LDL cholesterol", unit: "mg/dL", panel: "lipid", aliases: ["ldl", "ldl cholesterol", "ldl-c", "ldl-cholesterol", "ldl cholesterol (calculated)", "ldl calculated", "low density lipoprotein"], plausible: [1, 1000], molar: { unit: "mmol/L", factor: 38.67 } },
  { loinc: "2085-9", display: "HDL cholesterol", unit: "mg/dL", panel: "lipid", aliases: ["hdl", "hdl cholesterol", "hdl-c", "hdl-cholesterol", "high density lipoprotein"], plausible: [3, 250], molar: { unit: "mmol/L", factor: 38.67 } },
  { loinc: "2571-8", display: "Triglycerides", unit: "mg/dL", panel: "lipid", aliases: ["triglycerides", "triglyceride", "tg", "serum triglycerides", "s. triglyceride"], plausible: [10, 10000], molar: { unit: "mmol/L", factor: 88.57 } },
  { loinc: "13458-5", display: "VLDL cholesterol", unit: "mg/dL", panel: "lipid", aliases: ["vldl", "vldl cholesterol", "vldl-c"], plausible: [1, 500], molar: { unit: "mmol/L", factor: 38.67 } },

  // Single tests
  { loinc: "4548-4", display: "Hemoglobin A1c", unit: "%", panel: "a1c", aliases: ["hba1c", "hemoglobin a1c", "haemoglobin a1c", "a1c", "glycated hemoglobin", "glycated haemoglobin", "glycosylated hemoglobin", "glycosylated haemoglobin"], plausible: [3, 20] },
  { loinc: "3016-3", display: "TSH", unit: "m[IU]/L", panel: "tsh", aliases: ["tsh", "thyroid stimulating hormone", "thyrotropin", "s. tsh", "tsh (ultrasensitive)", "ultrasensitive tsh"], plausible: [0.001, 500] },
  { loinc: "3024-7", display: "Free T4", unit: "ng/dL", panel: "thyroid", aliases: ["free t4", "ft4", "free thyroxine", "t4 free"], plausible: [0.05, 10], molar: { unit: "pmol/L", factor: 1 / 12.87 } },
  { loinc: "3051-0", display: "Free T3", unit: "pg/mL", panel: "thyroid", aliases: ["free t3", "ft3", "free triiodothyronine", "t3 free"], plausible: [0.2, 30], molar: { unit: "pmol/L", factor: 0.651 } },
  { loinc: "3053-6", display: "T3, total", unit: "ng/dL", panel: "thyroid", aliases: ["t3", "total t3", "triiodothyronine", "t3 total"], plausible: [10, 1000] },
  { loinc: "3026-2", display: "T4, total", unit: "ug/dL", panel: "thyroid", aliases: ["t4", "total t4", "thyroxine", "t4 total"], plausible: [0.5, 40] },
  { loinc: "1989-3", display: "Vitamin D, 25-OH", unit: "ng/mL", panel: "vitd", aliases: ["vitamin d", "25-oh vitamin d", "25 oh vitamin d", "25-hydroxy vitamin d", "vitamin d 25-hydroxy", "vit d", "vitamin d3", "25(oh)d", "vitamin d total"], plausible: [1, 300], molar: { unit: "nmol/L", factor: 1 / 2.496 } },
  { loinc: "2132-9", display: "Vitamin B12", unit: "pg/mL", panel: "b12", aliases: ["vitamin b12", "b12", "cobalamin", "vit b12", "cyanocobalamin"], plausible: [20, 5000], molar: { unit: "pmol/L", factor: 1.355 } },
  { loinc: "1988-5", display: "CRP", unit: "mg/L", panel: "crp", aliases: ["crp", "c-reactive protein", "c reactive protein", "crp (quantitative)", "hs-crp", "hscrp"], plausible: [0, 600], molar: { unit: "mg/dL", factor: 10 } },
  { loinc: "2276-4", display: "Ferritin", unit: "ng/mL", panel: "iron", aliases: ["ferritin", "serum ferritin", "s. ferritin"], plausible: [1, 50000] },
  { loinc: "2498-4", display: "Iron", unit: "ug/dL", panel: "iron", aliases: ["iron", "serum iron", "s. iron", "fe"], plausible: [5, 1000], molar: { unit: "umol/L", factor: 5.585 } },
  { loinc: "2500-7", display: "TIBC", unit: "ug/dL", panel: "iron", aliases: ["tibc", "total iron binding capacity"], plausible: [50, 1000], molar: { unit: "umol/L", factor: 5.585 } },
  { loinc: "2502-3", display: "Transferrin saturation", unit: "%", panel: "iron", aliases: ["transferrin saturation", "tsat", "iron saturation", "% saturation"], plausible: [0, 100] },
];

export const analyteByLoinc = new Map(ANALYTES.map((a) => [a.loinc, a]));

// Lowercase, unify spelling noise, drop punctuation that labs sprinkle around names.
export function normKey(s: string) {
  return s
    .toLowerCase()
    .replace(/[µμ]/g, "u")
    .replace(/[‐-―]/g, "-")
    .replace(/\s*[:*]+\s*$/g, "")
    .replace(/[,;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const aliasIndex = new Map<string, Analyte>();
for (const a of ANALYTES) {
  for (const name of [a.display, ...a.aliases]) aliasIndex.set(normKey(name), a);
}

export function findAnalyte(printedName: string): Analyte | undefined {
  const key = normKey(printedName);
  if (aliasIndex.has(key)) return aliasIndex.get(key);
  // Drop a trailing method or specimen in parentheses: "Creatinine (Jaffe)", "Glucose (Serum)".
  const bare = key.replace(/\s*\([^)]*\)\s*$/, "").replace(/^(serum|plasma|blood|s\.)\s+/, "").trim();
  if (aliasIndex.has(bare)) return aliasIndex.get(bare);
  return undefined;
}
