import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { isAbnormal, isCritical } from "@/lib/format";
import { can, type SessionUser } from "@/lib/roles";
import { documentsWhere } from "@/lib/documents/server";
import { isUnassigned, reviewOwnerWhere } from "@/lib/review-owner";

// Which Inbox folders a role works.
export type InboxFolder = "abnormal" | "normal" | "documents" | "imports" | "notes" | "cosign" | "orders" | "refills" | "rxcosign";
export function inboxFolderAllowed(role: SessionUser["role"], folder: InboxFolder) {
  switch (folder) {
    case "abnormal":
    case "normal":
    case "documents":
      return can(role, "reviewResults");
    case "imports":
      return can(role, "fileImports");
    case "notes":
      return can(role, "writeNotes");
    case "cosign":
      return can(role, "cosignNotes");
    case "orders":
      return can(role, "signOrders");
    case "refills":
      return can(role, "pendRefills");
    case "rxcosign":
      return can(role, "cosignOrders");
  }
}

// Prescribers see refill requests for medications they prescribed or patients
// they are PCP for, including ones a nurse pended; nursing works the whole
// clinic's new requests.
export function refillsWhere(user: Pick<SessionUser, "id" | "role">): Prisma.RefillRequestWhereInput {
  if (!can(user.role, "approveRefills")) return { status: "requested" };
  return { status: { in: ["requested", "pended"] }, OR: [{ medication: { prescriberId: user.id } }, { patient: { pcpId: user.id } }] };
}

// Unreviewed results this clinician answers for (src/lib/review-owner.ts).
export const resultsWhere = (userId: string): Prisma.DiagnosticReportWhereInput => ({
  reviewedAt: null,
  OR: reviewOwnerWhere(userId),
});

export async function inboxResults(userId: string) {
  const reports = await db.diagnosticReport.findMany({
    where: resultsWhere(userId),
    orderBy: [{ issuedAt: "desc" }],
    include: { patient: true, order: { select: { orderedById: true } }, observations: { orderBy: { sortOrder: "asc" } } },
  });
  const tagged = reports.map((r) => ({
    ...r,
    unassigned: isUnassigned(r, userId),
    abnormal: r.observations.some((o) => isAbnormal(o.flag)),
    critical: r.observations.some((o) => isCritical(o.flag)),
  }));
  // Critical first, then newest.
  tagged.sort((a, b) => Number(b.critical) - Number(a.critical) || b.issuedAt.getTime() - a.issuedAt.getTime());
  return tagged;
}

export async function inboxCounts(user: Pick<SessionUser, "id" | "role">) {
  const userId = user.id;
  const [results, abnormal, documents, notes, cosign, imports, orders, refills, rxcosign] = await Promise.all([
    db.diagnosticReport.count({ where: resultsWhere(userId) }),
    db.diagnosticReport.count({ where: { ...resultsWhere(userId), observations: { some: { flag: { in: ["L", "H", "LL", "HH", "A"] } } } } }),
    db.clinicalDocument.count({ where: documentsWhere(userId) }),
    db.note.count({ where: { authorId: userId, status: "draft" } }),
    db.note.count({ where: { cosignerId: userId, status: "pending_cosign" } }),
    db.importJob.count({ where: { status: { in: ["needs_review", "failed"] } } }),
    db.serviceRequest.groupBy({ by: ["patientId"], where: { orderedById: userId, status: "pending" } }),
    db.refillRequest.count({ where: refillsWhere(user) }),
    db.medicationRequest.count({ where: { cosignerId: userId, cosignedAt: null } }),
  ]);
  const raw: Record<InboxFolder, number> = { abnormal, normal: results - abnormal, documents, notes, cosign, imports, orders: orders.length, refills, rxcosign };
  const counts = Object.fromEntries(Object.entries(raw).map(([k, n]) => [k, inboxFolderAllowed(user.role, k as InboxFolder) ? n : 0])) as Record<InboxFolder, number>;
  return { ...counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}
