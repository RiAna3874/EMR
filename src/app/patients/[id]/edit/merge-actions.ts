"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/audit/server";
import { fullName } from "@/lib/format";
import { mergeCharts } from "@/lib/registration/merge";

// Folds a duplicate chart into this one. Admins only; the edit page shows what will move first.
export async function mergeDuplicate(keeperId: string, form: FormData) {
  const user = await requireAdmin();
  const duplicateId = String(form.get("duplicateId") ?? "");
  const back = (error: string) => redirect(`/patients/${keeperId}/edit?mergeError=${encodeURIComponent(error)}#merge`);
  if (form.get("confirm") !== "yes") back("Tick the box to confirm both charts are the same person.");
  if (!duplicateId || duplicateId === keeperId) back("Choose a different chart to merge.");

  const moved = await db.$transaction(async (tx) => {
    const [from, into] = await Promise.all([tx.patient.findUnique({ where: { id: duplicateId } }), tx.patient.findUnique({ where: { id: keeperId } })]);
    if (!from || !into || from.mergedIntoId || into.mergedIntoId) return null;
    return { from, into, counts: await mergeCharts(tx, from, into, user.id) };
  });
  if (!moved) back("That chart was already merged or no longer exists.");
  const { from, into, counts } = moved!;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const detail = `Merged chart ${from.mrn} (${fullName(from)}) into ${into.mrn}; ${total} record${total === 1 ? "" : "s"} moved`;
  // Logged on both charts, so either one's history shows the merge.
  await logEvent({ action: "update", subject: "Chart merge", patientId: into.id, recordId: from.id, detail });
  await logEvent({ action: "update", subject: "Chart merge", patientId: from.id, recordId: into.id, detail });
  revalidatePath("/", "layout");
  redirect(`/patients/${keeperId}`);
}
