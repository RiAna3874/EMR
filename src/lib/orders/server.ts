import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { age } from "@/lib/format";
import { orderableByCode, satisfyingCodes } from "./catalog";
import { orderWarnings, type OrderContext, type OrderWarning } from "./checks";
import type { RxDetails } from "@/lib/meds/rx";

export async function orderContext(patientId: string): Promise<OrderContext> {
  const [allergies, open, reports, labObs, meds, egfr, patient] = await Promise.all([
    db.allergyIntolerance.findMany({ where: { patientId }, select: { substance: true, severity: true } }),
    db.serviceRequest.findMany({ where: { patientId, status: { in: ["pending", "signed"] } }, select: { code: true, status: true } }),
    db.diagnosticReport.groupBy({ by: ["code"], where: { patientId }, _max: { effectiveAt: true } }),
    db.observation.groupBy({ by: ["code"], where: { patientId, category: "laboratory" }, _max: { effectiveAt: true } }),
    db.medicationRequest.findMany({ where: { patientId, status: { in: ["active", "on_hold"] } }, select: { drug: true } }),
    db.observation.findFirst({ where: { patientId, code: "33914-3", valueNum: { not: null } }, orderBy: { effectiveAt: "desc" }, select: { valueNum: true } }),
    db.patient.findUnique({ where: { id: patientId }, select: { dob: true } }),
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
    ageYears: patient ? age(patient.dob) : null,
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

type PendingLike = { id: string; code: string; display: string; type: string; details: Prisma.JsonValue };

// Warnings for each pending order. A prescription is checked with its own sig,
// against the patient's current meds plus the other prescriptions pending with
// it, minus any medication it replaces.
export async function pendingOrderWarnings(pending: PendingLike[], ctx: OrderContext): Promise<Map<string, OrderWarning[]>> {
  const ids = pending.map((p) => (p.details as Partial<RxDetails> | null)?.replacesId).filter((x): x is string => !!x);
  const replaced = new Map(
    (ids.length ? await db.medicationRequest.findMany({ where: { id: { in: ids } }, select: { id: true, drug: true } }) : []).map((m) => [m.id, m.drug]),
  );
  const out = new Map<string, OrderWarning[]>();
  for (const p of pending) {
    const def = orderableByCode.get(p.code);
    if (!def) {
      out.set(p.id, []);
      continue;
    }
    const others = { ...ctx, openOrders: ctx.openOrders.filter((x) => x.status !== "pending") };
    if (p.type !== "medication") {
      out.set(p.id, orderWarnings(def, { ...others, openOrders: [...others.openOrders, ...pending.filter((x) => x.id !== p.id).map((x) => ({ code: x.code, status: "pending" }))] }));
      continue;
    }
    const d = (p.details ?? {}) as Partial<RxDetails>;
    const drop = d.replacesId ? replaced.get(d.replacesId) : undefined;
    const meds = [...ctx.activeMeds];
    if (drop && meds.includes(drop)) meds.splice(meds.indexOf(drop), 1);
    const alsoPending = pending.filter((x) => x.id !== p.id && x.type === "medication").map((x) => x.display);
    out.set(p.id, orderWarnings(def, { ...others, activeMeds: [...meds, ...alsoPending] }, { ignoreOpenOrder: true, rx: { dose: d.dose, frequency: d.frequency, refills: d.refills } }));
  }
  return out;
}
