// One-line, plain-language descriptions of common tests for patient letters.
// They say what a test measures, never what a result means for this patient;
// that stays with the clinician.
import type { Flag } from "@prisma/client";

const about: Record<string, string> = {
  "6690-2": "White blood cells, which fight infection.",
  "789-8": "Red blood cells, which carry oxygen.",
  "718-7": "Hemoglobin, the protein in red blood cells that carries oxygen.",
  "4544-3": "The share of your blood made up of red blood cells.",
  "787-2": "The average size of your red blood cells.",
  "785-6": "The average amount of hemoglobin in each red blood cell.",
  "786-4": "How concentrated hemoglobin is inside red blood cells.",
  "788-0": "How much your red blood cells vary in size.",
  "777-3": "Platelets, which help your blood clot.",
  "32623-1": "The average size of your platelets.",
  "770-8": "Neutrophils, the most common infection-fighting white cell.",
  "736-9": "Lymphocytes, white cells that fight viruses and make antibodies.",
  "5905-5": "Monocytes, white cells that clear germs and debris.",
  "713-8": "Eosinophils, white cells involved in allergies and parasites.",
  "706-2": "Basophils, white cells involved in allergic reactions.",
  "751-8": "The number of neutrophils, an infection-fighting white cell.",
  "731-0": "The number of lymphocytes, a virus-fighting white cell.",
  "30341-2": "A general marker of inflammation (sed rate).",
  "2951-2": "Sodium, a salt that balances fluids in your body.",
  "2823-3": "Potassium, a mineral your heart and muscles need.",
  "2075-0": "Chloride, a salt that balances fluids and acids.",
  "2028-9": "Bicarbonate, which keeps your blood's acid level steady.",
  "3094-0": "Urea nitrogen, a waste product your kidneys clear.",
  "3091-6": "Urea, a waste product your kidneys clear.",
  "2160-0": "Creatinine, a waste product used to check kidney function.",
  "33914-3": "An estimate of how well your kidneys filter blood (eGFR).",
  "2345-7": "Blood sugar (glucose).",
  "1558-6": "Blood sugar (glucose) after fasting.",
  "17861-6": "Calcium, needed for bones, muscles and nerves.",
  "1742-6": "ALT, a liver enzyme.",
  "1920-8": "AST, an enzyme found in the liver and muscles.",
  "6768-6": "Alkaline phosphatase, an enzyme from the liver and bones.",
  "1975-2": "Bilirubin, a pigment the liver clears from old red cells.",
  "1968-7": "Direct bilirubin, the part already processed by the liver.",
  "1751-7": "Albumin, the main protein made by your liver.",
  "2885-2": "Total protein in your blood.",
  "2324-2": "GGT, a liver enzyme.",
  "3084-1": "Uric acid, which can cause gout when high.",
  "19123-9": "Magnesium, a mineral for muscles and nerves.",
  "2777-1": "Phosphorus, a mineral for bones and energy.",
  "2093-3": "Total cholesterol in your blood.",
  "13457-7": "LDL, the \"bad\" cholesterol that can build up in arteries.",
  "2085-9": "HDL, the \"good\" cholesterol that helps clear other cholesterol.",
  "2571-8": "Triglycerides, a type of fat in your blood.",
  "13458-5": "VLDL, a type of cholesterol carrier.",
  "4548-4": "Your average blood sugar over the past 2 to 3 months (A1c).",
  "3016-3": "TSH, the hormone that tells your thyroid how hard to work.",
  "3024-7": "Free T4, the main thyroid hormone.",
  "3051-0": "Free T3, an active thyroid hormone.",
  "3053-6": "Total T3, a thyroid hormone.",
  "3026-2": "Total T4, a thyroid hormone.",
  "1989-3": "Vitamin D, needed for strong bones.",
  "2132-9": "Vitamin B12, needed for nerves and red blood cells.",
  "1988-5": "C-reactive protein, a marker of inflammation.",
  "2276-4": "Ferritin, your body's iron stores.",
  "2498-4": "Iron in your blood.",
  "2500-7": "How much iron your blood is able to carry (TIBC).",
  "2502-3": "How much of your blood's iron-carrying capacity is in use.",
};

export const aboutTest = (loinc: string) => about[loinc] ?? null;

export function resultInWords(flag: Flag | null) {
  switch (flag) {
    case "N":
      return { text: "In the normal range", tone: "normal" as const };
    case "H":
      return { text: "Above the normal range", tone: "out" as const };
    case "L":
      return { text: "Below the normal range", tone: "out" as const };
    case "HH":
      return { text: "Well above the normal range", tone: "far" as const };
    case "LL":
      return { text: "Well below the normal range", tone: "far" as const };
    case "A":
      return { text: "Outside the expected result", tone: "out" as const };
    default:
      return { text: "No normal range given", tone: "normal" as const };
  }
}
