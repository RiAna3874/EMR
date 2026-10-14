"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { ERROR_REASONS } from "@/components/entered-in-error";
import { canEditSigned } from "@/lib/notes/edits";

// Marking results, outside documents, vital signs and signed notes entered in error. Nothing is deleted:
// the record keeps who marked it, when and why, and src/lib/db.ts hides it from the chart.

function reasonFrom(form: FormData): string | null {
  const reason = String(form.get("reason") ?? "");
  const note = String(form.get("note") ?? "").trim();
  if (!ERROR_REASONS.includes(reason)) return null;
  return note ? `${reason}: ${note}`.slice(0, 500) : reason;
}

const marked = (userId: string, reason: string) => ({ enteredInErrorAt: new Date(), enteredInErrorReason: reason, enteredInErrorById: userId });

// A lab report and all its values. Re-file it on the right patient from the source pages.
export async function markReportInError(patientId: string, reportId: string, form: FormData) {
  const user = await requirePermission("fileImports");
  const reason = reasonFrom(form);
  if (!reason) return;
  await db.$transaction([
    db.diagnosticReport.update({ where: { id: reportId, patientId, enteredInErrorAt: null }, data: marked(user.id, reason) }),
    db.observation.updateMany({ where: { reportId, enteredInErrorAt: null }, data: marked(user.id, reason) }),
  ]);
  revalidatePath("/", "layout");
  redirect(`/patients/${patientId}/results?view=reports`);
}

export async function markDocumentInError(patientId: string, docId: string, form: FormData) {
  const user = await requirePermission("fileImports");
  const reason = reasonFrom(form);
  if (!reason) return;
  await db.clinicalDocument.update({ where: { id: docId, patientId, enteredInErrorAt: null }, data: marked(user.id, reason) });
  revalidatePath("/", "layout");
  redirect(`/patients/${patientId}/documents`);
}

// One set of vital signs: every reading taken at that moment.
export async function markVitalsInError(patientId: string, at: string, form: FormData) {
  const user = await requirePermission("recordVitals");
  const reason = reasonFrom(form);
  const when = new Date(at);
  if (!reason || Number.isNaN(when.getTime())) return;
  await db.observation.updateMany({ where: { patientId, category: "vital_signs", effectiveAt: when, enteredInErrorAt: null }, data: marked(user.id, reason) });
  revalidatePath(`/patients/${patientId}`, "layout");
}

// Deleting a signed note. The same people who may edit it (its author, or the cosigner
// once cosigned) may take it off the chart; pended notes are truly deleted (deleteDraft).
export async function markNoteInError(patientId: string, noteId: string, form: FormData) {
  const user = await requirePermission("writeNotes");
  const reason = reasonFrom(form);
  const note = await db.note.findFirst({ where: { id: noteId, patientId } });
  if (!reason || !note || !canEditSigned(note, user.id)) return;
  await db.note.update({ where: { id: noteId, patientId, enteredInErrorAt: null }, data: marked(user.id, reason) });
  revalidatePath("/", "layout");
  redirect(`/patients/${patientId}/notes`);
}
