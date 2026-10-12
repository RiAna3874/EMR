"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Flag } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { resultsWhere } from "@/lib/inbox";

export async function acknowledgeResult(reportId: string, next: string, form: FormData) {
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
  const where = { ...resultsWhere(currentUser.id), observations: { none: { flag: { in: ["L", "H", "LL", "HH", "A"] as Flag[] } } } };
  const ids = (await db.diagnosticReport.findMany({ where, select: { id: true } })).map((r) => r.id);
  if (ids.length) {
    await db.diagnosticReport.updateMany({ where: { id: { in: ids }, reviewedAt: null }, data: { reviewedAt: new Date(), reviewedById: currentUser.id } });
  }
  revalidatePath("/", "layout");
  redirect("/inbox?folder=normal");
}

export async function signDraftNote(noteId: string, next: string) {
  await db.note.update({ where: { id: noteId, status: "draft", authorId: currentUser.id }, data: { status: "signed", signedAt: new Date() } });
  revalidatePath("/", "layout");
  redirect(next);
}
