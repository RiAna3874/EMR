"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { advance, startOfDay } from "@/lib/scheduling/server";
import { closeBlockers, OPEN_STATUSES } from "@/lib/visits/close";
import { visitDetails } from "@/lib/visits/server";
import { diagnosisByDisplay, ICD10 } from "@/lib/visits/diagnoses";
import { followUpDateFor, followUpOption, toDbDate } from "@/lib/visits/follow-up";
import { parseLocalDate } from "@/lib/format";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

const visitUrl = (patientId: string, encounterId: string, extra = "") => `/patients/${patientId}/visit?e=${encounterId}${extra}`;

function refresh(patientId: string) {
  revalidatePath(`/patients/${patientId}`, "layout");
  revalidatePath("/");
}

// A visit the provider may still document: anything but a cancellation or no-show.
async function editableVisit(patientId: string, encounterId: string) {
  const visit = await db.encounter.findFirst({ where: { id: encounterId, patientId } });
  if (!visit || visit.status === "cancelled" || visit.status === "no_show") throw new Error("This visit can't be changed.");
  return visit;
}

// A diagnosis from one of the patient's problems, from the common list, or typed.
// "Add to problem list" also starts a problem for a new one.
export async function addDiagnosis(patientId: string, encounterId: string, form: FormData) {
  const user = await requirePermission("seePatients");
  await editableVisit(patientId, encounterId);
  const problem = str(form, "conditionId")
    ? await db.condition.findFirst({ where: { id: str(form, "conditionId"), patientId, status: "active" } })
    : null;
  const typed = str(form, "display").slice(0, 200);
  const listed = diagnosisByDisplay.get(typed.toLowerCase());
  const display = problem?.display ?? listed?.value ?? typed;
  if (!display) return;
  const typedCode = str(form, "code").toUpperCase();
  const code = problem?.code ?? listed?.code ?? (ICD10.test(typedCode) ? typedCode : null);
  if (!problem && typedCode && !code) redirect(visitUrl(patientId, encounterId, "&error=code"));

  await db.$transaction(async (tx) => {
    const existing = await tx.encounterDiagnosis.findMany({ where: { encounterId }, select: { display: true, rank: true } });
    if (existing.some((d) => d.display.toLowerCase() === display.toLowerCase())) return;
    let conditionId = problem?.id ?? null;
    if (!conditionId && form.get("addToProblems")) {
      const max = await tx.condition.aggregate({ where: { patientId, status: "active" }, _max: { priority: true } });
      const created = await tx.condition.create({
        data: { patientId, display, code: code ?? "R69", status: "active", onset: new Date(), priority: (max._max.priority ?? 0) + 1 },
      });
      conditionId = created.id;
    }
    await tx.encounterDiagnosis.create({
      data: { encounterId, patientId, display, code, conditionId, rank: Math.max(0, ...existing.map((d) => d.rank)) + 1, addedById: user.id },
    });
  });
  refresh(patientId);
}

export async function removeDiagnosis(patientId: string, diagnosisId: string) {
  await requirePermission("seePatients");
  const dx = await db.encounterDiagnosis.findFirst({ where: { id: diagnosisId, patientId } });
  if (!dx) return;
  await editableVisit(patientId, dx.encounterId);
  await db.encounterDiagnosis.delete({ where: { id: dx.id } });
  refresh(patientId);
}

// Moves a diagnosis to the top: the primary diagnosis.
export async function makePrimary(patientId: string, diagnosisId: string) {
  await requirePermission("seePatients");
  const dx = await db.encounterDiagnosis.findFirst({ where: { id: diagnosisId, patientId } });
  if (!dx) return;
  await editableVisit(patientId, dx.encounterId);
  const all = await db.encounterDiagnosis.findMany({ where: { encounterId: dx.encounterId }, orderBy: { rank: "asc" } });
  const order = [dx, ...all.filter((d) => d.id !== dx.id)];
  await db.$transaction(order.map((d, i) => db.encounterDiagnosis.update({ where: { id: d.id }, data: { rank: i + 1 } })));
  refresh(patientId);
}

export async function saveVisitText(patientId: string, encounterId: string, form: FormData) {
  await requirePermission("seePatients");
  await editableVisit(patientId, encounterId);
  const data: { chiefComplaint?: string | null; advice?: string | null } = {};
  if (form.has("chiefComplaint")) data.chiefComplaint = str(form, "chiefComplaint").slice(0, 300) || null;
  if (form.has("advice")) {
    data.advice =
      str(form, "advice")
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n")
        .slice(0, 4000) || null;
  }
  await db.encounter.update({ where: { id: encounterId }, data });
  refresh(patientId);
}

// When to come back: an interval counted from the visit day, a date, or as needed.
export async function saveFollowUp(patientId: string, encounterId: string, form: FormData) {
  await requirePermission("seePatients");
  const visit = await editableVisit(patientId, encounterId);
  const choice = str(form, "followUp");
  let followUpInterval: string | null = null;
  let followUpDate: Date | null = null;
  if (choice === "date") {
    const d = parseLocalDate(str(form, "followUpDate"));
    if (!str(form, "followUpDate") || d.getTime() < startOfDay(visit.start).getTime()) redirect(visitUrl(patientId, encounterId, "&error=followup"));
    followUpInterval = "date";
    followUpDate = toDbDate(d);
  } else if (followUpOption(choice)) {
    followUpInterval = choice;
    const due = followUpDateFor(choice, visit.start);
    followUpDate = due && toDbDate(due);
  }
  await db.encounter.update({
    where: { id: encounterId },
    data: { followUpInterval, followUpDate, followUpNote: followUpInterval ? str(form, "followUpNote").slice(0, 200) || null : null },
  });
  refresh(patientId);
}

// Sign and close: the provider part of the visit is done. Needs a diagnosis and a
// signed note (src/lib/visits/close.ts); a visit not yet started is started first.
export async function closeVisit(patientId: string, encounterId: string) {
  const user = await requirePermission("seePatients");
  const visit = await db.encounter.findFirst({ where: { id: encounterId, patientId } });
  if (!visit) return;
  const details = await visitDetails(visit);
  const blockers = closeBlockers({ diagnoses: details.diagnoses.length, notes: details.notes, pendingOrders: details.pendingOrders, status: visit.status });
  if (blockers.length) redirect(visitUrl(patientId, encounterId, "&error=blocked"));
  const ok = await db.$transaction(async (tx) => {
    if (visit.status !== "in_progress" && OPEN_STATUSES.includes(visit.status)) {
      if (!(await advance(encounterId, "start", user, { tx }))) return false;
    }
    return advance(encounterId, "complete", user, { tx });
  });
  refresh(patientId);
  redirect(visitUrl(patientId, encounterId, ok ? "&closed=1" : "&error=blocked"));
}
