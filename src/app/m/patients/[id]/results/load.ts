import "server-only";
import { db } from "@/lib/db";
import { buildTrend } from "@/lib/labs/trends";
import { GLUCOSE_CODES } from "@/lib/glucose";

// Every filed lab result for the phone's Results screens, sorted into the same sections and
// panels as the full site's trend table (src/lib/labs/trends.ts), blood sugars merged into one.
export async function phoneTrend(patientId: string) {
  const [reports, glucose] = await Promise.all([
    db.diagnosticReport.findMany({
      where: { patientId },
      orderBy: { effectiveAt: "desc" },
      select: { id: true, display: true, source: true, observations: { orderBy: { sortOrder: "asc" } } },
    }),
    // Fingerstick glucose is filed with the vitals; it joins the lab glucose in one trend.
    db.observation.findMany({ where: { patientId, category: "vital_signs", code: { in: GLUCOSE_CODES } } }),
  ]);
  return buildTrend([
    ...reports.flatMap((r) => r.observations.map((o) => ({ obs: o, panel: r.display, reportId: r.id, imported: r.source === "imported" }))),
    ...glucose.map((o) => ({ obs: o })),
  ]);
}
