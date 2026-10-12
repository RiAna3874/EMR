"use server";

import { revalidatePath } from "next/cache";
import type { AllergySeverity, AllergyType, Flag } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const s = str(f, k);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function flagFor(value: number, low?: number, high?: number): Flag | null {
  if (low === undefined || high === undefined) return null;
  return value < low ? "L" : value > high ? "H" : "N";
}

export async function recordVitals(patientId: string, form: FormData) {
  await requirePermission("recordVitals");
  const at = new Date();
  const weight = num(form, "weight");
  const height = num(form, "height");
  const entries: { code: string; display: string; value: number | null; unit: string; low?: number; high?: number }[] = [
    { code: "8480-6", display: "Systolic BP", value: num(form, "sbp"), unit: "mm[Hg]", low: 90, high: 129 },
    { code: "8462-4", display: "Diastolic BP", value: num(form, "dbp"), unit: "mm[Hg]", low: 60, high: 79 },
    { code: "8867-4", display: "Heart rate", value: num(form, "hr"), unit: "/min", low: 60, high: 100 },
    { code: "9279-1", display: "Respiratory rate", value: num(form, "rr"), unit: "/min", low: 12, high: 20 },
    { code: "8310-5", display: "Temperature", value: num(form, "temp"), unit: "Cel", low: 36.1, high: 37.8 },
    { code: "59408-5", display: "SpO2", value: num(form, "spo2"), unit: "%", low: 95, high: 100 },
    { code: "29463-7", display: "Weight", value: weight, unit: "kg" },
    { code: "8302-2", display: "Height", value: height, unit: "cm" },
    {
      code: "39156-5",
      display: "BMI",
      value: weight && height ? Math.round((weight / (height / 100) ** 2) * 10) / 10 : null,
      unit: "kg/m2",
      low: 18.5,
      high: 24.9,
    },
    { code: "72514-3", display: "Pain score", value: num(form, "pain"), unit: "{score}" },
  ];
  const data = entries
    .map((e, sortOrder) => ({ ...e, sortOrder }))
    .filter((e) => e.value !== null)
    .map((e) => ({
      patientId,
      category: "vital_signs" as const,
      code: e.code,
      display: e.display,
      valueNum: e.value,
      unit: e.unit,
      refLow: e.low ?? null,
      refHigh: e.high ?? null,
      flag: flagFor(e.value!, e.low, e.high),
      effectiveAt: at,
      sortOrder: e.sortOrder,
    }));
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
