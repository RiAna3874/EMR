"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { brand } from "@/lib/brand";
import { cantText, queueText } from "@/lib/sms/server";
import { MANUAL_MAX, manualText } from "@/lib/sms/sms";
import { visitPrescriptionText } from "@/lib/sms/prescription";

export type TextState = { sent?: boolean; logged?: boolean; error?: string } | undefined;

const refresh = (patientId: string) => {
  revalidatePath(`/patients/${patientId}/texts`);
  revalidatePath("/admin/texts");
};

// A text typed on the Texts tab, such as "Your report is ready, please collect it."
export async function sendPatientText(patientId: string, _prev: TextState, form: FormData): Promise<TextState> {
  const user = await requirePermission("textPatients");
  const typed = String(form.get("body") ?? "").trim();
  if (!typed) return { error: "Type the message first." };
  if (typed.length > MANUAL_MAX) return { error: `Keep it under ${MANUAL_MAX} characters.` };
  const p = await db.patient.findUnique({ where: { id: patientId }, select: { phone: true, smsOptOutAt: true } });
  const why = p ? cantText(p) : "Patient not found.";
  if (why) return { error: `Not sent. ${why}` };
  const msg = await queueText(patientId, "manual", manualText(typed, brand.shortName), user.id);
  refresh(patientId);
  return { sent: true, logged: msg?.status === "logged" };
}

// Sends a text that failed again, as a new message, to the number now on file.
export async function resendText(patientId: string, messageId: string) {
  const user = await requirePermission("textPatients");
  const old = await db.smsMessage.findFirst({ where: { id: messageId, patientId, status: "failed" } });
  if (!old) return;
  await queueText(patientId, old.kind, old.body, user.id);
  refresh(patientId);
}

// The patient asked not to get texts, or asked to get them again.
export async function setTextsOff(patientId: string, off: boolean) {
  const user = await requirePermission("textPatients");
  await db.patient.update({ where: { id: patientId }, data: off ? { smsOptOutAt: new Date(), smsOptOutById: user.id } : { smsOptOutAt: null, smsOptOutById: null } });
  revalidatePath(`/patients/${patientId}`, "layout");
}

// The visit prescription by text, from the Visit tab. Built again here from what's signed now,
// so the patient gets what the chart says, not what an older page showed.
export async function sendVisitPrescription(patientId: string, encounterId: string, _prev: TextState): Promise<TextState> {
  const user = await requirePermission("textPatients");
  const rx = await visitPrescriptionText(patientId, encounterId);
  if (!rx) return { error: "Visit not found." };
  if (rx.blocked || !rx.text) return { error: `Not sent. ${rx.blocked}` };
  const msg = await queueText(patientId, "prescription", rx.text, user.id);
  refresh(patientId);
  revalidatePath(`/patients/${patientId}/visit`);
  return { sent: true, logged: msg?.status === "logged" };
}
