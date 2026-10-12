import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { toLocalDate } from "@/lib/format";
import { draftFromExtraction, type History } from "./draft";
import { describeExtractionError, extractLabReport } from "./extract";

// An extraction still "running" after this long was cut off (e.g. a server restart).
export const STALE_EXTRACTION_MS = 10 * 60_000;

export async function runExtraction(jobId: string) {
  const docs = await db.documentReference.findMany({ where: { importJobId: jobId }, orderBy: { position: "asc" } });
  try {
    const { report, model } = await extractLabReport(
      docs.map((d) => ({ mimeType: d.mimeType, data: Buffer.from(d.data), width: d.width, height: d.height })),
    );
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
