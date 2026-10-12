"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { NoteType } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { noteTypes, templateById } from "@/lib/notes/library";
import { signBlocker } from "@/lib/notes/smarttext";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const notesPath = (patientId: string, query = "") => `/patients/${patientId}/notes${query ? `?${query}` : ""}`;

// Pend (save unsigned) or sign. A note with a cosigner goes to pending_cosign on
// signing. Signing is refused while blanks or pick lists remain; the work is
// pended instead so nothing typed is lost.
export async function saveNote(patientId: string, noteId: string | null, form: FormData) {
  const wantsSign = form.get("intent") === "sign";
  const body = String(form.get("body") ?? "");
  const blocker = wantsSign ? signBlocker(body) : null;
  const sign = wantsSign && !blocker;
  const typeInput = str(form, "type");
  const type = (noteTypes.some((t) => t.id === typeInput) ? typeInput : "progress") as NoteType;
  const encounterId = str(form, "encounterId") || null;
  const cosignerInput = str(form, "cosignerId");
  const cosignerId = cosignerInput && cosignerInput !== currentUser.id ? cosignerInput : null;
  const encounter = encounterId ? await db.encounter.findFirst({ where: { id: encounterId, patientId } }) : null;
  const templateId = str(form, "templateId");

  const data = {
    title: str(form, "title") || templateById(templateId)?.title || "Progress note",
    type,
    body,
    encounterId: encounter?.id ?? null,
    cosignerId,
    status: sign ? (cosignerId ? ("pending_cosign" as const) : ("signed" as const)) : ("draft" as const),
    signedAt: sign ? new Date() : null,
    ...(encounter ? { serviceAt: encounter.start } : {}),
  };

  let id = noteId;
  if (id) {
    // Only the author's own pended notes can be edited; signed notes are locked.
    await db.note.update({ where: { id, patientId, status: "draft", authorId: currentUser.id }, data });
  } else {
    id = (await db.note.create({ data: { ...data, templateId: templateId || null, patientId, authorId: currentUser.id } })).id;
  }
  revalidatePath(`/patients/${patientId}`, "layout");
  redirect(notesPath(patientId, `note=${id}${blocker ? `&error=${encodeURIComponent(blocker)}` : ""}`));
}

export async function deleteDraft(patientId: string, noteId: string) {
  await db.note.delete({ where: { id: noteId, patientId, status: "draft", authorId: currentUser.id } });
  revalidatePath(`/patients/${patientId}`, "layout");
  redirect(notesPath(patientId));
}

// Anyone can addend a signed note; the original text never changes.
export async function addAddendum(patientId: string, noteId: string, form: FormData) {
  const body = String(form.get("body") ?? "");
  const blocker = signBlocker(body);
  if (blocker) redirect(notesPath(patientId, `note=${noteId}&addend=1&error=${encodeURIComponent(blocker)}`));
  const note = await db.note.findFirstOrThrow({ where: { id: noteId, patientId, status: { not: "draft" } } });
  await db.$transaction([
    db.noteAddendum.create({ data: { noteId, body: body.trim(), authorId: currentUser.id } }),
    db.note.update({ where: { id: noteId }, data: { status: note.status === "signed" ? "addended" : note.status } }),
  ]);
  revalidatePath(`/patients/${patientId}`, "layout");
  redirect(notesPath(patientId, `note=${noteId}`));
}

// The supervising clinician's signature, with an optional attestation.
export async function cosignNote(patientId: string, noteId: string, next: string | null, form: FormData) {
  const text = String(form.get("body") ?? "").trim();
  if (text) {
    const blocker = signBlocker(text);
    if (blocker) redirect(notesPath(patientId, `note=${noteId}&cosign=1&error=${encodeURIComponent(blocker)}`));
  }
  const note = await db.note.findFirstOrThrow({
    where: { id: noteId, patientId, status: "pending_cosign", cosignerId: currentUser.id },
    include: { _count: { select: { addenda: true } } },
  });
  await db.note.update({
    where: { id: note.id },
    data: { status: note._count.addenda ? "addended" : "signed", cosignedAt: new Date(), cosignText: text || null },
  });
  revalidatePath("/", "layout");
  redirect(next ?? notesPath(patientId, `note=${noteId}`));
}
