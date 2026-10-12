import { db } from "@/lib/db";
import { latestVitals, pivot } from "@/lib/chart";
import { fmtRange, fmtShortDate, fmtValue, unitLabel } from "@/lib/format";

// Builds the text each smart phrase (".vitals", ".meds", ...) expands to in the note editor.
export async function smartTextFor(patientId: string): Promise<Record<string, string>> {
  const [vitals, meds, conditions, allergies, patient, labs] = await Promise.all([
    latestVitals(patientId),
    db.medicationRequest.findMany({ where: { patientId, status: { in: ["active", "on_hold"] } }, orderBy: { drug: "asc" } }),
    db.condition.findMany({ where: { patientId, status: "active" }, orderBy: { priority: "asc" } }),
    db.allergyIntolerance.findMany({ where: { patientId } }),
    db.patient.findUniqueOrThrow({ where: { id: patientId }, select: { allergyStatus: true } }),
    db.observation.findMany({
      where: { patientId, category: "laboratory", effectiveAt: { gte: new Date(Date.now() - 180 * 86_400_000) } },
    }),
  ]);

  const v = Object.fromEntries(vitals.map((o) => [o.code, o]));
  const vital = (code: string, label: string) => (v[code] ? `${label} ${fmtValue(v[code])} ${unitLabel(v[code].unit)}`.trim() : null);
  const vitalsText = vitals.length
    ? `Vitals (${fmtShortDate(vitals[0].effectiveAt)}): ` +
      [
        v["8480-6"] && v["8462-4"] ? `BP ${v["8480-6"].valueNum}/${v["8462-4"].valueNum} mmHg` : null,
        vital("8867-4", "HR"),
        vital("9279-1", "RR"),
        vital("8310-5", "Temp"),
        vital("59408-5", "SpO2"),
        vital("29463-7", "Wt"),
        vital("39156-5", "BMI"),
      ]
        .filter(Boolean)
        .join(", ")
    : "Vitals: none recorded.";

  const medsText = meds.length
    ? "Current medications:\n" + meds.map((m) => `- ${m.drug}: ${m.dose} ${m.route}, ${m.frequency}${m.status === "on_hold" ? " (on hold)" : ""}`).join("\n")
    : "Current medications: none.";

  const problemsText = conditions.length
    ? "Active problems:\n" + conditions.map((c, i) => `${i + 1}. ${c.display} (${c.code})`).join("\n")
    : "Active problems: none.";

  const allergiesText = allergies.length
    ? "Allergies: " + allergies.map((a) => `${a.substance} (${a.reaction ?? "reaction unknown"}, ${a.severity})`).join("; ")
    : patient.allergyStatus === "no_known_allergies"
      ? "Allergies: no known allergies."
      : "Allergies: not reviewed.";

  // Latest value of each lab drawn in the last 6 months, abnormal ones marked.
  const { rows } = pivot(labs);
  const labsText = rows.length
    ? "Recent labs:\n" +
      rows
        .map((r) => {
          const o = r.byTime.get(Math.max(...r.byTime.keys()))!;
          const flag = o.flag && o.flag !== "N" ? ` [${o.flag}]` : "";
          return `- ${r.display} ${fmtValue(o)} ${unitLabel(o.unit)}${flag} (ref ${fmtRange(o)}, ${fmtShortDate(o.effectiveAt)})`;
        })
        .join("\n")
    : "Recent labs: none in the last 6 months.";

  return { vitals: vitalsText, meds: medsText, problems: problemsText, allergies: allergiesText, labs: labsText };
}
