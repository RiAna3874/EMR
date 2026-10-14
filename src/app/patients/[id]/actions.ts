"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AllergySeverity, AllergyType } from "@prisma/client";
import { baseDb, db } from "@/lib/db";
import { logEvent } from "@/lib/audit/server";
import { ALLERGY_REMOVAL_REASONS } from "@/components/entered-in-error";
import { requirePermission } from "@/lib/session";
import { vitalObservations } from "@/lib/vitals";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function recordVitals(patientId: string, form: FormData) {
  await requirePermission("recordVitals");
  const { dob } = await db.patient.findUniqueOrThrow({ where: { id: patientId }, select: { dob: true } });
  const { data, error } = vitalObservations(form, { patientId, at: new Date(), dob });
  if (error) redirect(`/patients/${patientId}/vitals?error=${encodeURIComponent(error)}`);
  if (data.length) await db.observation.createMany({ data });
  revalidatePath(`/patients/${patientId}`, "layout");
  redirect(`/patients/${patientId}/vitals`);
}

export async function addAllergy(patientId: string, form: FormData) {
  await requirePermission("editAllergies");
  const substance = str(form, "substance");
  if (!substance) return;
  await db.$transaction([
    db.allergyIntolerance.create({
      data: {
        patientId,
        substance,
        reaction: str(form, "reaction") || null,
        type: (str(form, "type") || "drug") as AllergyType,
        severity: (str(form, "severity") || "moderate") as AllergySeverity,
        verified: form.get("verified") === "on",
      },
    }),
    db.patient.update({ where: { id: patientId }, data: { allergyStatus: "has_allergies" } }),
  ]);
  revalidatePath(`/patients/${patientId}`, "layout");
}

// Removing an allergy needs a reason. The access log keeps what was removed and why,
// since the allergy itself is gone from the chart.
export async function removeAllergy(patientId: string, allergyId: string, form: FormData) {
  await requirePermission("editAllergies");
  const reason = str(form, "reason");
  if (!ALLERGY_REMOVAL_REASONS.includes(reason)) return;
  const a = await baseDb.allergyIntolerance.delete({ where: { id: allergyId, patientId } });
  await logEvent({
    action: "delete",
    subject: "Allergy",
    patientId,
    recordId: a.id,
    detail: `${a.substance}${a.reaction ? ` (${a.reaction})` : ""}, ${a.severity}. Reason: ${reason}`,
  });
  const remaining = await db.allergyIntolerance.count({ where: { patientId } });
  if (remaining === 0) await db.patient.update({ where: { id: patientId }, data: { allergyStatus: "not_reviewed" } });
  revalidatePath(`/patients/${patientId}`, "layout");
}

export async function markNoKnownAllergies(patientId: string) {
  await requirePermission("editAllergies");
  const count = await db.allergyIntolerance.count({ where: { patientId } });
  if (count > 0) return;
  await db.patient.update({ where: { id: patientId }, data: { allergyStatus: "no_known_allergies" } });
  revalidatePath(`/patients/${patientId}`, "layout");
}

export async function addProblem(patientId: string, form: FormData) {
  await requirePermission("editProblems");
  const display = str(form, "display");
  if (!display) return;
  const max = await db.condition.aggregate({ where: { patientId, status: "active" }, _max: { priority: true } });
  const onset = str(form, "onset");
  await db.condition.create({
    data: {
      patientId,
      display,
      code: str(form, "code").toUpperCase() || "R69",
      status: "active",
      onset: onset ? new Date(onset) : null,
      priority: (max._max.priority ?? 0) + 1,
      comment: str(form, "comment") || null,
    },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
}

export async function resolveProblem(patientId: string, conditionId: string) {
  await requirePermission("editProblems");
  await db.condition.update({
    where: { id: conditionId, patientId },
    data: { status: "resolved", resolvedAt: new Date() },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
}

export async function reactivateProblem(patientId: string, conditionId: string) {
  await requirePermission("editProblems");
  await db.condition.update({ where: { id: conditionId, patientId }, data: { status: "active", resolvedAt: null } });
  revalidatePath(`/patients/${patientId}`, "layout");
}
