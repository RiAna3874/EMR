import "server-only";
import { db } from "@/lib/db";
import { GLUCOSE_CODES } from "@/lib/glucose";
import { buildTrend } from "./trends";
import { sugarDays } from "./sugar-days";

// Everything the Blood sugar tab shows, on the full site and the phone: every lab glucose
// and every fingerstick glucose recorded in Vitals (in mmol/L), sorted into days, with the
// day notes and the latest HbA1c.
export async function loadBloodSugar(patientId: string) {
  const [reports, fingersticks, notes] = await Promise.all([
    db.diagnosticReport.findMany({ where: { patientId }, orderBy: { effectiveAt: "desc" }, include: { observations: { orderBy: { sortOrder: "asc" } } } }),
    db.observation.findMany({ where: { patientId, category: "vital_signs", code: { in: GLUCOSE_CODES } } }),
    db.bloodSugarNote.findMany({ where: { patientId }, include: { updatedBy: { select: { name: true } } } }),
  ]);
  const subs = buildTrend([
    ...reports.flatMap((r) => r.observations.map((o) => ({ obs: o, panel: r.display, reportId: r.id, imported: r.source === "imported" }))),
    ...fingersticks.map((o) => ({ obs: o })),
  ]).flatMap((s) => s.subs);
  const cells = subs.find((x) => x.sugar)?.sugar?.cells ?? [];
  const a1cRow = subs.find((x) => x.key === "a1c")?.rows[0];
  const a1c = a1cRow ? [...a1cRow.byTime.entries()].sort((x, y) => y[0] - x[0])[0]?.[1] : undefined;
  return { cells, ...sugarDays(cells, notes), a1c, a1cCode: a1cRow?.code };
}

export type BloodSugar = Awaited<ReturnType<typeof loadBloodSugar>>;
export type SugarDayRow = BloodSugar["days"][number];
export type SugarDayCell = NonNullable<SugarDayRow["fasting"]>;
