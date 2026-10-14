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
import { parseJsonReply, schemaInstructions } from "./json-reply";

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
  const { parsed, model } = await readWithClaude(ExtractionSchema, SYSTEM, files, "Transcribe this lab report.", "report");
  return { report: parsed, model };
}

// The uploaded pages as Claude content blocks, with a legend giving each image's size
// (bounding boxes are in those pixels).
export function pageBlocks(files: ExtractInput, ask: string): Anthropic.Beta.BetaContentBlockParam[] {
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
  content.push({ type: "text", text: `${legend.join("\n")}\n\n${ask}` });
  return content;
}

type ReadOpts = { effort?: "low" | "medium" | "high"; maxTokens?: number; mode?: "strict" | "json" };

// One structured read of the pages. Streamed, so a long, wordy report (an MRI, a
// written echo, a long discharge summary) can take as long as it needs instead of
// running into an HTTP timeout, and with room for every word of it.
// "strict" constrains the answer with structured outputs. "json" puts the schema in
// the prompt and checks the answer here, for schemas too large for the API to
// compile; a strict read the API refuses for that reason is retried that way.
export async function readWithClaude<S extends z.ZodType>(
  schema: S,
  system: string,
  files: ExtractInput,
  ask: string,
  noun: string,
  opts: ReadOpts = {},
): Promise<{ parsed: z.infer<S>; model: string }> {
  const client = new Anthropic({ maxRetries: 2 });
  const base = {
    model: EXTRACTION_MODEL,
    max_tokens: opts.maxTokens ?? 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default" as const,
  };
  const effort = opts.effort ?? "high";
  const checked = <M extends Anthropic.Beta.BetaMessage>(r: M): M => {
    if (r.stop_reason === "refusal") throw new Error(`Claude declined to read this ${noun}.`);
    if (r.stop_reason === "max_tokens") throw new Error(`The ${noun} was too long to read in one pass. Try uploading fewer pages at a time.`);
    return r;
  };

  if (opts.mode !== "json") {
    try {
      const response = checked(
        await client.beta.messages
          .stream({ ...base, output_config: { effort, format: betaZodOutputFormat(schema) }, system, messages: [{ role: "user", content: pageBlocks(files, ask) }] })
          .finalMessage(),
      );
      if (!response.parsed_output) throw new Error("Claude's answer didn't match the expected format. Try again.");
      return { parsed: response.parsed_output as z.infer<S>, model: response.model };
    } catch (e) {
      if (!(e instanceof Anthropic.BadRequestError && /grammar/i.test(e.message))) throw e;
      console.warn(`Structured output schema too large for this ${noun}; reading it as checked JSON instead.`);
    }
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: pageBlocks(files, ask) }];
  const jsonSystem = `${system}\n\n${schemaInstructions(schema)}`;
  let error = "";
  // One read, and if the answer doesn't fit the schema, one chance to correct it.
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = checked(await client.beta.messages.stream({ ...base, output_config: { effort }, system: jsonSystem, messages }).finalMessage());
    const text = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    const reply = parseJsonReply(text, schema);
    if (reply.ok) return { parsed: reply.data, model: response.model };
    error = reply.error;
    messages.push(
      { role: "assistant", content: response.content as Anthropic.Beta.BetaContentBlockParam[] },
      { role: "user", content: `${error}\n\nReply again with the whole corrected JSON object only.` },
    );
  }
  console.error(`Claude's ${noun} JSON didn't match the schema: ${error}`);
  throw new Error("Claude's answer didn't match the expected format. Try again.");
}

const KindSchema = z.object({
  kind: z
    .enum(["lab_results", "document"])
    .describe("lab_results: mainly a table of lab test values (blood, urine, culture results). document: anything written in sentences or as a report: imaging (X-ray, CT, MRI, ultrasound, echocardiogram, ECG report), histopathology, discharge summary, prescription, letter, consult or procedure note"),
});

// For an upload marked "any report": which reader should take it.
export async function classifyImport(files: ExtractInput): Promise<"lab" | "document"> {
  const { parsed } = await readWithClaude(
    KindSchema,
    "You sort uploaded medical paperwork before it is transcribed. Look at the pages and say which kind they are.",
    files,
    "Is this mainly a table of lab results, or a written document?",
    "upload",
    { effort: "low", maxTokens: 4000 },
  );
  return parsed.kind === "lab_results" ? "lab" : "document";
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
