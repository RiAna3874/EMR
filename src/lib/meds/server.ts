import "server-only";
import { db, type Tx } from "@/lib/db";
import { orderContext } from "@/lib/orders/server";
import type { OrderContext } from "@/lib/orders/checks";
import { fillStatus, refillProtocol } from "./checks";
import { rxClassFor, type RxDetails } from "./rx";
import { parseSteps, stepsFrequency, totalDays } from "./steps";
import { courseEnd, isYmd } from "@/lib/orders/dates";
import { toLocalDate } from "@/lib/format";

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
  rx: RxDetails & { patientId: string; drug: string; rxnorm: string | null; indication: string | null; conditionId?: string | null; prescriberId: string; cosignerId: string | null; pharmacyNote?: string | null },
) {
  const now = new Date();
  // A pending order written before e-prescribing was switched off still prints.
  const rxClass = rxClassFor(rx.rxClass);
  const prior = rx.replacesId
    ? await tx.medicationRequest.findFirst({ where: { id: rx.replacesId, patientId: rx.patientId, status: { in: ["active", "on_hold"] } } })
    : null;
  const pharmacyId = rxClass === "print" ? null : (rx.pharmacyId ?? null);
  // A taper or "followed by" sig stores its first dose, and the whole course in words as the frequency.
  const steps = parseSteps(rx.steps);
  const dose = steps ? steps[0].dose : rx.dose;
  const frequency = steps ? stepsFrequency(steps) : rx.durationDays ? `${rx.frequency} for ${rx.durationDays} days` : rx.frequency;
  const courseDays = steps ? totalDays(steps) : rx.durationDays;
  // A start date still ahead holds the course until then; one already passed starts it today.
  const today = toLocalDate(now);
  const startsOn = isYmd(rx.startDate) && rx.startDate > today ? rx.startDate : null;
  const firstDay = startsOn ?? today;
  if (prior) {
    await tx.medicationRequest.update({
      where: { id: prior.id },
      data: { status: "replaced", end: now, endedById: rx.prescriberId, endReason: rx.refillRequestId
          ? "Refill approved"
          : rx.refill
            ? "Refilled"
            : prior.drug !== rx.drug
            ? `Changed to ${rx.drug}`
            : steps && JSON.stringify(parseSteps(prior.steps)) !== JSON.stringify(steps)
              ? `Changed to ${dose} ${frequency}`
              : !steps && (prior.steps || prior.dose !== rx.dose || prior.frequency.replace(/\s+for \d+ days?$/, "") !== rx.frequency)
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
      dose,
      route: rx.route,
      frequency,
      steps: steps ?? undefined,
      prn: rx.prn ?? false,
      prnReason: rx.prnReason ?? null,
      indication: rx.indication ?? prior?.indication ?? null,
      // A reorder or change stays under the problem the medication was for.
      conditionId: rx.conditionId ?? (rx.indication ? null : prior?.conditionId) ?? null,
      status: "active",
      start: prior?.start ?? new Date(firstDay),
      courseStart: startsOn ? new Date(startsOn) : null,
      // The last day of the course, counting the first.
      end: courseDays ? new Date(courseEnd(firstDay, courseDays)) : null,
      prescriberId: rx.prescriberId,
      rxClass,
      authoredAt: now,
      quantity: rx.quantity,
      daysSupply: rx.daysSupply ?? null,
      refills: rx.refills,
      daw: rx.daw ?? false,
      patientInstructions: rx.patientInstructions ?? null,
      pharmacyNote: rx.pharmacyNote ?? null,
      pharmacyId,
      sentAt: rxClass === "print" ? null : now,
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
