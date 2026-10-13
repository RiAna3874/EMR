import "server-only";
import { db, type Tx } from "@/lib/db";
import { orderContext } from "@/lib/orders/server";
import type { OrderContext } from "@/lib/orders/checks";
import { fillStatus, refillProtocol } from "./checks";
import type { RxDetails } from "./rx";

// The order-check context without one medication: a reorder or dose change
// shouldn't warn that the patient already takes the drug it replaces.
export function withoutMed(ctx: OrderContext, drug: string | null | undefined): OrderContext {
  if (!drug) return ctx;
  const i = ctx.activeMeds.indexOf(drug);
  return i < 0 ? ctx : { ...ctx, activeMeds: ctx.activeMeds.filter((_, n) => n !== i) };
}

export async function lastVisitAt(patientId: string) {
  const e = await db.encounter.findFirst({
    where: { patientId, status: { in: ["finished", "in_progress"] }, start: { lte: new Date() } },
    orderBy: { start: "desc" },
    select: { start: true },
  });
  return e?.start.getTime() ?? null;
}

// Everything the refill screen weighs for one medication.
export async function refillReview(medicationId: string) {
  const med = await db.medicationRequest.findUniqueOrThrow({
    where: { id: medicationId },
    include: { dispenses: { orderBy: { filledAt: "desc" }, include: { pharmacy: true } }, prescriber: true, pharmacy: true },
  });
  const [ctx, visit] = await Promise.all([orderContext(med.patientId), lastVisitAt(med.patientId)]);
  return {
    med,
    ctx: withoutMed(ctx, med.drug),
    protocol: refillProtocol(med.drug, { lastResulted: ctx.lastResulted, lastVisitAt: visit, now: ctx.now }),
    fills: fillStatus(med.dispenses, med.refills, ctx.now),
  };
}

// Writes a signed prescription. A reorder, change or refill keeps the therapy's
// start date and replaces the prescription it follows.
export async function writePrescription(
  tx: Tx,
  rx: RxDetails & { patientId: string; drug: string; rxnorm: string | null; indication: string | null; prescriberId: string; cosignerId: string | null; pharmacyNote?: string | null },
) {
  const now = new Date();
  const prior = rx.replacesId
    ? await tx.medicationRequest.findFirst({ where: { id: rx.replacesId, patientId: rx.patientId, status: { in: ["active", "on_hold"] } } })
    : null;
  const pharmacyId = rx.rxClass === "print" ? null : (rx.pharmacyId ?? null);
  if (prior) {
    await tx.medicationRequest.update({
      where: { id: prior.id },
      data: { status: "replaced", end: now, endedById: rx.prescriberId, endReason: rx.refillRequestId
          ? "Refill approved"
          : prior.drug !== rx.drug
            ? `Changed to ${rx.drug}`
            : prior.dose !== rx.dose || prior.frequency.replace(/\s+for \d+ days?$/, "") !== rx.frequency
              ? `Changed to ${rx.dose} ${rx.frequency}`
              : "Reordered",
      },
    });
  }
  const med = await tx.medicationRequest.create({
    data: {
      patientId: rx.patientId,
      drug: rx.drug,
      rxnorm: rx.rxnorm,
      dose: rx.dose,
      route: rx.route,
      frequency: rx.durationDays ? `${rx.frequency} for ${rx.durationDays} days` : rx.frequency,
      prn: rx.prn ?? false,
      prnReason: rx.prnReason ?? null,
      indication: rx.indication ?? prior?.indication ?? null,
      status: "active",
      start: prior?.start ?? now,
      end: rx.durationDays ? new Date(now.getTime() + rx.durationDays * 86_400_000) : null,
      prescriberId: rx.prescriberId,
      rxClass: rx.rxClass ?? "e_prescribe",
      authoredAt: now,
      quantity: rx.quantity,
      daysSupply: rx.daysSupply ?? null,
      refills: rx.refills,
      daw: rx.daw ?? false,
      patientInstructions: rx.patientInstructions ?? null,
      pharmacyNote: rx.pharmacyNote ?? null,
      pharmacyId,
      sentAt: rx.rxClass === "print" ? null : now,
      priorId: prior?.id ?? null,
      taking: prior?.taking ?? null,
      takingAt: prior?.takingAt ?? null,
      takingNote: prior?.takingNote ?? null,
      cosignerId: rx.cosignerId,
    },
  });
  if (rx.refillRequestId) {
    await tx.refillRequest.updateMany({
      where: { id: rx.refillRequestId, status: { in: ["requested", "pended"] } },
      data: { status: "approved", decidedById: rx.prescriberId, decidedAt: now, resultId: med.id },
    });
  }
  return med;
}
