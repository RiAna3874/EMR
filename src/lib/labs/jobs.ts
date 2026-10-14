import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toLocalDate } from "@/lib/format";
import { draftFromExtraction, type History } from "./draft";
import { classifyImport, describeExtractionError, extractLabReport, type ExtractInput } from "./extract";
import { runDocumentExtraction } from "@/lib/documents/server";
import { hasDocumentFixture } from "@/lib/documents/extract";

// An extraction still "running" after this long was cut off (e.g. a server restart).
// Long written reports can take several minutes to transcribe.
export const STALE_EXTRACTION_MS = 20 * 60_000;

const asInput = (docs: { mimeType: string; data: Uint8Array; width: number | null; height: number | null }[]): ExtractInput =>
  docs.map((d) => ({ mimeType: d.mimeType, data: Buffer.from(d.data), width: d.width, height: d.height }));

// Moves an import to the other reader before it is read.
async function setKind(jobId: string, kind: "lab" | "document") {
  await db.importJob.update({ where: { id: jobId }, data: { kind, autoKind: false } });
  await db.documentReference.updateMany({ where: { importJobId: jobId }, data: { kind: kind === "document" ? "clinical_document" : "lab_report" } });
}

export async function runExtraction(jobId: string) {
  const job = await db.importJob.findUnique({ where: { id: jobId }, select: { kind: true, autoKind: true } });
  if (!job) return;
  const docs = await db.documentReference.findMany({ where: { importJobId: jobId }, orderBy: { position: "asc" } });
  let kind = job.kind;
  if (job.autoKind) {
    try {
      // Dev fixtures stand in for Claude: a saved document transcription means "document".
      const fixtures = process.env.NODE_ENV !== "production" && (process.env.MERIDIAN_DOCUMENT_FIXTURES || process.env.MERIDIAN_EXTRACTION_FIXTURE);
      kind = fixtures ? ((await hasDocumentFixture(docs[0]?.fileName)) ? "document" : "lab") : await classifyImport(asInput(docs));
    } catch (e) {
      // Sorting failed: a written document is the reader that loses nothing.
      console.error("Import sorting failed", e);
      kind = "document";
    }
    await setKind(jobId, kind);
  }
  if (kind === "document") return runDocumentExtraction(jobId);
  try {
    const { report, model } = await extractLabReport(asInput(docs));
    // No lab values at all: it is a written report (MRI, echo, letter). Read it as one.
    if (report.sections.every((s) => s.results.length === 0)) {
      await setKind(jobId, "document");
      return runDocumentExtraction(jobId);
    }
    const draft = draftFromExtraction(report, docs.map((d) => ({ width: d.width, height: d.height })));
    await db.importJob.update({
      where: { id: jobId, status: "extracting" },
      data: {
        status: "needs_review",
        model,
        extraction: report as unknown as Prisma.InputJsonValue,
        draft: draft as unknown as Prisma.InputJsonValue,
        error: null,
      },
    });
  } catch (e) {
    console.error("Lab report extraction failed", e);
    await db.importJob.updateMany({ where: { id: jobId, status: "extracting" }, data: { status: "failed", error: describeExtractionError(e) } });
  }
}

// Lab results already in this patient's chart for the given codes, by collection day.
export async function labHistory(patientId: string, codes: string[]): Promise<History> {
  if (codes.length === 0) return {};
  const obs = await db.observation.findMany({
    where: { patientId, category: "laboratory", code: { in: codes } },
    orderBy: { effectiveAt: "desc" },
    select: { code: true, effectiveAt: true, valueNum: true, valueText: true, unit: true },
  });
  const out: History = {};
  for (const o of obs) {
    (out[o.code] ??= []).push({ date: toLocalDate(o.effectiveAt), value: o.valueText ?? String(o.valueNum ?? ""), unit: o.unit });
  }
  return out;
}
