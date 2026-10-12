import Link from "next/link";
import { db } from "@/lib/db";
import { recentAbnormalLabs, todaysSchedule } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { can, isProvider, roleLabel } from "@/lib/roles";
import { age, fmtDate, fmtTime, fmtValue, fullName, sexShort, unitLabel } from "@/lib/format";
import { Empty, Panel } from "@/components/panel";
import { FlagBadge, flagText } from "@/components/flag";
import { ImportStatusChip } from "@/components/import/status-chip";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  planned: "bg-panel-muted text-ink-2 border-line",
  arrived: "bg-accent-soft text-accent border-accent/30",
  in_progress: "bg-warn-soft text-warn border-warn/30",
  finished: "bg-panel-muted text-ink-3 border-line",
};

export default async function Home({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const { denied } = await searchParams;
  const currentUser = await requireUser();
  // Front desk gets the schedule; clinical panels need clinical access.
  const clinical = can(currentUser.role, "viewClinical");
  const [schedule, abnormal, draftNotes, toVerify] = await Promise.all([
    todaysSchedule(),
    clinical ? recentAbnormalLabs(30) : [],
    db.note.count({ where: { authorId: currentUser.id, status: "draft" } }),
    can(currentUser.role, "importReports")
      ? db.importJob.findMany({
          where: { status: { in: ["needs_review", "failed"] } },
          orderBy: { createdAt: "asc" },
          include: { patient: true, createdBy: true, _count: { select: { documents: true } } },
        })
      : [],
  ]);
  const mine = schedule.filter((e) => e.providerId === currentUser.id);
  const arrived = schedule.filter((e) => e.status === "arrived").length;
  const abnormalPatients = new Set(abnormal.map((o) => o.patientId)).size;

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl p-5">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              Good {greeting()}, {isProvider(currentUser.role) ? `Dr. ${currentUser.name.split(" ").at(-1)}` : currentUser.name.split(" ")[0]}
            </h1>
            <p className="text-ink-2">{fmtDate(new Date())} · Lakeview Family Medicine</p>
          </div>
        </div>

        {denied && (
          <p role="alert" className="mb-4 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-warn">
            Your role ({roleLabel[currentUser.role].toLowerCase()}) doesn&apos;t have access to that. Ask a clinician if you need it done.
          </p>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Clinic visits today" value={schedule.length} sub={isProvider(currentUser.role) ? `${mine.length} on your schedule` : "all providers"} />
          <Stat label="Arrived and waiting" value={arrived} sub="checked in" />
          {clinical && <Stat label="Abnormal results (30 days)" value={abnormal.length} sub={`${abnormalPatients} patients`} tone="high" />}
          {can(currentUser.role, "writeNotes") && <Stat label="Unsigned notes" value={draftNotes} sub="your drafts" />}
        </div>

        {toVerify.length > 0 && (
          <Panel title="Imported reports to verify" className="mb-4">
            <ul>
              {toVerify.map((j) => (
                <li key={j.id} className="border-t border-line first:border-t-0">
                  <Link href={`/patients/${j.patientId}/import/${j.id}`} className="flex items-center gap-3 px-3 py-1.5 hover:bg-accent-soft/40">
                    <span className="font-medium">{fullName(j.patient)}</span>
                    <span className="text-ink-3">
                      {j._count.documents} {j._count.documents === 1 ? "page" : "pages"} uploaded {fmtDate(j.createdAt)} {fmtTime(j.createdAt)} by {j.createdBy.name}
                    </span>
                    <span className="ml-auto">
                      <ImportStatusChip status={j.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Panel title="Today's schedule" className={clinical ? "lg:col-span-3" : "lg:col-span-5"}>
            {schedule.length === 0 ? (
              <Empty>No appointments today.</Empty>
            ) : (
              <table className="w-full">
                <thead className="text-left text-[11.5px] text-ink-3">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Time</th>
                    <th className="px-3 py-1.5 font-medium">Patient</th>
                    <th className="px-3 py-1.5 font-medium">Reason</th>
                    <th className="px-3 py-1.5 font-medium">Provider</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map((e) => (
                    <tr key={e.id} className="border-t border-line hover:bg-accent-soft/40">
                      <td className="tabular whitespace-nowrap px-3 py-2 text-ink-2">{fmtTime(e.start)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <Link href={`/patients/${e.patientId}`} className="font-medium text-ink hover:text-accent">
                          {fullName(e.patient)}
                        </Link>
                        <span className="ml-2 text-ink-3">
                          {age(e.patient.dob)} {sexShort(e.patient.sex)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {e.reason}
                        {e.type !== "office" && <span className="ml-1.5 text-[11px] text-ink-3">({e.type})</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-ink-2">{e.provider?.name}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded border px-1.5 py-0.5 text-[11px] capitalize ${statusStyles[e.status] ?? ""}`}>
                          {e.status.replace("_", " ")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {clinical && (
            <Panel title="Abnormal results" className="lg:col-span-2">
              {abnormal.length === 0 ? (
                <Empty>Nothing abnormal in the last 30 days.</Empty>
              ) : (
                <ul className="max-h-[480px] overflow-y-auto">
                  {abnormal.slice(0, 40).map((o) => (
                    <li key={o.id} className="border-t border-line first:border-t-0">
                      <Link
                        href={`/patients/${o.patientId}/results#${o.code}`}
                        className="flex items-center justify-between gap-3 px-3 py-1.5 hover:bg-accent-soft/40"
                      >
                        <span className="min-w-0 truncate">
                          <span className="font-medium">{fullName(o.patient)}</span>
                          <span className="text-ink-3"> · {o.display}</span>
                        </span>
                        <span className={`tabular shrink-0 ${flagText(o.flag)}`}>
                          {fmtValue(o)} {unitLabel(o.unit)}
                          <FlagBadge flag={o.flag} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>
      </div>
    </main>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub: string; tone?: "high" }) {
  return (
    <div className="rounded-md border border-line bg-panel px-4 py-3">
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-3">{label}</div>
      <div className={`tabular mt-1 text-2xl font-semibold ${tone === "high" && value > 0 ? "text-high" : ""}`}>{value}</div>
      <div className="text-[12px] text-ink-2">{sub}</div>
    </div>
  );
}
