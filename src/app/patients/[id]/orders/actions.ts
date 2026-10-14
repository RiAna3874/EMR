"use server";

import { revalidatePath } from "next/cache";
import type { OrderPriority, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { ORDER_SETS, orderableByCode, orderableFor, type Orderable } from "@/lib/orders/catalog";
import { orderContext, pendingOrderWarnings } from "@/lib/orders/server";
import { productFor } from "@/lib/meds/formulary";
import { rxFromForm, type RxDetails } from "@/lib/meds/rx";
import { writePrescription } from "@/lib/meds/server";
import { needsCosign, RX_COSIGNER_REQUIRED } from "@/lib/roles";
import { problemLink } from "@/lib/problems/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const PRIORITIES: OrderPriority[] = ["routine", "urgent", "stat"];

function baseOrder(patientId: string, orderedById: string, o: Orderable, orderSet?: string) {
  return {
    patientId,
    type: o.type,
    code: o.code,
    display: o.display,
    status: "pending" as const,
    orderedById,
    orderSet: orderSet ?? null,
    details: o.med ? ({ dose: o.med.dose, route: o.med.route, frequency: o.med.frequency, quantity: o.med.quantity, refills: o.med.refills } satisfies RxDetails as Prisma.InputJsonValue) : undefined,
  };
}

export async function addOrder(patientId: string, form: FormData) {
  const currentUser = await requirePermission("pendOrders");
  const o = orderableFor(str(form, "code"));
  if (!o) return;
  const priority = str(form, "priority") as OrderPriority;
  const expected = str(form, "expectedAt");
  const product = o.type === "medication" ? productFor({ code: o.code }) : undefined;
  const details = product ? rxFromForm(form, product) : undefined;
  // Off-list medications have no defaults to fall back on.
  if (product?.offList && (!details?.dose || !details.frequency || !details.quantity)) return;
  if (details) {
    // One pending prescription per medication being replaced.
    if (details.replacesId) await db.serviceRequest.deleteMany({ where: { patientId, status: "pending", details: { path: ["replacesId"], equals: details.replacesId } } });
    if (details.rxClass !== "print" && !details.pharmacyId) {
      const p = await db.patient.findUnique({ where: { id: patientId }, select: { preferredPharmacyId: true } });
      details.pharmacyId = p?.preferredPharmacyId ?? null;
    }
  }
  const link = await problemLink(patientId, str(form, "conditionId"), str(form, "indication"));
  await db.serviceRequest.create({
    data: {
      ...baseOrder(patientId, currentUser.id, o),
      priority: PRIORITIES.includes(priority) ? priority : "routine",
      ...link,
      instructions: (product ? str(form, "pharmacyNote") : str(form, "instructions")) || null,
      expectedAt: expected ? new Date(expected) : null,
      details: details as Prisma.InputJsonValue | undefined,
    },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/inbox");
}

// Adds every order in the set that isn't already pending or active.
export async function addOrderSet(patientId: string, setId: string) {
  const currentUser = await requirePermission("pendOrders");
  const set = ORDER_SETS.find((s) => s.id === setId);
  if (!set) return;
  const open = await db.serviceRequest.findMany({ where: { patientId, status: { in: ["pending", "signed"] } }, select: { code: true } });
  const skip = new Set(open.map((o) => o.code));
  const data = set.codes
    .filter((c) => !skip.has(c))
    .map((c) => orderableByCode.get(c))
    .filter((o): o is Orderable => !!o)
    .map((o) => baseOrder(patientId, currentUser.id, o, set.name));
  if (data.length) await db.serviceRequest.createMany({ data });
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/inbox");
}

export async function removePendingOrder(patientId: string, orderId: string) {
  await requirePermission("pendOrders");
  await db.serviceRequest.delete({ where: { id: orderId, patientId, status: "pending" } });
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/inbox");
}

export async function updatePendingOrder(patientId: string, orderId: string, form: FormData) {
  await requirePermission("pendOrders");
  const priority = str(form, "priority") as OrderPriority;
  await db.serviceRequest.update({
    where: { id: orderId, patientId, status: "pending" },
    data: {
      priority: PRIORITIES.includes(priority) ? priority : undefined,
      indication: form.has("indication") ? str(form, "indication") || null : undefined,
    },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
}

// Signs the pending orders the signer was shown, including ones a nurse pended; the
// signer becomes the ordering clinician. If an order was pended or removed, or a new
// hard-stop alert appeared, after the page was loaded, nothing is signed and the list
// refreshes for another look. Orders with a hard-stop warning need an override reason.
// Prescriptions become medication list entries; a resident names a cosigning attending.
// How the pending list differs from the one on the signer's screen, or null if it doesn't.
function listChanged(pending: { id: string; display: string }[], shownIds: string[]) {
  const shown = new Set(shownIds);
  const added = pending.filter((p) => !shown.has(p.id));
  if (added.length) return `${added.map((p) => p.display).join(", ")} ${added.length === 1 ? "was" : "were"} added to pending orders since this page opened.`;
  if (shown.size !== pending.length) return "Some pending orders were removed or signed since this page opened.";
  return null;
}

function newAlerts(stops: { id: string; display: string }[], shownIds: string[]) {
  const unseen = stops.filter((s) => !shownIds.includes(s.id));
  return unseen.length ? `${unseen.map((s) => s.display).join(", ")} now ${unseen.length === 1 ? "has" : "have"} a hard-stop alert.` : null;
}

export async function signOrders(patientId: string, form: FormData): Promise<{ error: string } | void> {
  const currentUser = await requirePermission("signOrders");
  const pending = await db.serviceRequest.findMany({ where: { patientId, status: "pending" }, orderBy: { createdAt: "asc" } });
  if (!pending.length) return;
  const ctx = await orderContext(patientId);
  ctx.openOrders = ctx.openOrders.filter((o) => o.status !== "pending");
  const warnings = await pendingOrderWarnings(pending, ctx);
  const stops = pending.filter((p) => warnings.get(p.id)?.some((w) => w.level === "stop"));
  const changed = listChanged(pending, form.getAll("orderId").map(String)) ?? newAlerts(stops, form.getAll("alertedId").map(String));
  if (changed) {
    revalidatePath(`/patients/${patientId}`, "layout");
    return { error: `${changed} Nothing was signed. Check the list and sign again.` };
  }
  const reason = str(form, "overrideReason");
  if (stops.length && !reason) return { error: `Give an override reason to sign ${stops.map((s) => s.display).join(", ")}.` };

  const meds = pending.filter((p) => p.type === "medication");
  let cosignerId: string | null = null;
  if (meds.length && needsCosign(currentUser.role)) {
    const attending = await db.practitioner.findFirst({ where: { id: str(form, "cosignerId"), role: "physician", active: true } });
    if (!attending) return { error: RX_COSIGNER_REQUIRED };
    cosignerId = attending.id;
  }
  const patient = await db.patient.findUniqueOrThrow({ where: { id: patientId }, select: { preferredPharmacyId: true } });

  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const p of pending) {
      let medicationId: string | null = null;
      const overridden = stops.some((s) => s.id === p.id);
      if (p.type === "medication") {
        const d = (p.details ?? {}) as Partial<RxDetails>;
        const med = await writePrescription(tx, {
          dose: d.dose ?? "",
          route: d.route ?? "oral",
          frequency: d.frequency ?? "",
          prn: d.prn,
          prnReason: d.prnReason,
          durationDays: d.durationDays,
          quantity: d.quantity ?? "",
          daysSupply: d.daysSupply,
          refills: d.refills ?? 0,
          rxClass: d.rxClass,
          pharmacyId: d.pharmacyId ?? patient.preferredPharmacyId,
          daw: d.daw,
          patientInstructions: d.patientInstructions,
          replacesId: d.replacesId,
          refillRequestId: d.refillRequestId,
          patientId,
          drug: p.display,
          rxnorm: p.code.replace(/^RX:/, ""),
          indication: p.indication,
          conditionId: p.conditionId,
          prescriberId: currentUser.id,
          cosignerId,
          pharmacyNote: p.instructions,
        });
        medicationId = med.id;
      }
      await tx.serviceRequest.update({
        where: { id: p.id },
        data: {
          // A signed prescription goes to the medication list; the order itself is done.
          status: p.type === "medication" ? "completed" : "signed",
          signedAt: now,
          completedAt: p.type === "medication" ? now : null,
          orderedById: currentUser.id,
          medicationId,
          instructions: overridden ? [p.instructions, `Alert overridden: ${reason}`].filter(Boolean).join("\n") : undefined,
        },
      });
    }
  });
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/inbox");
}

export async function discontinueOrder(patientId: string, orderId: string) {
  await requirePermission("signOrders");
  await db.serviceRequest.update({ where: { id: orderId, patientId, status: "signed" }, data: { status: "discontinued", discontinuedAt: new Date() } });
  revalidatePath(`/patients/${patientId}`, "layout");
}

// Imaging, referrals and procedures have no result feed; the clinician marks them done.
export async function completeOrder(patientId: string, orderId: string) {
  await requirePermission("signOrders");
  await db.serviceRequest.update({
    where: { id: orderId, patientId, status: "signed", type: { in: ["imaging", "referral", "procedure"] } },
    data: { status: "completed", completedAt: new Date() },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
}
