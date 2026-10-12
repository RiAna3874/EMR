import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { orderableByCode, satisfyingCodes } from "./catalog";
import type { OrderContext } from "./checks";

export async function orderContext(patientId: string): Promise<OrderContext> {
  const [allergies, open, reports, labObs, meds, egfr] = await Promise.all([
    db.allergyIntolerance.findMany({ where: { patientId }, select: { substance: true, severity: true } }),
    db.serviceRequest.findMany({ where: { patientId, status: { in: ["pending", "signed"] } }, select: { code: true, status: true } }),
    db.diagnosticReport.groupBy({ by: ["code"], where: { patientId }, _max: { effectiveAt: true } }),
    db.observation.groupBy({ by: ["code"], where: { patientId, category: "laboratory" }, _max: { effectiveAt: true } }),
    db.medicationRequest.findMany({ where: { patientId, status: { in: ["active", "on_hold"] } }, select: { drug: true } }),
    db.observation.findFirst({ where: { patientId, code: "33914-3", valueNum: { not: null } }, orderBy: { effectiveAt: "desc" }, select: { valueNum: true } }),
  ]);
  const lastResulted: Record<string, number> = {};
  for (const r of [...reports, ...labObs]) {
    const t = r._max.effectiveAt?.getTime();
    if (t !== undefined) lastResulted[r.code] = Math.max(lastResulted[r.code] ?? 0, t);
  }
  return {
    allergies,
    openOrders: open,
    lastResulted,
    activeMeds: meds.map((m) => m.drug),
    egfr: egfr?.valueNum ?? null,
    now: Date.now(),
  };
}

// A filed report completes the oldest active lab order it satisfies, and links to it.
export async function completeLabOrder(
  tx: Prisma.TransactionClient,
  report: { id: string; patientId: string; code: string; effectiveAt: Date },
  observationCodes: string[],
) {
  const candidates = await tx.serviceRequest.findMany({
    where: { patientId: report.patientId, type: "lab", status: "signed", signedAt: { lte: new Date(report.effectiveAt.getTime() + 86_400_000) } },
    orderBy: { signedAt: "asc" },
  });
  const codes = new Set([report.code, ...observationCodes]);
  const order = candidates.find((o) => {
    const def = orderableByCode.get(o.code);
    return satisfyingCodes(def ?? { code: o.code }).some((c) => codes.has(c));
  });
  if (!order) return null;
  await tx.serviceRequest.update({ where: { id: order.id }, data: { status: "completed", completedAt: new Date() } });
  await tx.diagnosticReport.update({ where: { id: report.id }, data: { orderId: order.id } });
  return order;
}
