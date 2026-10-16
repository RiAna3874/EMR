import Link from "next/link";
import { resultHref } from "@/lib/labs/groups";
import { db } from "@/lib/db";
import { clinic } from "@/lib/clinic";
import { recentAbnormalLabs, todaysSchedule } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { can, isProvider, roleLabel } from "@/lib/roles";
import { age, fmtDate, fmtTime, fmtValue, fullName, sexShort, unitLabel } from "@/lib/format";
import { Empty, Panel } from "@/components/panel";
import { FlagBadge, flagText } from "@/components/flag";
import { ImportStatusChip } from "@/components/import/status-chip";
import { RefreshWhile } from "@/components/import/refresh-while";
import { VisitStatusChip } from "@/components/schedule/status-chip";
import { NextStepButton } from "@/components/schedule/next-step";
import { visitType } from "@/lib/scheduling/visit-types";
import { startOfDay } from "@/lib/scheduling/server";
import { OPEN_STATUSES } from "@/lib/visits/close";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isPhone, VIEW_COOKIE } from "@/lib/phone-view";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ denied?: string; view?: string }> }) {
  const { denied, view } = await searchParams;
  const currentUser = await requireUser();
  // A phone opening My Day (after sign-in, too) gets the phone view, unless it chose the full site.
  if (!denied && !view && isPhone((await headers()).get("user-agent") ?? "") && (await cookies()).get(VIEW_COOKIE)?.value !== "desktop") redirect("/m");
  // Front desk gets the schedule; clinical panels need clinical access.
  const clinical = can(currentUser.role, "viewClinical");
  const [schedule, abnormal, draftNotes, toVerify, openVisits] = await Promise.all([
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
    // Visits from earlier days this provider never closed.
    can(currentUser.role, "seePatients")
      ? db.encounter.findMany({
          where: { providerId: currentUser.id, status: { in: OPEN_STATUSES }, start: { lt: startOfDay(new Date()) } },
          orderBy: { start: "asc" },
          include: { patient: true },
        })
      : [],
  ]);
  const mine = schedule.filter((e) => e.providerId === currentUser.id);
  // Providers see their own visits unless they ask for the whole clinic.
  const showAll = view === "all" || mine.length === 0;
  const shown = showAll ? schedule : mine;
  const waiting = schedule.filter((e) => e.status === "arrived").length;
  const roomed = schedule.filter((e) => e.status === "roomed").length;
  const now = new Date();
  const abnormalPatients = new Set(abnormal.map((o) => o.patientId)).size;

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-7xl p-5">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold">
              Good {greeting()}, {isProvider(currentUser.role) ? `Dr. ${currentUser.name.split(" ").at(-1)}` : currentUser.name.split(" ")[0]}
            </h1>
            <p className="text-ink-2">{fmtDate(new Date())} · {clinic.name}</p>
          </div>
        </div>

        {denied && (
          <p role="alert" className="mb-4 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-warn">
            {denied === "admin"
              ? "Only an administrator can manage staff accounts."
              : <>Your role ({roleLabel[currentUser.role].toLowerCase()}) doesn&apos;t have access to that. Ask a clinician if you need it done.</>}
          </p>
        )}

        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Clinic visits today" value={schedule.length} sub={isProvider(currentUser.role) ? `${mine.length} on your schedule` : "all providers"} />
          <Stat label="Waiting" value={waiting} sub={`checked in, not roomed${roomed ? ` · ${roomed} roomed` : ""}`} />
          {clinical && <Stat label="Abnormal results (30 days)" value={abnormal.length} sub={`${abnormalPatients} patients`} tone="high" />}
          {can(currentUser.role, "writeNotes") && <Stat label="Unsigned notes" value={draftNotes} sub="your drafts" />}
        </div>

        {openVisits.length > 0 && (
          <Panel title="Open visits from earlier days" className="mb-4">
            <ul>
              {openVisits.map((e) => (
                <li key={e.id} className="border-t border-line first:border-t-0">
                  <Link href={`/patients/${e.patientId}/visit?e=${e.id}`} className="flex items-center gap-3 px-3 py-1.5 hover:bg-accent-soft/40">
                    <span className="tabular w-40 shrink-0 text-ink-2">{fmtDate(e.start)} {fmtTime(e.start)}</span>
                    <span className="font-medium">{fullName(e.patient)}</span>
                    <span className="text-ink-3">{e.chiefComplaint ?? e.reason}</span>
                    <span className="ml-auto text-[12px] text-warn">Not closed</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

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

        <div className="grid grid-cols-1 gap-4">
          <Panel
            title="Today's schedule"
            className="overflow-x-auto"
            action={
              <span className="flex items-center gap-3 text-[12px]">
                {mine.length > 0 && (
                  <Link href={showAll ? "/" : "/?view=all"} className="text-accent hover:underline">
                    {showAll ? "Show only mine" : "Show all providers"}
                  </Link>
                )}
                <Link href="/schedule" className="text-accent hover:underline">
                  Open schedule
                </Link>
              </span>
            }
          >
            <RefreshWhile active intervalMs={30_000} />
            {shown.length === 0 ? (
              <Empty>No appointments today.</Empty>
            ) : (
              <table className="w-full">
                <thead className="text-left text-[11.5px] text-ink-3">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Time</th>
                    <th className="px-3 py-1.5 font-medium">Patient</th>
                    <th className="px-3 py-1.5 font-medium">Visit</th>
                    {showAll && <th className="px-3 py-1.5 font-medium">Provider</th>}
                    <th className="px-3 py-1.5 font-medium">Room</th>
                    <th className="px-3 py-1.5 font-medium">Status</th>
                    <th className="px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((e) => {
                    const done = e.status === "checked_out" || e.status === "no_show";
                    return (
                      <tr key={e.id} className={`border-t border-line hover:bg-accent-soft/40 ${done ? "text-ink-3" : ""}`}>
                        <td className="tabular whitespace-nowrap px-3 py-2">
                          <Link href={`/appointments/${e.id}`} className="text-ink-2 hover:text-accent">
                            {fmtTime(e.start)}
                          </Link>
                        </td>
                        <td className="whitespace-nowrap px-3 py-2">
                          <Link href={`/patients/${e.patientId}`} className={`font-medium hover:text-accent ${done ? "text-ink-3" : "text-ink"}`}>
                            {fullName(e.patient)}
                          </Link>
                          <span className="ml-2 text-ink-3">
                            {age(e.patient.dob)} {sexShort(e.patient.sex)}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {e.chiefComplaint ?? e.reason}
                          <span className="ml-1.5 text-[11px] text-ink-3">
                            {visitType(e.visitType).label}
                            {e.type === "telehealth" ? ", video" : ""}
                          </span>
                        </td>
                        {showAll && <td className="whitespace-nowrap px-3 py-2 text-ink-2">{e.provider?.name}</td>}
                        <td className="whitespace-nowrap px-3 py-2 text-ink-2">{e.status === "roomed" || e.status === "in_progress" ? e.room : ""}</td>
                        <td className="px-3 py-2">
                          <VisitStatusChip status={e.status} since={e.statusAt} now={now} />
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-right">
                          <NextStepButton appt={e} role={currentUser.role} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Panel>

          {clinical && (
            <Panel title="Abnormal results">
              {abnormal.length === 0 ? (
                <Empty>Nothing abnormal in the last 30 days.</Empty>
              ) : (
                <ul className="max-h-[360px] overflow-y-auto">
                  {abnormal.slice(0, 40).map((o) => (
                    <li key={o.id} className="border-t border-line first:border-t-0">
                      <Link
                        href={resultHref(`/patients/${o.patientId}`, o, o.report?.display)}
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
