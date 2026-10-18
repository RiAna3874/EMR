// Words the speech engine is told to expect, so drug names, tests and abbreviations come
// out spelled right. Pure: the route adds the patient's own medicines and problems.

// Medicines, brands and terms a Bangladeshi outpatient clinic says every day.
export const CLINIC_TERMS = [
  // Common Bangladeshi brands
  "Napa", "Napa Extra", "Ace", "Seclo", "Sergel", "Maxpro", "Losectil", "Pantonix", "Finix", "Fexo", "Alatrol", "Monas",
  "Montair", "Tofen", "Azithrocin", "Zimax", "Cef-3", "Ceftron", "Flagyl", "Amodis", "Ciprocin", "Emistat", "Motigut",
  "Ecosprin", "Lipicon", "Rosuva", "Bizoran", "Osartil", "Camlosart", "Comet", "Secrin", "Linatab", "Empa", "Thyrox",
  "Calbo-D", "Neuro-B", "Rivotril", "Disopan", "Orsaline-N", "Entacyd", "Flatameal",
  // Generics
  "paracetamol", "omeprazole", "esomeprazole", "pantoprazole", "rabeprazole", "metformin", "gliclazide", "glimepiride",
  "sitagliptin", "linagliptin", "vildagliptin", "empagliflozin", "dapagliflozin", "insulin glargine", "tirzepatide",
  "semaglutide", "amlodipine", "losartan", "olmesartan", "telmisartan", "bisoprolol", "metoprolol", "atenolol",
  "hydrochlorothiazide", "furosemide", "spironolactone", "atorvastatin", "rosuvastatin", "clopidogrel", "aspirin",
  "levothyroxine", "salbutamol", "montelukast", "fexofenadine", "desloratadine", "cetirizine", "ketotifen", "budesonide",
  "azithromycin", "cefixime", "ceftriaxone", "cefuroxime", "amoxicillin", "co-amoxiclav", "ciprofloxacin", "levofloxacin",
  "doxycycline", "metronidazole", "nitazoxanide", "albendazole", "ivermectin", "domperidone", "ondansetron",
  "itopride", "lactulose", "ORS", "zinc", "prednisolone", "dexamethasone", "diclofenac", "naproxen", "tolfenamic acid",
  "pregabalin", "gabapentin", "amitriptyline", "clonazepam", "sertraline", "escitalopram", "calcium carbonate",
  "vitamin D3", "ferrous sulfate", "folic acid",
  // Sigs and units
  "1+0+1", "1+1+1", "0+0+1", "mg", "mcg", "mL", "IU", "BD", "TDS", "QDS", "OD", "HS", "PRN", "SOS", "before meal", "after meal",
  // Tests and findings
  "CBC", "ESR", "CRP", "HbA1c", "FBS", "RBS", "2HABF", "serum creatinine", "eGFR", "SGPT", "SGOT", "lipid profile",
  "TSH", "FT4", "urine R/E", "stool R/E", "NS1 antigen", "dengue IgM", "Widal test", "troponin I", "ECG", "echo",
  "ultrasonography", "USG of whole abdomen", "chest X-ray P/A view", "HBsAg", "anti-HCV",
  // Diagnoses and abbreviations
  "dengue fever", "enteric fever", "typhoid", "UTI", "URTI", "AGE", "acute gastroenteritis", "GERD", "IBS", "T2DM", "HTN",
  "IHD", "CKD", "COPD", "bronchial asthma", "hypothyroidism", "dyslipidemia", "PUD", "AKI", "CVD",
  // Exam words
  "anaemia", "jaundice", "cyanosis", "clubbing", "oedema", "lymphadenopathy", "dehydration", "vesicular breath sound",
  "crepitations", "rhonchi", "S1 S2 audible", "soft, non-tender", "BP", "pulse", "SpO2", "temperature",
];

// The engines limit key terms: under 50 characters, at most 5 words, no brackets or slashes
// (ElevenLabs). Over 100 terms costs more per request, so the list is capped.
export const MAX_TERMS = 100;

export function cleanTerm(t: string): string | null {
  const s = t.replace(/[<>{}[\]\\]/g, " ").replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length >= 50 || s.split(" ").length > 5) return null;
  return s;
}

// Patient-specific words first (they matter most), then the clinic list, no duplicates.
export function keyTerms(patientTerms: string[], limit = MAX_TERMS): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...patientTerms, ...CLINIC_TERMS]) {
    const t = cleanTerm(raw);
    if (!t || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= limit) break;
  }
  return out;
}

// A drug as stored ("Napa 500 mg tablet", "Metformin 500 MG Oral Tablet") to the name said aloud.
export function spokenDrug(drug: string): string {
  return drug
    .replace(/\s+\d[\d.,/]*\s*(mg|mcg|g|ml|iu|unit|units|%)\b.*$/i, "")
    .replace(/\s+(tablet|tab|capsule|cap|syrup|suspension|injection|inj|cream|ointment|drops?|inhaler)\b.*$/i, "")
    .trim();
}
