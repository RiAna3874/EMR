"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Flag } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { COSIGNER_REQUIRED, needsCosign } from "@/lib/roles";
import { resultsWhere } from "@/lib/inbox";
import { signBlocker } from "@/lib/notes/smarttext";

export async function acknowledgeResult(reportId: string, next: string, form: FormData) {
  const currentUser = await requirePermission("reviewResults");
  const comment = String(form.get("comment") ?? "").trim();
  await db.diagnosticReport.update({
    where: { id: reportId, reviewedAt: null },
    data: { reviewedAt: new Date(), reviewedById: currentUser.id, reviewComment: comment || null },
  });
  revalidatePath("/", "layout");
  redirect(next);
}

// Clears every normal result in the Inbox in one go; abnormal ones still need a look each.
export async function acknowledgeAllNormal() {
  const currentUser = await requirePermission("reviewResults");
  const where = { ...resultsWhere(currentUser.id), observations: { none: { flag: { in: ["L", "H", "LL", "HH", "A"] as Flag[] } } } };
  const ids = (await db.diagnosticReport.findMany({ where, select: { id: true } })).map((r) => r.id);
  if (ids.length) {
    await db.diagnosticReport.updateMany({ where: { id: { in: ids }, reviewedAt: null }, data: { reviewedAt: new Date(), reviewedById: currentUser.id } });
  }
  revalidatePath("/", "layout");
  redirect("/inbox?folder=normal");
}

// Signing from the Inbox follows the chart's rules: blanks and pick lists must
// be finished first (the chart editor opens on them), and a routed note goes to its cosigner.
export async function signDraftNote(noteId: string, next: string) {
  const currentUser = await requirePermission("writeNotes");
  const note = await db.note.findFirstOrThrow({ where: { id: noteId, status: "draft", authorId: currentUser.id } });
  const blocker = signBlocker(note.body) ?? (needsCosign(currentUser.role) && !note.cosignerId ? COSIGNER_REQUIRED : null);
  if (blocker) redirect(`/patients/${note.patientId}/notes?note=${note.id}&error=${encodeURIComponent(blocker)}`);
  await db.note.update({
    where: { id: note.id },
    data: { status: note.cosignerId ? "pending_cosign" : "signed", signedAt: new Date() },
  });
  revalidatePath("/", "layout");
  redirect(next);
}

export async function cosignFromInbox(noteId: string, next: string) {
  const currentUser = await requirePermission("cosignNotes");
  const note = await db.note.findFirstOrThrow({
    where: { id: noteId, status: "pending_cosign", cosignerId: currentUser.id },
    include: { _count: { select: { addenda: true } } },
  });
  await db.note.update({ where: { id: note.id }, data: { status: note._count.addenda ? "addended" : "signed", cosignedAt: new Date() } });
  revalidatePath("/", "layout");
  redirect(next);
}
