"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { PatientTaking, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { needsCosign, RX_COSIGNER_REQUIRED } from "@/lib/roles";
import { maxRefills, medWarnings } from "@/lib/meds/checks";
import { productFor } from "@/lib/meds/formulary";
import { daysSupplyFor } from "@/lib/meds/sig";
import { refillReview, writePrescription } from "@/lib/meds/server";
import { textRefillApproved } from "@/lib/sms/server";
import { refillBlocker, refillDetails, refillProduct } from "@/lib/meds/refill";
import { pendingReplacements } from "@/lib/meds/pending";
import { problemLink } from "@/lib/problems/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const TAKING: PatientTaking[] = ["taking", "not_taking", "taking_differently"];

const refresh = (patientId: string) => {
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/inbox");
};

export async function markMedsReviewed(patientId: string) {
  const currentUser = await requirePermission("reviewMeds");
  await db.patient.update({ where: { id: patientId }, data: { medsReviewedAt: new Date(), medsReviewedById: currentUser.id } });
  refresh(patientId);
}

export async function setTaking(patientId: string, medId: string, form: FormData) {
  await requirePermission("reviewMeds");
  const taking = str(form, "taking") as PatientTaking;
  if (!TAKING.includes(taking)) return;
  await db.medicationRequest.update({
    where: { id: medId, patientId, status: { in: ["active", "on_hold"] } },
    data: { taking, takingNote: taking === "taking" ? null : str(form, "takingNote") || null, takingAt: new Date() },
  });
  refresh(patientId);
}

// A medication prescribed elsewhere or bought over the counter. Nothing is sent.
export async function documentOutsideMed(patientId: string, form: FormData) {
  await requirePermission("reviewMeds");
  const drug = str(form, "drug");
  if (!drug) return;
  const product = productFor({ drug });
  const link = await problemLink(patientId, str(form, "conditionId"), str(form, "indication"));
  await db.medicationRequest.create({
    data: {
      patientId,
      drug: product?.display ?? drug,
      rxnorm: product?.rxnorm ?? null,
      dose: str(form, "dose") || product?.dose || "",
      route: str(form, "route") || product?.route || "oral",
      frequency: str(form, "frequency") || product?.frequency || "",
      ...link,
      status: "active",
      start: new Date(),
      rxClass: "historical",
      pharmacyNote: str(form, "source") || null,
      taking: "taking",
      takingAt: new Date(),
    },
  });
  refresh(patientId);
}

export async function setPreferredPharmacy(patientId: string, form: FormData) {
  await requirePermission("reviewMeds");
  const id = str(form, "pharmacyId");
  const pharmacy = id ? await db.pharmacy.findUnique({ where: { id } }) : null;
  await db.patient.update({ where: { id: patientId }, data: { preferredPharmacyId: pharmacy?.id ?? null } });
  refresh(patientId);
}

export async function discontinueMed(patientId: string, medId: string, form: FormData) {
  const currentUser = await requirePermission("editMeds");
  const reason = str(form, "reason") || "Discontinued";
  await db.medicationRequest.update({
    where: { id: medId, patientId, status: { in: ["active", "on_hold"] } },
    data: { status: "discontinued", end: new Date(), endReason: reason, endedById: currentUser.id },
  });
  // Any open refill request for it is moot now.
  await db.refillRequest.updateMany({
    where: { medicationId: medId, status: { in: ["requested", "pended"] } },
    data: { status: "denied", decidedById: currentUser.id, decidedAt: new Date(), decisionNote: `Medication discontinued: ${reason}` },
  });
  refresh(patientId);
}

export async function holdMed(patientId: string, medId: string, hold: boolean) {
  await requirePermission("editMeds");
  await db.medicationRequest.update({ where: { id: medId, patientId, status: hold ? "active" : "on_hold" }, data: { status: hold ? "on_hold" : "active" } });
  refresh(patientId);
}

export async function cosignPrescription(medId: string, next?: string) {
  const currentUser = await requirePermission("cosignOrders");
  const med = await db.medicationRequest.update({ where: { id: medId, cosignerId: currentUser.id, cosignedAt: null }, data: { cosignedAt: new Date() } });
  refresh(med.patientId);
  if (next) redirect(next);
}

// A nurse prepares a refill request: checks the protocol and passes it on.
export async function pendRefill(requestId: string, next: string, form: FormData) {
  const currentUser = await requirePermission("pendRefills");
  const req = await db.refillRequest.update({
    where: { id: requestId, status: "requested" },
    data: { status: "pended", pendedById: currentUser.id, pendedAt: new Date(), pendNote: str(form, "note") || null },
  });
  refresh(req.patientId);
  redirect(next);
}

// Approving renews the prescription as it stands, with the quantity and refills
// chosen here; changing the dose goes through the chart's Reorder instead.
export async function approveRefill(requestId: string, next: string, form: FormData): Promise<{ error: string } | void> {
  const currentUser = await requirePermission("approveRefills");
  const req = await db.refillRequest.findFirstOrThrow({ where: { id: requestId, status: { in: ["requested", "pended"] } } });
  const { med, ctx } = await refillReview(req.medicationId);
  const product = productFor(med);
  const refills = Math.max(0, Math.min(maxRefills(med.drug), Math.round(Number(str(form, "refills")) || 0)));
  const quantity = str(form, "quantity") || med.quantity || product?.quantity || "";

  const stops = medWarnings(med.drug, { dose: med.dose, frequency: med.frequency, refills }, ctx).filter((w) => w.level === "stop");
  const override = str(form, "overrideReason");
  if (stops.length && !override) return { error: "Give an override reason to approve with a hard-stop alert." };
  let cosignerId: string | null = null;
  if (needsCosign(currentUser.role)) {
    const attending = await db.practitioner.findFirst({ where: { id: str(form, "cosignerId"), role: "physician", active: true } });
    if (!attending) return { error: RX_COSIGNER_REQUIRED };
    cosignerId = attending.id;
  }

  const note = str(form, "note");
  await db.$transaction(async (tx) => {
    const frequency = med.frequency.replace(/\s+for \d+ days?$/, "");
    const created = await writePrescription(tx, {
      patientId: med.patientId,
      drug: med.drug,
      rxnorm: med.rxnorm,
      dose: med.dose,
      route: med.route,
      frequency,
      prn: med.prn,
      prnReason: med.prnReason,
      quantity,
      daysSupply: daysSupplyFor(product, { dose: med.dose, frequency }, quantity) ?? med.daysSupply,
      refills,
      rxClass: "print",
      pharmacyId: req.pharmacyId ?? med.pharmacyId,
      daw: med.daw,
      patientInstructions: med.patientInstructions,
      indication: med.indication,
      conditionId: med.conditionId,
      replacesId: med.id,
      refillRequestId: req.id,
      prescriberId: currentUser.id,
      cosignerId,
      pharmacyNote: note || null,
    });
    await tx.refillRequest.update({ where: { id: req.id }, data: { decisionNote: note || null } });
    await tx.serviceRequest.create({
      data: {
        patientId: med.patientId,
        type: "medication",
        code: `RX:${med.rxnorm ?? ""}`,
        display: med.drug,
        status: "completed",
        indication: med.indication,
        conditionId: med.conditionId,
        instructions: ["Refill request approved", override && `Alert overridden: ${override}`].filter(Boolean).join("\n"),
        details: { dose: med.dose, route: med.route, frequency, quantity, refills, rxClass: "print" },
        orderedById: currentUser.id,
        signedAt: new Date(),
        completedAt: new Date(),
        medicationId: created.id,
      },
    });
  });
  try {
    await textRefillApproved(med.patientId, currentUser.name, med.drug, currentUser.id);
  } catch (e) {
    console.error("Couldn't queue the patient's text", e);
  }
  refresh(med.patientId);
  redirect(next);
}

export async function denyRefill(requestId: string, next: string, form: FormData) {
  const currentUser = await requirePermission("approveRefills");
  const reason = str(form, "reason") || "Denied";
  const note = str(form, "note");
  const req = await db.refillRequest.update({
    where: { id: requestId, status: { in: ["requested", "pended"] } },
    data: { status: "denied", decidedById: currentUser.id, decidedAt: new Date(), decisionNote: note ? `${reason}: ${note}` : reason },
  });
  refresh(req.patientId);
  redirect(next);
}

export type RefillResult = { added?: string; error?: string };

// One-click Refill, from any medication list: the same prescription again goes into
// the order basket for a prescriber to sign, replacing the current one when signed.
// Outside medicines become this clinic's prescription; a stopped one starts again.
// An open pharmacy refill request for the medication is answered by it.
export async function refillMeds(patientId: string, medIds: string[]): Promise<RefillResult> {
  const currentUser = await requirePermission("pendOrders");
  const [meds, inBasket, requests] = await Promise.all([
    db.medicationRequest.findMany({ where: { id: { in: medIds }, patientId } }),
    pendingReplacements(patientId),
    db.refillRequest.findMany({ where: { patientId, medicationId: { in: medIds }, status: { in: ["requested", "pended"] } }, select: { id: true, medicationId: true } }),
  ]);
  const added: string[] = [];
  const skipped: string[] = [];
  for (const m of meds.sort((a, b) => a.drug.localeCompare(b.drug))) {
    if (inBasket.has(m.id)) {
      skipped.push(`${m.drug} is already in the order basket.`);
      continue;
    }
    const product = refillProduct(m);
    const blocker = refillBlocker(m);
    if (blocker || !product) {
      skipped.push(blocker ?? "");
      continue;
    }
    const details = refillDetails(m, product, requests.find((r) => r.medicationId === m.id)?.id);
    await db.serviceRequest.create({
      data: {
        patientId,
        type: "medication",
        code: `RX:${product.rxnorm}`,
        display: m.drug,
        status: "pending",
        priority: "routine",
        orderedById: currentUser.id,
        indication: m.indication,
        conditionId: m.conditionId,
        // An outside medicine's note says where it came from, not anything for the pharmacy.
        instructions: m.rxClass === "historical" ? null : m.pharmacyNote,
        details: details as Prisma.InputJsonValue,
      },
    });
    added.push(m.drug);
  }
  refresh(patientId);
  if (!added.length) return { error: skipped.join(" ") || "Nothing to refill." };
  return { added: `${added.join(", ")}${skipped.length ? `. ${skipped.join(" ")}` : ""}` };
}

// Medication reconciliation: "Continue" keeps a medication going as it is, with no new
// prescription. It is recorded with who and when, and a medication continued on a
// visit's day prints on that visit's prescription. Calling it again undoes it.
export async function continueMed(patientId: string, medId: string, on: boolean) {
  const currentUser = await requirePermission("reviewMeds");
  await db.medicationRequest.update({
    where: { id: medId, patientId, status: { in: ["active", "on_hold"] } },
    data: on ? { continuedAt: new Date(), continuedById: currentUser.id } : { continuedAt: null, continuedById: null },
  });
  refresh(patientId);
}
