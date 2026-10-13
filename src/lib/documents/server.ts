import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { describeExtractionError } from "@/lib/labs/extract";
import { docDraftFromExtraction, readContent, suggestOrder, type ChartFacts } from "./draft";
import type { FiledDoc } from "@/components/documents/doc-view";
import { extractDocument } from "./extract";

// The parts of the chart a document is reconciled against.
export async function chartFacts(patientId: string): Promise<ChartFacts> {
  const [problems, meds, orders] = await Promise.all([
    db.condition.findMany({ where: { patientId, status: "active" }, select: { code: true, display: true }, orderBy: { priority: "asc" } }),
    db.medicationRequest.findMany({ where: { patientId, status: { in: ["active", "on_hold"] } }, select: { drug: true } }),
    db.serviceRequest.findMany({
      where: { patientId, status: "signed", type: { in: ["imaging", "referral", "procedure"] } },
      orderBy: { signedAt: "desc" },
      select: { id: true, type: true, code: true, display: true, signedAt: true, createdAt: true },
    }),
  ]);
  return {
    problems,
    meds,
    orders: orders.map((o) => ({ id: o.id, type: o.type, code: o.code, display: o.display, signedAt: (o.signedAt ?? o.createdAt).toISOString() })),
  };
}

export async function runDocumentExtraction(jobId: string) {
  const job = await db.importJob.findUniqueOrThrow({ where: { id: jobId }, include: { documents: { orderBy: { position: "asc" } } } });
  const docs = job.documents;
  try {
    const { document, model } = await extractDocument(
      docs.map((d) => ({ mimeType: d.mimeType, data: Buffer.from(d.data), width: d.width, height: d.height })),
      docs.map((d) => d.fileName),
    );
    const draft = docDraftFromExtraction(document, docs.map((d) => ({ width: d.width, height: d.height })));
    draft.orderId = suggestOrder(draft, (await chartFacts(job.patientId)).orders);
    await db.importJob.update({
      where: { id: jobId, status: "extracting" },
      data: {
        status: "needs_review",
        model,
        extraction: document as unknown as Prisma.InputJsonValue,
        draft: draft as unknown as Prisma.InputJsonValue,
        error: null,
      },
    });
  } catch (e) {
    console.error("Document extraction failed", e);
    await db.importJob.updateMany({ where: { id: jobId, status: "extracting" }, data: { status: "failed", error: describeExtractionError(e) } });
  }
}

export const filedDocInclude = {
  filedBy: { select: { name: true } },
  reviewedBy: { select: { name: true } },
  order: { select: { display: true, orderedById: true } },
  importJob: { select: { _count: { select: { documents: true } } } },
} satisfies Prisma.ClinicalDocumentInclude;

export function toFiledDoc(d: Prisma.ClinicalDocumentGetPayload<{ include: typeof filedDocInclude }>): FiledDoc {
  return { ...d, content: readContent(d.content), pages: d.importJob?._count.documents ?? 0 };
}

// An outside document belongs in a clinician's Inbox when they ordered what it
// answers, or, with no order, when they are the patient's PCP.
export const documentsWhere = (userId: string): Prisma.ClinicalDocumentWhereInput => ({
  reviewedAt: null,
  OR: [{ order: { orderedById: userId } }, { orderId: null, patient: { pcpId: userId } }],
});
