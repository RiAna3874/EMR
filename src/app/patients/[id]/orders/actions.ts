"use server";

import { revalidatePath } from "next/cache";
import type { OrderPriority, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { orderableByCode, orderableFor, orderSetById, type Orderable } from "@/lib/orders/catalog";
import { orderDefaults } from "@/lib/orders/defaults";
import { toLocalDate } from "@/lib/format";
import { orderContext, pendingOrderWarnings } from "@/lib/orders/server";
import { productFor, writesOwnSig } from "@/lib/meds/formulary";
import { rxFromForm, type RxDetails } from "@/lib/meds/rx";
import { writePrescription } from "@/lib/meds/server";
import { needsCosign, RX_COSIGNER_REQUIRED } from "@/lib/roles";
import { problemLink } from "@/lib/problems/server";
import { textSignedOrders } from "@/lib/sms/server";

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
  // Off-list, DGDA-registry and generic-list medications have no defaults to fall back on.
  if (writesOwnSig(product) && (!details?.dose || !details.frequency || !details.quantity)) return;
  if (details) {
    // Changing a prescription already in the basket swaps it out.
    const edits = str(form, "editsOrderId");
    if (edits) await db.serviceRequest.deleteMany({ where: { id: edits, patientId, status: "pending", type: "medication" } });
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

export type BasketResult = { added?: string; error?: string };

const activeProblems = (patientId: string) =>
  db.condition.findMany({ where: { patientId, status: "active" }, orderBy: { priority: "asc" }, select: { id: true, display: true } });

// One click from search, favorites or frequent orders: into the basket with defaults
// (routine, due today, linked to the problem it is plainly for). Prescriptions go
// through the prescription form instead, since they need a sig.
export async function quickAddOrder(patientId: string, code: string): Promise<BasketResult> {
  const currentUser = await requirePermission("pendOrders");
  const o = orderableByCode.get(code);
  if (!o || o.type === "medication") return { error: "That order can't be added here." };
  const already = await db.serviceRequest.findFirst({ where: { patientId, code, status: "pending" }, select: { id: true } });
  if (already) return { error: `${o.display} is already in the order basket.` };
  const problems = await activeProblems(patientId);
  const d = orderDefaults(o, problems, toLocalDate(new Date()));
  const problem = problems.find((p) => p.id === d.conditionId);
  await db.serviceRequest.create({
    data: {
      ...baseOrder(patientId, currentUser.id, o),
      priority: d.priority,
      expectedAt: d.expectedAt ? new Date(d.expectedAt) : null,
      conditionId: problem?.id ?? null,
      indication: problem?.display ?? null,
    },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/inbox");
  return { added: o.display };
}

// Adds every order in the set that isn't already pending or active, with the same defaults.
export async function addOrderSet(patientId: string, setId: string): Promise<BasketResult> {
  const currentUser = await requirePermission("pendOrders");
  const set = orderSetById.get(setId);
  if (!set) return { error: "Order set not found." };
  const [open, problems] = await Promise.all([
    db.serviceRequest.findMany({ where: { patientId, status: { in: ["pending", "signed"] } }, select: { code: true } }),
    activeProblems(patientId),
  ]);
  const skip = new Set(open.map((o) => o.code));
  const today = toLocalDate(new Date());
  const data = set.codes
    .filter((c) => !skip.has(c))
    .map((c) => orderableByCode.get(c))
    .filter((o): o is Orderable => !!o)
    .map((o) => {
      const d = orderDefaults(o, problems, today, set);
      const problem = problems.find((p) => p.id === d.conditionId);
      return {
        ...baseOrder(patientId, currentUser.id, o, set.name),
        priority: d.priority,
        expectedAt: d.expectedAt ? new Date(d.expectedAt) : null,
        conditionId: problem?.id ?? null,
        indication: problem?.display ?? null,
      };
    });
  if (data.length) await db.serviceRequest.createMany({ data });
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/inbox");
  const skipped = set.codes.length - data.length;
  if (!data.length) return { error: `Everything in ${set.name} is already ordered or in the basket.` };
  return { added: `${set.name} (${data.length} order${data.length === 1 ? "" : "s"}${skipped ? `, ${skipped} already ordered` : ""})` };
}

// Stars or unstars an order or order set ("SET:<id>") for the signed-in clinician.
export async function toggleOrderFavorite(code: string) {
  const currentUser = await requirePermission("pendOrders");
  const known = code.startsWith("SET:") ? orderSetById.has(code.slice(4)) : !!orderableFor(code);
  if (!known) return;
  const me = await db.practitioner.findUniqueOrThrow({ where: { id: currentUser.id }, select: { orderFavorites: true } });
  const favorites = me.orderFavorites.includes(code) ? me.orderFavorites.filter((c) => c !== code) : [...me.orderFavorites, code];
  await db.practitioner.update({ where: { id: currentUser.id }, data: { orderFavorites: favorites } });
  revalidatePath("/patients/[id]/orders", "page");
}

export async function removePendingOrder(patientId: string, orderId: string) {
  await requirePermission("pendOrders");
  await db.serviceRequest.delete({ where: { id: orderId, patientId, status: "pending" } });
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/inbox");
}

// Inline edits in the order basket. Only the fields sent change.
export async function updatePendingOrder(patientId: string, orderId: string, form: FormData) {
  await requirePermission("pendOrders");
  const priority = str(form, "priority") as OrderPriority;
  const expected = str(form, "expectedAt");
  const link = form.has("conditionId") ? await problemLink(patientId, str(form, "conditionId"), null) : undefined;
  await db.serviceRequest.update({
    where: { id: orderId, patientId, status: "pending" },
    data: {
      priority: PRIORITIES.includes(priority) ? priority : undefined,
      expectedAt: form.has("expectedAt") ? (/^\d{4}-\d{2}-\d{2}$/.test(expected) ? new Date(expected) : null) : undefined,
      ...(link ?? {}),
      instructions: form.has("instructions") ? str(form, "instructions") || null : undefined,
    },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
}

// "Link all to": every order in the basket goes with one problem.
export async function linkPendingOrders(patientId: string, conditionId: string) {
  await requirePermission("pendOrders");
  const link = await problemLink(patientId, conditionId, null);
  if (!link.conditionId) return;
  await db.serviceRequest.updateMany({ where: { patientId, status: "pending" }, data: link });
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
  if (added.length) return `${added.map((p) => p.display).join(", ")} ${added.length === 1 ? "was" : "were"} added to the order basket since this page opened.`;
  if (shown.size !== pending.length) return "Some orders in the basket were removed or signed since this page opened.";
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
          steps: d.steps,
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
          refill: d.refill,
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
  // One text to the patient's phone saying what was signed. A texting problem never undoes the signing.
  try {
    await textSignedOrders(patientId, currentUser.name, pending, currentUser.id);
  } catch (e) {
    console.error("Couldn't queue the patient's text", e);
  }
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
