// What Claude returns for an outside clinical document (src/lib/documents/extract.ts).
// No server-only imports, so tests can check saved transcriptions against it.
import { z } from "zod";
import { DIAGNOSIS_KINDS, MED_CHANGES } from "./draft";

const file = z.number().int().describe("Which file (1-based, in the order given) this is on; where it starts if it spans pages");
const box = z
  .object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
  .nullable()
  .describe("Pixel bounding box of the printed text on that image; null for PDFs or if unsure");

export const DocExtractionSchema = z.object({
  document_type: z
    .enum(["imaging_report", "discharge_summary", "referral_letter", "consult_note", "procedure_note", "pathology_report", "lab_report", "other"])
    .describe(
      "imaging_report: radiology, X-ray, CT, MRI, ultrasound, Doppler, echocardiogram, ECG/Holter/ETT report, DEXA, nuclear. pathology_report: histopathology, cytology, biopsy. referral_letter: another clinician asking us to see or take over the patient. consult_note: a specialist's letter or note back about a patient they saw. lab_report: mainly a table of lab results.",
    ),
  title: z.string().nullable().describe("Title or exam name as printed, e.g. 'CT CHEST WITHOUT CONTRAST', 'Discharge Summary'"),
  organization: z.string().nullable().describe("Hospital, imaging center or practice that produced the document"),
  author: z.string().nullable().describe("Signing or dictating clinician with credentials, as printed"),
  service_date: z.string().nullable().describe("The document's main date as YYYY-MM-DD: exam date for imaging, discharge date for a discharge summary, visit or letter date for a letter"),
  admission_date: z.string().nullable().describe("Admission date as YYYY-MM-DD, discharge summaries only"),
  discharge_date: z.string().nullable().describe("Discharge date as YYYY-MM-DD, discharge summaries only"),
  patient_name: z.string().nullable().describe("Patient name as printed"),
  patient_dob: z.string().nullable().describe("Patient date of birth as YYYY-MM-DD, or null if not printed"),
  patient_age: z.string().nullable().describe("Age as printed, or null"),
  patient_sex: z.string().nullable().describe("Sex as printed, or null"),
  patient_id: z.string().nullable().describe("Any MRN or account number printed, or null"),
  modality: z.string().nullable().describe("Imaging only: CT, MRI, X-ray, ultrasound, echocardiogram, ECG, DEXA..."),
  body_part: z.string().nullable().describe("Imaging only: body region examined, as printed"),
  impression: z
    .string()
    .nullable()
    .describe("The impression, conclusion or assessment paragraph exactly as printed (for letters, the assessment/recommendation paragraph); null if there is none"),
  notes: z.array(z.string()).describe("Anything a reviewer should know: pages cut off, glare, handwriting, ambiguous dates, a page that seems to belong to someone else"),
  sections: z
    .array(z.object({ heading: z.string().describe("Heading as printed, or '' for untitled text such as a letter body"), text: z.string().describe("The section's text exactly as printed; keep list items on their own lines"), file, box }))
    .describe("Every section of the document in order, including the impression again, with all of its sentences. Skip letterheads, addresses, page footers and signature blocks"),
  measurements: z
    .array(
      z.object({
        name: z.string().describe("Measurement as printed, e.g. 'LVEF', 'LVIDd', 'IVSd', 'Aortic root', 'E/A', 'Liver span', 'T-score L1-L4'"),
        value: z.string().describe("Value exactly as printed, e.g. '62', '4.8', '<20', '1.2/0.8'"),
        unit: z.string().nullable().describe("Unit as printed, or null"),
        normal_range: z.string().nullable().describe("Normal or reference range as printed, or null"),
        group: z.string().nullable().describe("The table or section heading it is under, e.g. 'M-mode', 'Doppler', or null"),
        file,
        box,
      }),
    )
    .describe("Numbered measurements printed in the report (echo, Doppler, ultrasound sizes, DEXA scores). Leave empty if there are none. Keep them in the sections text too"),
  diagnoses: z
    .array(
      z.object({
        text: z.string().describe("Diagnosis, finding or reason for referral exactly as printed"),
        kind: z.enum(Object.keys(DIAGNOSIS_KINDS) as [keyof typeof DIAGNOSIS_KINDS]).describe("principal/secondary for discharge diagnoses, reason for a referral's reason, finding for an imaging finding, history for past history"),
        icd10: z.string().nullable().describe("ICD-10-CM code if printed, or if you are confident of it; else null"),
        file,
        box,
      }),
    )
    .describe("Diagnoses and significant findings the document itself states. Do not add any of your own"),
  medications: z
    .array(
      z.object({
        text: z.string().describe("The medication line exactly as printed"),
        drug: z.string().describe("Drug name with strength, e.g. 'Spironolactone 25 mg tablet'"),
        dose: z.string().nullable(),
        route: z.string().nullable(),
        frequency: z.string().nullable(),
        change: z
          .enum(Object.keys(MED_CHANGES) as [keyof typeof MED_CHANGES])
          .describe("What the document says happened: new, changed (dose or frequency), continued, stopped; unknown if it is just listed"),
        file,
        box,
      }),
    )
    .describe("Medications listed (discharge medications, current medications, recommendations to start or stop)"),
  follow_ups: z
    .array(z.object({ text: z.string().describe("Recommendation or follow-up exactly as printed"), due: z.string().nullable().describe("YYYY-MM-DD if a date is printed, else the interval as printed, e.g. '1 week'"), file, box }))
    .describe("Follow-up appointments, tests and recommendations addressed to the patient or their doctors"),
});
