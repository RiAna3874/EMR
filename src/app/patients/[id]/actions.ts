"use server";

import { revalidatePath } from "next/cache";
import type { AllergySeverity, AllergyType } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { vitalObservations } from "@/lib/vitals";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function recordVitals(patientId: string, form: FormData) {
  await requirePermission("recordVitals");
  const data = vitalObservations(form, { patientId, at: new Date() });
  if (data.length) await db.observation.createMany({ data });
  revalidatePath(`/patients/${patientId}`, "layout");
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

export async function removeAllergy(patientId: string, allergyId: string) {
  await requirePermission("editAllergies");
  await db.allergyIntolerance.delete({ where: { id: allergyId, patientId } });
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

export async function discontinueMed(patientId: string, medId: string) {
  await requirePermission("editMeds");
  await db.medicationRequest.update({ where: { id: medId, patientId }, data: { status: "discontinued", end: new Date() } });
  revalidatePath(`/patients/${patientId}`, "layout");
}

export async function holdMed(patientId: string, medId: string, hold: boolean) {
  await requirePermission("editMeds");
  await db.medicationRequest.update({ where: { id: medId, patientId }, data: { status: hold ? "on_hold" : "active" } });
  revalidatePath(`/patients/${patientId}`, "layout");
}

export async function addMed(patientId: string, form: FormData) {
  const currentUser = await requirePermission("editMeds");
  const drug = str(form, "drug");
  if (!drug) return;
  await db.medicationRequest.create({
    data: {
      patientId,
      drug,
      dose: str(form, "dose"),
      route: str(form, "route") || "oral",
      frequency: str(form, "frequency"),
      indication: str(form, "indication") || null,
      status: "active",
      start: new Date(),
      prescriberId: currentUser.id,
    },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
}
