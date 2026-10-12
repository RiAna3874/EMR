import { db } from "@/lib/db";
import { latestVitals, pivot } from "@/lib/chart";
import { age, fmtDate, fmtDob, fmtRange, fmtShortDate, fmtValue, isAbnormal, unitLabel } from "@/lib/format";
import { displayName, type SessionUser } from "@/lib/roles";
import { problemBlock } from "@/lib/notes/smarttext";

// Builds the value of each chart link (@VITALS@, @MEDS@, ...) for the note editor.
// See chartLinks in src/lib/notes/library.ts for the list.
export async function smartTextFor(patientId: string, currentUser: SessionUser): Promise<Record<string, string>> {
  const [vitals, meds, conditions, allergies, patient, labs, today] = await Promise.all([
    latestVitals(patientId),
    db.medicationRequest.findMany({ where: { patientId, status: { in: ["active", "on_hold"] } }, orderBy: { drug: "asc" } }),
    db.condition.findMany({ where: { patientId, status: "active" }, orderBy: { priority: "asc" } }),
    db.allergyIntolerance.findMany({ where: { patientId } }),
    db.patient.findUniqueOrThrow({ where: { id: patientId }, include: { pcp: true } }),
    db.observation.findMany({
      where: { patientId, category: "laboratory", effectiveAt: { gte: new Date(Date.now() - 180 * 86_400_000) } },
    }),
    db.encounter.findFirst({
      where: { patientId, start: { gte: new Date(new Date().setHours(0, 0, 0, 0)), lt: new Date(new Date().setHours(24, 0, 0, 0)) } },
      orderBy: { start: "asc" },
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
  const latest = rows.map((r) => r.byTime.get(Math.max(...r.byTime.keys()))!);
  const labLine = (o: (typeof latest)[number]) => {
    const flag = o.flag && o.flag !== "N" ? ` [${o.flag}]` : "";
    return `- ${o.display} ${fmtValue(o)} ${unitLabel(o.unit)}${flag} (ref ${fmtRange(o)}, ${fmtShortDate(o.effectiveAt)})`;
  };
  const labsText = latest.length ? "Recent labs:\n" + latest.map(labLine).join("\n") : "Recent labs: none in the last 6 months.";
  const abnormal = latest.filter((o) => isAbnormal(o.flag));
  const abnLabsText = abnormal.length ? "Abnormal labs:\n" + abnormal.map(labLine).join("\n") : "Abnormal labs: none in the last 6 months.";

  const apText = conditions.length ? conditions.map((c, i) => problemBlock(c, i + 1)).join("\n\n") : "1. ***\nPlan: ***";

  return {
    NAME: `${patient.firstName} ${patient.lastName}`,
    AGE: String(age(patient.dob)),
    SEX: patient.sex === "male" ? "male" : patient.sex === "female" ? "female" : "patient",
    DOB: fmtDob(patient.dob),
    MRN: patient.mrn,
    PCP: patient.pcp ? `${patient.pcp.name}, ${patient.pcp.credentials ?? ""}`.replace(/, $/, "") : "no PCP on file",
    CC: today?.reason ?? "***",
    TODAY: fmtDate(new Date()),
    ME: displayName(currentUser),
    VITALS: vitalsText,
    MEDS: medsText,
    PROBLEMS: problemsText,
    APPROBLEMS: apText,
    ALLERGIES: allergiesText,
    LABS: labsText,
    ABNLABS: abnLabsText,
  };
}
