import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getActiveUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { logChartView } from "@/lib/audit/server";
import { age, fmtDate, fmtDob, fmtShortDate, fmtTime, sexShort } from "@/lib/format";
import { sigText } from "@/lib/meds/sig";

export type PatientCard = {
  name: string;
  line: string;
  mrn: string;
  phone: string | null;
  pcp: string | null;
  language: string;
  codeStatus: string;
  allergyStatus: "not_reviewed" | "none" | "listed";
  allergies: { substance: string; reaction: string | null; severe: boolean }[];
  next: string | null;
  // Only for roles that see the clinical record.
  clinical: { problems: string[]; moreProblems: number; meds: string[]; moreMeds: number; vitals: string | null } | null;
};

// What a patient's hover card shows wherever their name appears (src/components/hover/patient-hover.tsx).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const clinical = can(user.role, "viewClinical");
  const p = await db.patient.findUnique({
    where: { id },
    include: {
      pcp: true,
      allergies: { orderBy: { severity: "desc" } },
      encounters: { where: { start: { gte: new Date() }, status: { in: ["planned", "arrived"] } }, orderBy: { start: "asc" }, take: 1 },
    },
  });
  if (!p) return NextResponse.json({ error: "No such patient" }, { status: 404 });
  const [problems, meds, bp] = clinical
    ? await Promise.all([
        db.condition.findMany({ where: { patientId: id, status: "active" }, orderBy: { priority: "asc" }, select: { display: true } }),
        db.medicationRequest.findMany({ where: { patientId: id, status: "active" }, orderBy: { drug: "asc" } }),
        db.observation.findMany({ where: { patientId: id, code: { in: ["8480-6", "8462-4"] } }, orderBy: { effectiveAt: "desc" }, take: 2 }),
      ])
    : [[], [], []];
  await logChartView(id, "Hover card");
  const sys = bp.find((o) => o.code === "8480-6");
  const dia = bp.find((o) => o.code === "8462-4");
  const card: PatientCard = {
    name: `${p.lastName}, ${p.firstName}`,
    line: `${age(p.dob)} y ${sexShort(p.sex)} · born ${fmtDob(p.dob)}`,
    mrn: p.mrn,
    phone: p.phone,
    pcp: p.pcp ? `${p.pcp.name}${p.pcp.credentials ? `, ${p.pcp.credentials}` : ""}` : null,
    language: p.preferredLanguage,
    codeStatus: p.codeStatus,
    allergyStatus: p.allergyStatus === "not_reviewed" ? "not_reviewed" : p.allergies.length ? "listed" : "none",
    allergies: p.allergies.map((a) => ({ substance: a.substance, reaction: a.reaction, severe: a.severity === "severe" })),
    next: p.encounters[0] ? `${fmtDate(p.encounters[0].start)} ${fmtTime(p.encounters[0].start)} · ${p.encounters[0].reason}` : null,
    clinical: clinical
      ? {
          problems: problems.slice(0, 4).map((c) => c.display),
          moreProblems: Math.max(0, problems.length - 4),
          meds: meds.slice(0, 4).map((m) => `${m.drug} ${sigText({ dose: m.dose, route: m.route, frequency: m.frequency, prn: m.prn, prnReason: m.prnReason, steps: m.steps })}`),
          moreMeds: Math.max(0, meds.length - 4),
          vitals: sys && dia ? `BP ${sys.valueNum}/${dia.valueNum} on ${fmtShortDate(sys.effectiveAt)}` : null,
        }
      : null,
  };
  return NextResponse.json(card, { headers: { "Cache-Control": "no-store" } });
}
