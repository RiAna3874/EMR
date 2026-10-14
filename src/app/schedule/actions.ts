"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission, requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { vitalObservations } from "@/lib/vitals";
import { advance, isOpen, startOfDay } from "@/lib/scheduling/server";
import { ACTIVE_STATUSES, PAYMENT_METHODS, type WorkflowAction } from "@/lib/scheduling/workflow";
import { CANCEL_REASONS, ROOMS, isVisitType, visitType } from "@/lib/scheduling/visit-types";
import { DEFAULT_LANGUAGE, formatPhone } from "@/lib/registration/registration";
import { fmtDateTime, fmtTime } from "@/lib/format";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function refresh(patientId?: string) {
  revalidatePath("/", "layout");
  if (patientId) revalidatePath(`/patients/${patientId}`, "layout");
}

export type BookState = { error?: string; overbook?: boolean } | undefined;

// Books an appointment, or moves one (rescheduleId): the old one is cancelled
// with reason "Rescheduled" and points at the new one.
export async function bookAppointment(_prev: BookState, form: FormData): Promise<BookState> {
  const user = await requirePermission("bookAppointments");
  const patientId = str(form, "patientId");
  const providerId = str(form, "providerId");
  const typeId = str(form, "visitType");
  const start = new Date(str(form, "start"));
  const rescheduleId = str(form, "rescheduleId") || null;
  if (!patientId || !providerId || !isVisitType(typeId) || Number.isNaN(start.getTime())) return { error: "Choose a patient, provider, visit type and time." };
  if (start < startOfDay(new Date())) return { error: "That day has passed. Pick a time from today on." };
  const vt = visitType(typeId);
  // The visit type sets the usual length; the booker can change it.
  const typed = Math.round(Number(str(form, "minutes")));
  const minutes = Number.isFinite(typed) && typed >= 5 && typed <= 480 ? typed : vt.minutes;
  const end = new Date(start.getTime() + minutes * 60_000);

  const [patient, provider, old] = await Promise.all([
    db.patient.findUnique({ where: { id: patientId } }),
    db.practitioner.findUnique({ where: { id: providerId } }),
    rescheduleId ? db.encounter.findUnique({ where: { id: rescheduleId } }) : null,
  ]);
  if (!patient || !provider) return { error: "That patient or provider no longer exists." };
  if (rescheduleId && (!old || old.status !== "planned" || old.patientId !== patientId)) return { error: "Only a scheduled appointment can be rescheduled." };

  // The same patient can't be in two places at once.
  const clash = await db.encounter.findFirst({
    where: { patientId, status: { in: ACTIVE_STATUSES }, start: { lt: end }, end: { gt: start }, id: rescheduleId ? { not: rescheduleId } : undefined },
  });
  if (clash) return { error: `${patient.firstName} already has an appointment at ${fmtTime(clash.start)} that day.` };
  if (!(await isOpen(providerId, start, end, rescheduleId ?? undefined)) && form.get("overbook") !== "on") {
    return { error: "That time isn't open on the provider's schedule. Tick Overbook to book it anyway.", overbook: true };
  }

  const reason = str(form, "reason") || old?.reason || vt.label;
  const created = await db.$transaction(async (tx) => {
    const appt = await tx.encounter.create({
      data: {
        patientId, providerId, start, end, visitType: vt.id, type: vt.type, status: "planned", statusAt: new Date(),
        reason, bookingNote: str(form, "note") || null,
      },
    });
    const overbooked = form.get("overbook") === "on" ? "Overbook" : undefined;
    await tx.encounterEvent.create({ data: { encounterId: appt.id, action: "booked", byId: user.id, detail: overbooked } });
    if (old) {
      await tx.encounter.update({ where: { id: old.id }, data: { status: "cancelled", statusAt: new Date(), cancelReason: "Rescheduled", rescheduledToId: appt.id } });
      await tx.encounterEvent.create({
        data: { encounterId: old.id, action: "rescheduled", byId: user.id, detail: `Moved to ${fmtDateTime(start)}` },
      });
    }
    return appt;
  });
  refresh(patientId);
  redirect(`/appointments/${created.id}?booked=${old ? "moved" : "1"}`);
}

export async function cancelAppointment(encounterId: string, form: FormData) {
  const user = await requirePermission("bookAppointments");
  const reason = CANCEL_REASONS.includes(str(form, "reason")) ? str(form, "reason") : "Other";
  const comment = str(form, "comment");
  const detail = comment ? `${reason}: ${comment}` : reason;
  const enc = await db.encounter.findUnique({ where: { id: encounterId }, select: { patientId: true } });
  await advance(encounterId, "cancel", user, { data: { cancelReason: detail }, detail });
  refresh(enc?.patientId);
}

const QUICK_ACTIONS: WorkflowAction[] = ["undoArrival", "start", "checkOut", "noShow", "undoNoShow"];

// One-click steps from My Day, the schedule and the appointment page.
// Closing a visit ("complete") isn't one of them: it goes through the visit screen's checks.
export async function quickAction(encounterId: string, action: Extract<WorkflowAction, "undoArrival" | "start" | "checkOut" | "noShow" | "undoNoShow">) {
  const user = await requireUser();
  if (!QUICK_ACTIONS.includes(action)) throw new Error("Not a one-click step.");
  const enc = await db.encounter.findUnique({ where: { id: encounterId }, select: { patientId: true } });
  const ok = await advance(encounterId, action, user);
  refresh(enc?.patientId);
  // Starting a visit opens the chart.
  if (ok && action === "start" && enc) redirect(`/patients/${enc.patientId}`);
}

// Front desk check-in: confirm demographics and coverage, record any visit fee paid, mark arrived.
export async function checkInPatient(encounterId: string, form: FormData) {
  const user = await requirePermission("checkIn");
  const enc = await db.encounter.findUniqueOrThrow({ where: { id: encounterId } });
  const taka = Number(str(form, "copay") || "0");
  const paid = Number.isFinite(taka) && taka > 0 ? Math.round(taka * 100) : null;
  const method = PAYMENT_METHODS.some((m) => m.id === str(form, "copayMethod")) ? str(form, "copayMethod") : null;
  if (paid && (!method || method === "waived")) redirect(`/appointments/${encounterId}/check-in?error=payment`);
  await db.$transaction(async (tx) => {
    const ok = await advance(encounterId, "arrive", user, {
      tx,
      data: { copayCents: paid, copayMethod: paid || method === "waived" ? method : null },
    });
    if (!ok) return;
    await tx.patient.update({
      where: { id: enc.patientId },
      data: {
        // Normalised when it's a Bangladeshi number; kept as typed otherwise, so check-in isn't held up.
        phone: formatPhone(str(form, "phone")) ?? (str(form, "phone") || null),
        address: str(form, "address") || null,
        preferredLanguage: str(form, "language") || DEFAULT_LANGUAGE,
        insurancePayer: str(form, "insurancePayer") || null,
        insuranceMemberId: str(form, "insuranceMemberId") || null,
      },
    });
  });
  refresh(enc.patientId);
  redirect(str(form, "next") || "/");
}

// Rooming: room, chief complaint, vitals, allergy and medication review.
export async function roomPatient(encounterId: string, form: FormData) {
  const user = await requirePermission("roomPatients");
  const enc = await db.encounter.findUniqueOrThrow({ where: { id: encounterId } });
  const room = ROOMS.includes(str(form, "room")) ? str(form, "room") : null;
  if (enc.type === "office" && !room) redirect(`/appointments/${encounterId}/room?error=room`);
  const now = new Date();
  const { dob } = await db.patient.findUniqueOrThrow({ where: { id: enc.patientId }, select: { dob: true } });
  const vitals = can(user.role, "recordVitals") ? vitalObservations(form, { patientId: enc.patientId, at: now, encounterId, dob }) : { data: [], error: null };
  if (vitals.error) redirect(`/appointments/${encounterId}/room?error=vitals&detail=${encodeURIComponent(vitals.error)}`);
  await db.$transaction(async (tx) => {
    const ok = await advance(encounterId, "room", user, {
      tx,
      detail: room ?? undefined,
      data: {
        room,
        chiefComplaint: str(form, "chiefComplaint") || null,
        allergiesReviewedAt: form.get("allergiesReviewed") === "on" ? now : null,
        medsReviewedAt: form.get("medsReviewed") === "on" ? now : null,
      },
    });
    if (!ok) return;
    // Reviewing medications while rooming counts as the chart's medication review.
    if (form.get("medsReviewed") === "on" && can(user.role, "reviewMeds")) {
      await tx.patient.update({ where: { id: enc.patientId }, data: { medsReviewedAt: now, medsReviewedById: user.id } });
    }
    if (vitals.data.length) await tx.observation.createMany({ data: vitals.data });
  });
  refresh(enc.patientId);
  redirect(str(form, "next") || "/");
}

// Provider templates: weekly sessions and blocked time.
const toMin = (hhmm: string) => {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  return m ? +m[1] * 60 + +m[2] : null;
};

export async function addSession(form: FormData) {
  await requirePermission("editSchedules");
  const practitionerId = str(form, "practitionerId");
  const startMin = toMin(str(form, "start"));
  const endMin = toMin(str(form, "end"));
  const slotMinutes = Number(str(form, "slotMinutes")) || 20;
  const weekdays = form.getAll("weekday").map(Number).filter((d) => d >= 0 && d <= 6);
  if (!practitionerId || startMin === null || endMin === null || endMin <= startMin || !weekdays.length) return;
  await db.scheduleSession.createMany({ data: weekdays.map((weekday) => ({ practitionerId, weekday, startMin, endMin, slotMinutes })) });
  revalidatePath("/schedule", "layout");
}

export async function deleteSession(id: string) {
  await requirePermission("editSchedules");
  await db.scheduleSession.delete({ where: { id } });
  revalidatePath("/schedule", "layout");
}

export async function addBlock(form: FormData) {
  await requirePermission("editSchedules");
  const practitionerId = str(form, "practitionerId");
  const date = str(form, "date");
  const endDate = str(form, "endDate") || date;
  const start = new Date(`${date}T${str(form, "start") || "00:00"}`);
  const end = new Date(`${endDate}T${str(form, "end") || "23:59"}`);
  if (!practitionerId || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return;
  await db.scheduleBlock.create({ data: { practitionerId, start, end, reason: str(form, "reason") || "Unavailable" } });
  revalidatePath("/schedule", "layout");
}

export async function deleteBlock(id: string) {
  await requirePermission("editSchedules");
  await db.scheduleBlock.delete({ where: { id } });
  revalidatePath("/schedule", "layout");
}
