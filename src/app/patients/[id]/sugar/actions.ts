"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { toLocalDate } from "@/lib/format";
import { isSugarDay, SUGAR_NOTE_MAX } from "@/lib/labs/sugar-days";

// Saves the note for one day on the Blood sugar tab; an empty note removes it.
export async function saveSugarNote(patientId: string, day: string, text: string): Promise<{ error: string } | void> {
  const user = await requirePermission("recordVitals");
  if (!isSugarDay(day)) return { error: "Pick a date for the note." };
  if (day > toLocalDate(new Date())) return { error: "The date can't be in the future." };
  const clean = text.trim();
  if (clean.length > SUGAR_NOTE_MAX) return { error: `Keep the note under ${SUGAR_NOTE_MAX} characters.` };
  const patient = await db.patient.findFirst({ where: { id: patientId, mergedIntoId: null }, select: { id: true } });
  if (!patient) return { error: "This chart is no longer open." };
  if (!clean) await db.bloodSugarNote.deleteMany({ where: { patientId, day } });
  else
    await db.bloodSugarNote.upsert({
      where: { patientId_day: { patientId, day } },
      create: { patientId, day, text: clean, updatedById: user.id },
      update: { text: clean, updatedById: user.id },
    });
  revalidatePath(`/patients/${patientId}/sugar`);
  revalidatePath(`/m/patients/${patientId}/sugar`);
}
