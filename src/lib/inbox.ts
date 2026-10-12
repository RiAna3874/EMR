import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAbnormal, isCritical } from "@/lib/format";

// A result belongs in a clinician's Inbox when they ordered it, or, with no
// order (an imported outside report), when they are the patient's PCP.
export const resultsWhere = (userId: string): Prisma.DiagnosticReportWhereInput => ({
  reviewedAt: null,
  OR: [{ order: { orderedById: userId } }, { orderId: null, patient: { pcpId: userId } }],
});

export async function inboxResults(userId: string) {
  const reports = await db.diagnosticReport.findMany({
    where: resultsWhere(userId),
    orderBy: [{ issuedAt: "desc" }],
    include: { patient: true, observations: { orderBy: { sortOrder: "asc" } } },
  });
  const tagged = reports.map((r) => ({
    ...r,
    abnormal: r.observations.some((o) => isAbnormal(o.flag)),
    critical: r.observations.some((o) => isCritical(o.flag)),
  }));
  // Critical first, then newest.
  tagged.sort((a, b) => Number(b.critical) - Number(a.critical) || b.issuedAt.getTime() - a.issuedAt.getTime());
  return tagged;
}

export async function inboxCounts(userId: string) {
  const [results, abnormal, notes, imports, orders] = await Promise.all([
    db.diagnosticReport.count({ where: resultsWhere(userId) }),
    db.diagnosticReport.count({ where: { ...resultsWhere(userId), observations: { some: { flag: { in: ["L", "H", "LL", "HH", "A"] } } } } }),
    db.note.count({ where: { authorId: userId, status: "draft" } }),
    db.importJob.count({ where: { status: { in: ["needs_review", "failed"] } } }),
    db.serviceRequest.groupBy({ by: ["patientId"], where: { orderedById: userId, status: "pending" } }),
  ]);
  return { abnormal, normal: results - abnormal, notes, imports, orders: orders.length, total: results + notes + imports + orders.length };
}
