import Link from "next/link";
import { db } from "@/lib/db";
import { recentAbnormalLabs, todaysSchedule } from "@/lib/queries";
import { currentUser } from "@/lib/session";
import { age, fmtDate, fmtTime, fmtValue, fullName, sexShort, unitLabel } from "@/lib/format";
import { Empty, Panel } from "@/components/panel";
import { FlagBadge, flagText } from "@/components/flag";

export const dynamic = "force-dynamic";

const statusStyles: Record<string, string> = {
  planned: "bg-panel-muted text-ink-2 border-line",
  arrived: "bg-accent-soft text-accent border-accent/30",
  in_progress: "bg-warn-soft text-warn border-warn/30",
  finished: "bg-panel-muted text-ink-3 border-line",
};

export default async function Home() {
  const [schedule, abnormal, draftNotes] = await Promise.all([
    todaysSchedule(),
    recentAbnormalLabs(30),
    db.note.count({ where: { authorId: currentUser.id, status: "draft" } }),
  ]);
  const mine = schedule.filter((e) => e.providerId === currentUser.id);
  const arrived = schedule.filter((e) => e.status === "arrived").length;
  const abnormalPatients = new Set(abnormal.map((o) => o.patientId)).size;

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl p-5">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold">Good {greeting()}, Dr. {currentUser.name.split(" ")[1]}</h1>
            <p className="text-ink-2">{fmtDate(new Date())} · Lakeview Family Medicine</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Clinic visits today" value={schedule.length} sub={`${mine.length} on your schedule`} />
          <Stat label="Arrived and waiting" value={arrived} sub="checked in" />
          <Stat label="Abnormal results (30 days)" value={abnormal.length} sub={`${abnormalPatients} patients`} tone="high" />
          <Stat label="Unsigned notes" value={draftNotes} sub="your drafts" />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Panel title="Today's schedule" className="lg:col-span-3">
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
