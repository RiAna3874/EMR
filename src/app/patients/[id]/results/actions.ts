"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { canCorrectResult, correctResult, CORRECTION_REASONS } from "@/lib/labs/correction";

export type CorrectionState = { error: string } | undefined;

// Fixing a lab value that was typed or read wrong. The old value, unit, range and flag are
// kept in ObservationCorrection with who changed it, when and why; the chart, trends and
// graphs show the corrected value with a "C" mark. A result someone already acknowledged
// goes back to the Inbox so they see the new number, unless they made the correction.
export async function correctLabResult(patientId: string, observationId: string, _prev: CorrectionState, form: FormData): Promise<CorrectionState> {
  const user = await requirePermission("viewClinical");
  const reason = String(form.get("reason") ?? "");
  const note = String(form.get("note") ?? "").trim();
  if (!CORRECTION_REASONS.includes(reason)) return { error: "Choose why the value is being corrected." };
  if (reason === "Other" && !note) return { error: "Say briefly what was wrong." };

  const obs = await db.observation.findFirst({
    where: { id: observationId, patientId, category: "laboratory", reportId: { not: null } },
    include: { patient: { select: { sex: true } }, report: { include: { importJob: { select: { createdById: true } } } } },
  });
  if (!obs?.report) return { error: "That result is no longer on the chart." };
  const report = obs.report;
  if (!canCorrectResult(user, report)) return { error: "You can't correct this result. Ask a physician or resident." };

  const input = {
    value: String(form.get("value") ?? ""),
    unit: String(form.get("unit") ?? ""),
    range: String(form.get("range") ?? ""),
    flag: String(form.get("flag") ?? ""),
  };
  const { next, error } = correctResult(obs, input, obs.patient.sex);
  if (error) return { error };

  const now = new Date();
  const backToInbox = !!report.reviewedAt && report.reviewedById !== user.id;
  await db.$transaction([
    db.observationCorrection.create({
      data: {
        observationId: obs.id,
        valueNum: obs.valueNum,
        valueText: obs.valueText,
        unit: obs.unit,
        refLow: obs.refLow,
        refHigh: obs.refHigh,
        refText: obs.refText,
        flag: obs.flag,
        reason: (note ? `${reason}: ${note}` : reason).slice(0, 500),
        correctedById: user.id,
        correctedAt: now,
      },
    }),
    db.observation.update({ where: { id: obs.id }, data: { ...next, correctedAt: now } }),
    db.diagnosticReport.update({
      where: { id: report.id },
      data: { correctedAt: now, ...(backToInbox ? { reviewedAt: null, reviewedById: null, reviewComment: null } : {}) },
    }),
  ]);
  revalidatePath("/", "layout");
  redirect(`/patients/${patientId}/results?view=reports&report=${report.id}&corrected=${obs.id}#${obs.id}`);
}
