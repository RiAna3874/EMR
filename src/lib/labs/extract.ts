// Reads a lab report (photos or a PDF) with Claude and returns a strict JSON
// transcription. Claude only transcribes what is printed; flags, units and codes
// are normalized and checked afterwards in draft.ts, and a clinician verifies
// everything before it is filed.
import "server-only";
import { readFile } from "node:fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { ExtractedReport } from "./draft";

export const EXTRACTION_MODEL = "claude-opus-5-5";

const Result = z.object({
  name: z.string().describe("Test name exactly as printed"),
  value: z.string().describe("Result exactly as printed, including any < or > sign, e.g. '13.2', '<0.5', 'Negative', '7,500'"),
  unit: z.string().nullable().describe("Unit exactly as printed, or null if none"),
  reference_range: z.string().nullable().describe("Reference / normal range exactly as printed, including sex- or age-specific lines, or null"),
  flag: z.string().nullable().describe("Abnormal flag exactly as printed next to the value (H, L, HIGH, *, ↑ ...), or null if none is printed"),
  loinc: z.string().nullable().describe("LOINC code for this test if you are confident, else null"),
  file: z.number().int().describe("Which file (1-based, in the order given) this row is on"),
  box: z
    .object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() })
    .nullable()
    .describe("Pixel bounding box of the whole result line (name through range) on that image; null for PDFs or if unsure"),
  confidence: z.enum(["high", "medium", "low"]).describe("low if any part of the row is blurred, cut off, handwritten or ambiguous"),
  note: z.string().nullable().describe("Short note about anything a reviewer should check on this row, else null"),
});

export const ExtractionSchema = z.object({
  lab_name: z.string().nullable(),
  report_title: z.string().nullable(),
  patient_name: z.string().nullable().describe("Patient name as printed"),
  patient_dob: z.string().nullable().describe("Patient date of birth as YYYY-MM-DD, or null if not printed"),
  patient_age: z.string().nullable().describe("Age as printed, e.g. '45 Y', or null"),
  patient_sex: z.string().nullable().describe("Sex as printed, or null"),
  patient_id: z.string().nullable().describe("Any patient or specimen ID printed, or null"),
  collected_date: z.string().nullable().describe("Specimen collection date as YYYY-MM-DD, or null"),
  collected_time: z.string().nullable().describe("Collection time as 24-hour HH:MM, or null"),
  reported_date: z.string().nullable().describe("Report / result date as YYYY-MM-DD, or null"),
  reported_time: z.string().nullable().describe("Report time as 24-hour HH:MM, or null"),
  notes: z.array(z.string()).describe("Anything a reviewer should know about the whole document: pages cut off, glare, ambiguous dates, interpretive comments"),
  sections: z
    .array(z.object({ name: z.string().describe("Section or panel heading as printed, e.g. 'Complete Blood Count'"), results: z.array(Result) }))
    .describe("Every result row on the report, grouped by the headings the lab printed"),
});

const SYSTEM = `You transcribe clinical laboratory reports into structured data for a clinician to review.

Rules:
- Transcribe exactly what is printed. Never infer, calculate or correct a value, unit, range or flag.
- Include every test result row, including qualitative results (Negative, Trace, Reactive) and differential counts. Skip method names, specimen labels, signatures, addresses and interpretive paragraphs (summarize any clinically relevant comment in notes).
- If a value, unit or range is unreadable, transcribe what you can, set confidence to low and say what is unclear in the row note. Never guess digits.
- Dates: convert to YYYY-MM-DD. Work out day/month order from the lab's other dates and locale; if it stays ambiguous, pick the likelier reading and say so in notes.
- Bounding boxes are in pixels of the image as given (sizes are listed below), covering the whole printed line for that result.`;

export type ExtractInput = { mimeType: string; data: Buffer; width: number | null; height: number | null }[];

export type ExtractOutput = { report: ExtractedReport; model: string };

export async function extractLabReport(files: ExtractInput): Promise<ExtractOutput> {
  // For working on the review screen without API access: point this at a JSON file
  // shaped like ExtractionSchema. Never set in production.
  const fixture = process.env.MERIDIAN_EXTRACTION_FIXTURE;
  if (fixture && process.env.NODE_ENV !== "production") {
    const report = ExtractionSchema.parse(JSON.parse(await readFile(fixture, "utf8")));
    return { report, model: "fixture" };
  }

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
  content.push({ type: "text", text: `${legend.join("\n")}\n\nTranscribe this lab report.` });

  const client = new Anthropic({ timeout: 5 * 60_000 });
  const response = await client.beta.messages.parse({
    model: EXTRACTION_MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(ExtractionSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") throw new Error("Claude declined to read this document.");
  if (response.stop_reason === "max_tokens") throw new Error("The report was too long to read in one pass. Try uploading fewer pages at a time.");
  if (!response.parsed_output) throw new Error("Claude's answer didn't match the expected format. Try again.");
  return { report: response.parsed_output, model: response.model };
}

// Turns SDK errors into something a clinician can act on.
export function describeExtractionError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "The Claude API key is missing or invalid. Set ANTHROPIC_API_KEY on the server.";
  if (e instanceof Anthropic.RateLimitError) return "Claude is busy right now (rate limited). Try again in a minute.";
  if (e instanceof Anthropic.BadRequestError) return `Claude couldn't read this file: ${e.message}`;
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach the Claude API. Check the server's network connection.";
  if (e instanceof Anthropic.APIError) return `Claude API error (${e.status ?? "unknown"}). Try again.`;
  if (e instanceof Error && /api key|authentication|apiKey/i.test(e.message)) return "The Claude API key is missing. Set ANTHROPIC_API_KEY on the server.";
  return e instanceof Error ? e.message : "Extraction failed.";
}
