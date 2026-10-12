import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { latestVitals } from "@/lib/chart";
import { fullName } from "@/lib/format";
import { PatientRail } from "@/components/chart/patient-rail";
import { ChartTabs } from "@/components/chart/chart-tabs";

export const dynamic = "force-dynamic";

export default async function ChartLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      pcp: true,
      allergies: { orderBy: { severity: "desc" } },
      conditions: { where: { status: "active" }, orderBy: { priority: "asc" } },
      encounters: { where: { start: { gte: new Date() }, status: { in: ["planned", "arrived"] } }, orderBy: { start: "asc" }, take: 1 },
    },
  });
  if (!patient) notFound();

  const [vitals, abnormal, drafts, toVerify] = await Promise.all([
    latestVitals(id),
    db.observation.count({
      where: {
        patientId: id,
        category: "laboratory",
        flag: { in: ["L", "H", "LL", "HH", "A"] },
        effectiveAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
    }),
    db.note.count({ where: { patientId: id, status: "draft" } }),
    db.importJob.count({ where: { patientId: id, status: "needs_review" } }),
  ]);

  return (
    <div className="flex h-full">
      <PatientRail patient={patient} vitals={vitals} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ChartTabs patientId={id} label={fullName(patient)} counts={{ results: abnormal, notes: drafts, import: toVerify }} />
        <div className="min-h-0 flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
