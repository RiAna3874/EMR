// Reads an outside clinical document (photos or a PDF) with Claude and returns a
// strict JSON transcription: the printed sections word for word, plus the
// diagnoses, medications and follow-up recommendations the document itself
// states. Nothing is inferred; the clinician checks it against the pages and
// decides what reaches the problem and medication lists.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { EXTRACTION_MODEL, type ExtractInput } from "@/lib/labs/extract";
import { DIAGNOSIS_KINDS, MED_CHANGES, type ExtractedDocument } from "./draft";

const file = z.number().int().describe("Which file (1-based, in the order given) this is on; where it starts if it spans pages");
const box = z
  .object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
  .nullable()
  .describe("Pixel bounding box of the printed text on that image; null for PDFs or if unsure");

export const DocExtractionSchema = z.object({
  document_type: z
    .enum(["imaging_report", "discharge_summary", "referral_letter", "consult_note", "procedure_note", "pathology_report", "lab_report", "other"])
    .describe(
      "imaging_report: radiology, ultrasound, echo, DEXA, nuclear. referral_letter: another clinician asking us to see or take over the patient. consult_note: a specialist's letter or note back about a patient they saw. lab_report: mainly a table of lab results.",
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
  modality: z.string().nullable().describe("Imaging only: CT, MRI, X-ray, ultrasound, echocardiogram, DEXA..."),
  body_part: z.string().nullable().describe("Imaging only: body region examined, as printed"),
  impression: z
    .string()
    .nullable()
    .describe("The impression, conclusion or assessment paragraph exactly as printed (for letters, the assessment/recommendation paragraph); null if there is none"),
  notes: z.array(z.string()).describe("Anything a reviewer should know: pages cut off, glare, handwriting, ambiguous dates, a page that seems to belong to someone else"),
  sections: z
    .array(z.object({ heading: z.string().describe("Heading as printed, or '' for untitled text such as a letter body"), text: z.string().describe("The section's text exactly as printed; keep list items on their own lines"), file, box }))
    .describe("Every section of the document in order, including the impression again. Skip letterheads, addresses, page footers and signature blocks"),
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

const SYSTEM = `You transcribe outside clinical documents (imaging reports, hospital discharge summaries, referral and consultation letters) into structured data for a clinician to review before it is filed in a patient's chart.

Rules:
- Transcribe exactly what is printed. Never summarize, infer, correct or add clinical content. Lists you return (diagnoses, medications, follow-ups) must each be stated in the document.
- Keep every section's text word for word, including numbers and units. Join lines that were only wrapped by the page width; keep real line breaks for list items.
- If text is unreadable, transcribe what you can, mark the gap with [illegible], and say what is unclear in notes. Never guess digits, doses or dates.
- Dates: convert to YYYY-MM-DD. Work out day/month order from the document's other dates and locale; if it stays ambiguous, pick the likelier reading and say so in notes.
- Bounding boxes are in pixels of the image as given (sizes are listed below).`;

// For working on the review screen without API access, point
// MERIDIAN_DOCUMENT_FIXTURES at a folder of `<upload name>.extraction.json` files
// shaped like DocExtractionSchema (see samples/). Never set in production.
async function fixtureFor(fileName: string | undefined) {
  const dir = process.env.MERIDIAN_DOCUMENT_FIXTURES;
  if (!dir || process.env.NODE_ENV === "production" || !fileName) return null;
  const base = path.basename(fileName).replace(/\.[^.]+$/, "").replace(/-p\d+$/, "");
  try {
    return DocExtractionSchema.parse(JSON.parse(await readFile(path.join(dir, `${base}.extraction.json`), "utf8")));
  } catch {
    return null;
  }
}

export async function extractDocument(files: ExtractInput, fileNames: string[]): Promise<{ document: ExtractedDocument; model: string }> {
  const fixture = await fixtureFor(fileNames[0]);
  if (fixture) return { document: fixture, model: "fixture" };

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  const legend: string[] = [];
  files.forEach((f, i) => {
    const data = f.data.toString("base64");
    if (f.mimeType === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data } });
      legend.push(`File ${i + 1}: PDF`);
    } else {
      content.push({
        type: "image",
        source: { type: "base64", media_type: f.mimeType as "image/jpeg" | "image/png" | "image/webp" | "image/gif", data },
      });
      legend.push(`File ${i + 1}: image, ${f.width ?? "?"}×${f.height ?? "?"} px`);
    }
  });
  content.push({ type: "text", text: `${legend.join("\n")}\n\nTranscribe this clinical document.` });

  const client = new Anthropic({ timeout: 5 * 60_000 });
  const response = await client.beta.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(DocExtractionSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to read this document.");
  if (response.stop_reason === "max_tokens") throw new Error("The document was too long to read in one pass. Try uploading fewer pages at a time.");
  if (!response.parsed_output) throw new Error("Claude's answer didn't match the expected format. Try again.");
  return { document: response.parsed_output, model: response.model };
}
