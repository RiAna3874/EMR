"use server";

import { revalidatePath } from "next/cache";
import type { OrderPriority, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { ORDER_SETS, orderableByCode, type Orderable } from "@/lib/orders/catalog";
import { orderWarnings } from "@/lib/orders/checks";
import { orderContext } from "@/lib/orders/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const PRIORITIES: OrderPriority[] = ["routine", "urgent", "stat"];

function baseOrder(patientId: string, o: Orderable, orderSet?: string) {
  return {
    patientId,
    type: o.type,
    code: o.code,
    display: o.display,
    status: "pending" as const,
    orderedById: currentUser.id,
    orderSet: orderSet ?? null,
    details: o.med ? ({ dose: o.med.dose, route: o.med.route, frequency: o.med.frequency, quantity: o.med.quantity, refills: o.med.refills } as Prisma.InputJsonValue) : undefined,
  };
}

export async function addOrder(patientId: string, form: FormData) {
  const o = orderableByCode.get(str(form, "code"));
  if (!o) return;
  const priority = str(form, "priority") as OrderPriority;
  const expected = str(form, "expectedAt");
  const details = o.med
    ? {
        dose: str(form, "dose") || o.med.dose,
        route: str(form, "route") || o.med.route,
        frequency: str(form, "frequency") || o.med.frequency,
        quantity: str(form, "quantity") || o.med.quantity,
        refills: Math.max(0, Math.min(11, Number(str(form, "refills")) || 0)),
      }
    : undefined;
  await db.serviceRequest.create({
    data: {
      ...baseOrder(patientId, o),
      priority: PRIORITIES.includes(priority) ? priority : "routine",
      indication: str(form, "indication") || null,
      instructions: str(form, "instructions") || null,
      expectedAt: expected ? new Date(expected) : null,
      details: details as Prisma.InputJsonValue | undefined,
    },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/inbox");
}

// Adds every order in the set that isn't already pending or active.
export async function addOrderSet(patientId: string, setId: string) {
  const set = ORDER_SETS.find((s) => s.id === setId);
  if (!set) return;
  const open = await db.serviceRequest.findMany({ where: { patientId, status: { in: ["pending", "signed"] } }, select: { code: true } });
  const skip = new Set(open.map((o) => o.code));
  const data = set.codes
    .filter((c) => !skip.has(c))
    .map((c) => orderableByCode.get(c))
    .filter((o): o is Orderable => !!o)
    .map((o) => baseOrder(patientId, o, set.name));
  if (data.length) await db.serviceRequest.createMany({ data });
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/inbox");
}

export async function removePendingOrder(patientId: string, orderId: string) {
  await db.serviceRequest.delete({ where: { id: orderId, patientId, status: "pending" } });
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/inbox");
}

export async function updatePendingOrder(patientId: string, orderId: string, form: FormData) {
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

// Signs every pending order. Orders with a hard-stop warning need an override reason.
export async function signOrders(patientId: string, form: FormData): Promise<{ error: string } | void> {
  const pending = await db.serviceRequest.findMany({ where: { patientId, status: "pending" }, orderBy: { createdAt: "asc" } });
  if (!pending.length) return;
  const ctx = await orderContext(patientId);
  ctx.openOrders = ctx.openOrders.filter((o) => o.status !== "pending");
  const stops = pending.filter((p) => {
    const def = orderableByCode.get(p.code);
    return def && orderWarnings(def, ctx).some((w) => w.level === "stop");
  });
  const reason = str(form, "overrideReason");
  if (stops.length && !reason) return { error: `Give an override reason to sign ${stops.map((s) => s.display).join(", ")}.` };

  const now = new Date();
  await db.$transaction(async (tx) => {
    for (const p of pending) {
      let medicationId: string | null = null;
      if (p.type === "medication") {
        const d = (p.details ?? {}) as { dose?: string; route?: string; frequency?: string };
        const med = await tx.medicationRequest.create({
          data: {
            patientId,
            drug: p.display,
            rxnorm: p.code.replace(/^RX:/, ""),
            dose: d.dose ?? "",
            route: d.route ?? "oral",
            frequency: d.frequency ?? "",
            indication: p.indication,
            status: "active",
            start: now,
            prescriberId: currentUser.id,
          },
        });
        medicationId = med.id;
      }
      const overridden = stops.some((s) => s.id === p.id);
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
  await db.serviceRequest.update({ where: { id: orderId, patientId, status: "signed" }, data: { status: "discontinued", discontinuedAt: new Date() } });
  revalidatePath(`/patients/${patientId}`, "layout");
}

// Imaging, referrals and procedures have no result feed; the clinician marks them done.
export async function completeOrder(patientId: string, orderId: string) {
  await db.serviceRequest.update({
    where: { id: orderId, patientId, status: "signed", type: { in: ["imaging", "referral", "procedure"] } },
    data: { status: "completed", completedAt: new Date() },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
}
