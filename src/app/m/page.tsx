import Link from "next/link";
import { db } from "@/lib/db";
import { todaysSchedule } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { can, isProvider, roleLabel } from "@/lib/roles";
import { inboxCounts } from "@/lib/inbox";
import { age, fmtDayShort, fmtTime, fullName, sexShort } from "@/lib/format";
import { visitType } from "@/lib/scheduling/visit-types";
import { VisitStatusChip } from "@/components/schedule/status-chip";
import { RefreshWhile } from "@/components/import/refresh-while";
import { PhoneEmpty, PhoneHeader, PhoneSection } from "@/components/phone/header";

export const metadata = { title: "Today" };

// Haiku's schedule: today's visits as a list to tap through, the provider's own by default.
export default async function PhoneToday({ searchParams }: { searchParams: Promise<{ view?: string; denied?: string }> }) {
  const { view, denied } = await searchParams;
  const user = await requireUser();
  const [schedule, inbox, drafts] = await Promise.all([
    todaysSchedule(),
    can(user.role, "useInbox") ? inboxCounts(user) : null,
    can(user.role, "writeNotes") ? db.note.count({ where: { authorId: user.id, status: "draft" } }) : 0,
  ]);
  const mine = schedule.filter((e) => e.providerId === user.id);
  const showAll = view === "all" || mine.length === 0;
  const shown = showAll ? schedule : mine;
  const waiting = schedule.filter((e) => e.status === "arrived").length;
  const now = new Date();
  const name = isProvider(user.role) ? `Dr. ${user.name.split(" ").at(-1)}` : user.name.split(" ")[0];

  return (
    <>
      <PhoneHeader title={`Hello, ${name}`} sub={`${fmtDayShort(now)} · ${roleLabel[user.role]}`} />
      <RefreshWhile active intervalMs={30_000} />

      {denied && (
        <p role="alert" className="mx-4 mt-3 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-warn">
          Your role ({roleLabel[user.role].toLowerCase()}) doesn&apos;t have access to that.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2 px-4 pt-3">
        <Stat label={showAll ? "Visits" : "My visits"} value={shown.length} />
        <Stat label="Waiting" value={waiting} />
        {inbox ? <Stat label="Inbox" value={inbox.total} tone={inbox.total > 0} /> : <Stat label="All visits" value={schedule.length} />}
      </div>
      {(drafts > 0 || (inbox && inbox.imports > 0)) && (
        <p className="px-4 pt-2 text-[13px] text-ink-2">
          {drafts > 0 && <span className="text-warn">{drafts} unsigned {drafts === 1 ? "note" : "notes"}. </span>}
          {inbox && inbox.imports > 0 && <span>{inbox.imports} imported {inbox.imports === 1 ? "report" : "reports"} to verify. </span>}
          Finish these on a computer.
        </p>
      )}

      <PhoneSection
        title={showAll ? "Clinic schedule" : "My schedule"}
        action={
          mine.length > 0 && (
            <Link href={showAll ? "/m" : "/m?view=all"} className="text-[13px] font-medium text-accent">
              {showAll ? "Only mine" : "All providers"}
            </Link>
          )
        }
      >
        {shown.length === 0 ? (
          <PhoneEmpty>No appointments today.</PhoneEmpty>
        ) : (
          <ul>
            {shown.map((e) => {
              const done = e.status === "checked_out" || e.status === "no_show";
              return (
                <li key={e.id} className="border-b border-line last:border-b-0">
                  <Link href={`/m/patients/${e.patientId}`} className={`flex gap-3 px-4 py-3 active:bg-accent-soft/60 ${done ? "opacity-60" : ""}`}>
                    <div className="tabular w-[4.2rem] shrink-0 pt-0.5 text-[13px] font-medium text-ink-2">{fmtTime(e.start)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate font-semibold">{fullName(e.patient)}</span>
                        <span className="shrink-0 text-[13px] text-ink-3">
                          {age(e.patient.dob)} {sexShort(e.patient.sex)}
                        </span>
                      </div>
                      <div className="truncate text-[13px] text-ink-2">
                        {e.chiefComplaint ?? e.reason}
                        <span className="text-ink-3">
                          {" · "}
                          {visitType(e.visitType).label}
                          {e.type === "telehealth" ? ", video" : ""}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-ink-3">
                        <VisitStatusChip status={e.status} since={e.statusAt} now={now} />
                        {(e.status === "roomed" || e.status === "in_progress") && e.room && <span>{e.room}</span>}
                        {showAll && e.provider && <span>{e.provider.name}</span>}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </PhoneSection>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-panel px-3 py-2">
      <div className={`tabular text-[22px] font-semibold leading-tight ${tone ? "text-accent" : ""}`}>{value}</div>
      <div className="text-[12px] text-ink-3">{label}</div>
    </div>
  );
}
