"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { AllergySeverity, AllergyType } from "@prisma/client";
import { baseDb, db } from "@/lib/db";
import { logEvent } from "@/lib/audit/server";
import { ALLERGY_REMOVAL_REASONS } from "@/components/entered-in-error";
import { requirePermission } from "@/lib/session";
import { planVitalsEdit, VITALS_CHANGE_REASONS, vitalObservations } from "@/lib/vitals";
import { checkIcd10, codeForTitle } from "@/lib/icd10/codes";
import { diagnosisByDisplay } from "@/lib/visits/diagnoses";

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

// Fixing a set of vitals that was typed wrong. A changed number keeps its old value in
// ObservationCorrection and gets a "C" mark; a cleared box marks that one reading entered
// in error. Nothing is erased: the Vitals tab lists every change, who made it and why.
export async function correctVitals(patientId: string, at: string, form: FormData) {
  const user = await requirePermission("recordVitals");
  const when = new Date(at);
  const back = (error: string): never => redirect(`/patients/${patientId}/vitals?edit=${encodeURIComponent(at)}&error=${encodeURIComponent(error)}`);
  if (Number.isNaN(when.getTime())) redirect(`/patients/${patientId}/vitals`);
  const why = str(form, "reason");
  const note = str(form, "note");
  if (!VITALS_CHANGE_REASONS.includes(why)) back("Choose why the vitals are being changed.");
  if (why === "Other" && !note) back("Say briefly what was wrong.");
  const reason = (note ? `${why}: ${note}` : why).slice(0, 500);

  const stored = await db.observation.findMany({ where: { patientId, category: "vital_signs", effectiveAt: when } });
  if (!stored.length) back("These vitals are no longer on the chart.");
  const { dob } = await db.patient.findUniqueOrThrow({ where: { id: patientId }, select: { dob: true } });
  const { data, error } = vitalObservations(form, { patientId, at: when, encounterId: stored[0].encounterId ?? undefined, dob });
  if (error) back(error.replace("Nothing was filed.", "Nothing was changed."));
  const plan = planVitalsEdit(stored, data);
  if (plan.empty) back("Nothing was changed: the numbers are the same as before.");

  const now = new Date();
  await db.$transaction([
    ...plan.change.flatMap(({ from, to }) => [
      db.observationCorrection.create({
        data: { observationId: from.id, valueNum: from.valueNum, unit: from.unit, refLow: from.refLow, refHigh: from.refHigh, flag: from.flag, reason, correctedById: user.id, correctedAt: now },
      }),
      db.observation.update({
        where: { id: from.id },
        data: { valueNum: to.valueNum, unit: to.unit, refLow: to.refLow, refHigh: to.refHigh, flag: to.flag, correctedAt: now },
      }),
    ]),
    ...(plan.remove.length
      ? [db.observation.updateMany({ where: { id: { in: plan.remove.map((r) => r.id) } }, data: { enteredInErrorAt: now, enteredInErrorReason: reason, enteredInErrorById: user.id } })]
      : []),
    ...(plan.add.length ? [db.observation.createMany({ data: plan.add.map((a) => ({ ...a, correctedAt: now })) })] : []),
  ]);
  revalidatePath(`/patients/${patientId}`, "layout");
  redirect(`/patients/${patientId}/vitals?changed=${encodeURIComponent(at)}`);
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

// A problem's ICD-10-CM code: a complete code that, when the name is some code's official
// description, is that code. Blank gets the name's code if it is one, else R69 (illness,
// unspecified). Returns an error key for the Problems tab.
function problemCode(display: string, typed: string): { code: string } | { error: "code" | "mismatch" } {
  const check = typed ? checkIcd10(typed) : null;
  if (check && check.status !== "ok") return { error: "code" };
  const named = diagnosisByDisplay.get(display.toLowerCase())?.code ?? codeForTitle(display);
  if (check && named && named !== check.code) return { error: "mismatch" };
  return { code: check?.code ?? named ?? "R69" };
}

export async function addProblem(patientId: string, form: FormData) {
  await requirePermission("editProblems");
  const display = str(form, "display").slice(0, 200);
  if (!display) return;
  const coded = problemCode(display, str(form, "code"));
  if ("error" in coded) redirect(`/patients/${patientId}/problems?error=${coded.error}`);
  const max = await db.condition.aggregate({ where: { patientId, status: "active" }, _max: { priority: true } });
  const onset = str(form, "onset");
  await db.condition.create({
    data: {
      patientId,
      display,
      code: coded.code,
      status: "active",
      onset: onset ? new Date(onset) : null,
      priority: (max._max.priority ?? 0) + 1,
      comment: str(form, "comment") || null,
    },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
}

// Corrects a problem's name, code or comment. Past visit diagnoses keep what they were billed as.
export async function updateProblem(patientId: string, conditionId: string, form: FormData) {
  await requirePermission("editProblems");
  const display = str(form, "display").slice(0, 200);
  if (!display) return;
  const coded = problemCode(display, str(form, "code"));
  if ("error" in coded) redirect(`/patients/${patientId}/problems?edit=${conditionId}&error=${coded.error}`);
  await db.condition.update({
    where: { id: conditionId, patientId },
    data: { display, code: coded.code, comment: str(form, "comment") || null },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
  redirect(`/patients/${patientId}/problems`);
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

// Links a medication ("med:<id>") or order ("order:<id>") to a problem, or with
// no conditionId, unlinks it. The indication follows the problem's name.
export async function linkToProblem(patientId: string, conditionId: string | null, form: FormData) {
  await requirePermission("editProblems");
  const [kind, id] = str(form, "item").split(":");
  if (!id) return;
  const problem = conditionId ? await db.condition.findFirst({ where: { id: conditionId, patientId, status: "active" } }) : null;
  if (conditionId && !problem) return;
  const data = problem ? { conditionId: problem.id, indication: problem.display } : { conditionId: null };
  if (kind === "med") await db.medicationRequest.update({ where: { id, patientId, status: { in: ["active", "on_hold"] } }, data });
  else if (kind === "order") await db.serviceRequest.update({ where: { id, patientId, status: { in: ["pending", "signed"] } }, data });
  revalidatePath(`/patients/${patientId}`, "layout");
}
