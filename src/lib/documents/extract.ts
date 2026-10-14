// Reads an outside clinical document (photos or a PDF) with Claude and returns a
// strict JSON transcription: the printed sections word for word, plus the
// diagnoses, medications and follow-up recommendations the document itself
// states. Nothing is inferred; the clinician checks it against the pages and
// decides what reaches the problem and medication lists.
import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { readWithClaude, type ExtractInput } from "@/lib/labs/extract";
import type { ExtractedDocument } from "./draft";
import { DocExtractionSchema } from "./schema";

const SYSTEM = `You transcribe outside clinical documents (imaging reports such as X-ray, CT, MRI, ultrasound and echocardiography; histopathology; hospital discharge summaries; prescriptions; referral and consultation letters) into structured data for a clinician to review before it is filed in a patient's chart.

Rules:
- Transcribe exactly what is printed or handwritten. Never summarize, shorten, infer, correct or add clinical content. Lists you return (diagnoses, measurements, medications, follow-ups) must each be stated in the document.
- Long, wordy reports are expected: keep every sentence of every section, word for word, including numbers and units, however long the findings are. Join lines that were only wrapped by the page width; keep paragraph breaks and real line breaks for list items.
- A report with no headings is one section with heading ''. A report whose findings are a list of organs or structures (e.g. "Liver: ...", "Mitral valve: ...") keeps them as lines in the findings section.
- Text in Bangla or another language: transcribe it in that script as written; do not translate.
- If text is unreadable, transcribe what you can, mark the gap with [illegible], and say what is unclear in notes. Never guess digits, doses or dates.
- Dates: convert to YYYY-MM-DD. Work out day/month order from the document's other dates and locale (Bangladesh and most of Asia write day first); if it stays ambiguous, pick the likelier reading and say so in notes.
- Bounding boxes are in pixels of the image as given (sizes are listed below).`;

// For working on the review screen without API access, point
// MERIDIAN_DOCUMENT_FIXTURES at a folder of `<upload name>.extraction.json` files
// shaped like DocExtractionSchema (see samples/). Never set in production.
async function fixtureFor(fileName: string | undefined) {
  const dir = process.env.MERIDIAN_DOCUMENT_FIXTURES;
  if (!dir || process.env.NODE_ENV === "production" || !fileName) return null;
  const base = path.basename(fileName).replace(/\.[^.]+$/, "").replace(/-p\d+$/, "");
  try {
    const saved = JSON.parse(await readFile(path.join(dir, `${base}.extraction.json`), "utf8"));
    return DocExtractionSchema.parse({ measurements: [], ...saved });
  } catch {
    return null;
  }
}

export const hasDocumentFixture = async (fileName: string | undefined) => !!(await fixtureFor(fileName));

export async function extractDocument(files: ExtractInput, fileNames: string[]): Promise<{ document: ExtractedDocument; model: string }> {
  const fixture = await fixtureFor(fileNames[0]);
  if (fixture) return { document: fixture, model: "fixture" };

  // Too large a schema for structured outputs to compile, so it is read as checked JSON.
  const { parsed, model } = await readWithClaude(DocExtractionSchema, SYSTEM, files, "Transcribe this clinical document.", "document", { mode: "json" });
  return { document: parsed, model };
}
