import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { fmtDayLong, fmtTime, fullName, parseLocalDate, toLocalDate, toLocalDateTime } from "@/lib/format";
import { scheduledProviders } from "@/lib/scheduling/server";
import { overlaps, sessionsOn } from "@/lib/scheduling/slots";
import { ACTIVE_STATUSES } from "@/lib/scheduling/workflow";
import { visitType } from "@/lib/scheduling/visit-types";
import { VisitStatusChip } from "@/components/schedule/status-chip";
import { RefreshWhile } from "@/components/import/refresh-while";

export const dynamic = "force-dynamic";

const PX_PER_MIN = 2.2;
const MIN = 60_000;

// Department schedule: one column per provider for a day, with their sessions,
// blocked time, appointments and open slots. Click an open slot to book it.
export default async function Schedule({ searchParams }: { searchParams: Promise<{ date?: string; providers?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const day = parseLocalDate(sp.date);
  const next = new Date(day.getTime() + 86_400_000 + 3_600_000);
  next.setHours(0, 0, 0, 0);
  const prev = new Date(day.getTime() - 3_600_000);
  prev.setHours(0, 0, 0, 0);

  const all = await scheduledProviders();
  // Providers see their own column first; everyone else sees the whole department.
  const chosen = sp.providers ? sp.providers.split(",") : all.map((p) => p.id);
  const providers = all.filter((p) => chosen.includes(p.id)).sort((a, b) => (a.id === user.id ? -1 : b.id === user.id ? 1 : 0));
  const ids = providers.map((p) => p.id);

  const [appts, blocks] = await Promise.all([
    db.encounter.findMany({
      where: { providerId: { in: ids }, start: { gte: day, lt: next } },
      orderBy: { start: "asc" },
      include: { patient: true },
    }),
    db.scheduleBlock.findMany({ where: { practitionerId: { in: ids }, start: { lt: next }, end: { gt: day } } }),
  ]);
  const onGrid = appts.filter((a) => a.status !== "cancelled");
  const cancelled = appts.filter((a) => a.status === "cancelled");

  // Grid hours: the day's sessions and appointments, at least 8:00 to 17:00.
  const sessions = providers.flatMap((p) => sessionsOn(day, p.scheduleSessions));
  const minuteOf = (d: Date) => Math.round((d.getTime() - day.getTime()) / MIN);
  let first = 8 * 60;
  let last = 17 * 60;
  for (const s of sessions) {
    first = Math.min(first, minuteOf(s.start));
    last = Math.max(last, minuteOf(s.end));
  }
  for (const a of onGrid) {
    first = Math.min(first, minuteOf(a.start));
    last = Math.max(last, minuteOf(a.end ?? a.start) + 20);
  }
  first = Math.floor(first / 60) * 60;
  last = Math.ceil(last / 60) * 60;
  const top = (d: Date) => (minuteOf(d) - first) * PX_PER_MIN;
  const height = (a: Date, b: Date) => Math.max(18, ((b.getTime() - a.getTime()) / MIN) * PX_PER_MIN);
  const hours = Array.from({ length: (last - first) / 60 }, (_, i) => first + i * 60);
  const now = new Date();
  const isToday = toLocalDate(day) === toLocalDate(now);
  const canBook = can(user.role, "bookAppointments");

  const href = (over: { date?: string; providers?: string | null }) => {
    const params = new URLSearchParams();
    const date = over.date ?? toLocalDate(day);
    if (date !== toLocalDate(now)) params.set("date", date);
    const prov = over.providers === undefined ? sp.providers : over.providers;
    if (prov) params.set("providers", prov);
    const q = params.toString();
    return `/schedule${q ? `?${q}` : ""}`;
  };
  const toggle = (id: string) => {
    const set = new Set(chosen);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    return set.size === all.length ? null : [...set].join(",");
  };

  return (
    <main className="flex h-full flex-col">
      <RefreshWhile active={isToday} intervalMs={30_000} />
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
        <h1 className="text-[15px] font-semibold">Schedule</h1>
        <div className="flex overflow-hidden rounded border border-line text-[12.5px]">
          <Link href={href({ date: toLocalDate(prev) })} className="px-2 py-1 hover:bg-panel-muted" aria-label="Previous day">
            ‹
          </Link>
          <Link href={href({ date: toLocalDate(now) })} className={`border-x border-line px-2.5 py-1 ${isToday ? "bg-chrome text-white" : "hover:bg-panel-muted"}`}>
            Today
          </Link>
          <Link href={href({ date: toLocalDate(next) })} className="px-2 py-1 hover:bg-panel-muted" aria-label="Next day">
            ›
          </Link>
        </div>
        <form action="/schedule" className="flex items-center gap-1.5">
          {sp.providers && <input type="hidden" name="providers" value={sp.providers} />}
          <input type="date" name="date" defaultValue={toLocalDate(day)} className="rounded border border-line px-1.5 py-0.5 text-[12.5px]" />
          <button className="rounded border border-line px-2 py-0.5 text-[12.5px] hover:bg-panel-muted">Go</button>
        </form>
        <span className="font-medium">{fmtDayLong(day)}</span>
        <div className="ml-auto flex items-center gap-2">
          {can(user.role, "editSchedules") && (
            <Link href="/schedule/templates" className="rounded border border-line px-2.5 py-1 text-[12.5px] hover:bg-panel-muted">
              Provider templates
            </Link>
          )}
          {canBook && (
            <Link href="/schedule/book" className="rounded border border-accent bg-accent px-2.5 py-1 text-[12.5px] font-medium text-white hover:bg-accent/90">
              Make appointment
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-line bg-panel-muted px-4 py-1.5 text-[12px]">
        <span className="mr-1 text-ink-3">Providers</span>
        {all.map((p) => {
          const on = chosen.includes(p.id);
          const nextSet = toggle(p.id);
          return (
            <Link
              key={p.id}
              href={nextSet === "" ? href({}) : href({ providers: nextSet })}
              className={`rounded-full border px-2 py-0.5 ${on ? "border-accent/40 bg-accent-soft text-ink" : "border-line text-ink-3 hover:text-ink"}`}
            >
              {on ? "✓ " : ""}
              {p.name}
              {p.id === user.id ? " (you)" : ""}
            </Link>
          );
        })}
        <span className="ml-auto flex items-center gap-3 text-ink-3">
          <Legend className="bg-panel" label="Open" />
          <Legend className="bg-[repeating-linear-gradient(135deg,var(--line)_0_4px,transparent_4px_8px)]" label="Blocked" />
          <Legend className="bg-line/45" label="Not in clinic" />
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {providers.length === 0 ? (
          <p className="p-6 text-ink-3">Pick at least one provider.</p>
        ) : (
          <div className="flex min-w-fit">
            <div className="sticky left-0 z-20 w-14 shrink-0 border-r border-line bg-panel">
              <div className="sticky top-0 z-10 h-11 border-b border-line bg-panel" />
              <div className="relative" style={{ height: (last - first) * PX_PER_MIN }}>
                {hours.map((h) => (
                  <div
                    key={h}
                    className={`tabular absolute right-1.5 text-[11px] text-ink-3 ${h === first ? "translate-y-0.5" : "-translate-y-1/2"}`}
                    style={{ top: (h - first) * PX_PER_MIN }}
                  >
                    {fmtTime(new Date(day.getTime() + h * MIN)).replace(":00", "")}
                  </div>
                ))}
              </div>
            </div>
            {providers.map((p) => {
              const mine = onGrid.filter((a) => a.providerId === p.id);
              const myBlocks = blocks.filter((b) => b.practitionerId === p.id);
              const mySessions = sessionsOn(day, p.scheduleSessions);
              const busy = [
                ...mine.filter((a) => ACTIVE_STATUSES.includes(a.status)).map((a) => ({ start: a.start, end: a.end ?? new Date(a.start.getTime() + 20 * MIN) })),
                ...myBlocks,
              ];
              // Open slots, stepping by the session's slot length.
              const open = mySessions.flatMap((s) => {
                const out: Date[] = [];
                for (let t = s.start.getTime(); t + s.slotMinutes * MIN <= s.end.getTime(); t += s.slotMinutes * MIN) {
                  const slot = { start: new Date(t), end: new Date(t + s.slotMinutes * MIN) };
                  if (slot.start > now && !busy.some((b) => overlaps(slot, b))) out.push(slot.start);
                }
                return out.map((start) => ({ start, minutes: s.slotMinutes }));
              });
              const lanes = assignLanes(mine);
              const booked = mine.filter((a) => ACTIVE_STATUSES.includes(a.status)).length;
              return (
                <div key={p.id} className="w-64 shrink-0 border-r border-line">
                  <div className="sticky top-0 z-10 flex h-11 flex-col justify-center border-b border-line bg-panel px-2.5">
                    <div className="truncate font-semibold">
                      {p.name}
                      {p.credentials ? `, ${p.credentials}` : ""}
                    </div>
                    <div className="text-[11px] text-ink-3">
                      {mySessions.length === 0 ? "Not in clinic" : `${booked} booked · ${open.length} open`}
                    </div>
                  </div>
                  <div className="relative bg-line/45" style={{ height: (last - first) * PX_PER_MIN }}>
                    {mySessions.map((s, i) => (
                      <div key={i} className="absolute inset-x-0 bg-panel" style={{ top: top(s.start), height: height(s.start, s.end) }} />
                    ))}
                    {hours.map((h) => (
                      <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: (h - first) * PX_PER_MIN }} />
                    ))}
                    {isToday && minuteOf(now) > first && minuteOf(now) < last && (
                      <div className="absolute inset-x-0 z-[5] border-t-2 border-high/70" style={{ top: top(now) }} title="Now" />
                    )}
                    {myBlocks.map((b) => {
                      const s = b.start < day ? day : b.start;
                      const e = b.end > next ? next : b.end;
                      return (
                        <div
                          key={b.id}
                          className="absolute inset-x-0 flex items-start bg-[repeating-linear-gradient(135deg,var(--line)_0_4px,var(--panel)_4px_8px)] px-2 py-1 text-[11px] font-medium text-ink-2"
                          style={{ top: Math.max(0, top(s)), height: height(s, e) }}
                        >
                          {b.reason}
                        </div>
                      );
                    })}
                    {canBook &&
                      open.map((o) => (
                        <Link
                          key={o.start.getTime()}
                          href={`/schedule/book?provider=${p.id}&start=${toLocalDateTime(o.start)}`}
                          className="group absolute inset-x-1 flex items-center rounded px-1.5 text-[11px] text-transparent hover:bg-accent-soft hover:text-accent"
                          style={{ top: top(o.start) + 1, height: o.minutes * PX_PER_MIN - 2 }}
                          title={`Book ${fmtTime(o.start)} with ${p.name}`}
                        >
                          + {fmtTime(o.start)}
                        </Link>
                      ))}
                    {mine.map((a) => {
                      const vt = visitType(a.visitType);
                      const [lane, of] = lanes.get(a.id)!;
                      const end = a.end ?? new Date(a.start.getTime() + vt.minutes * MIN);
                      return (
                        <Link
                          key={a.id}
                          href={`/appointments/${a.id}`}
                          className={`absolute z-[6] overflow-hidden rounded border border-line bg-panel px-1.5 py-0.5 text-[11.5px] leading-tight shadow-sm hover:border-accent ${
                            a.status === "no_show" || a.status === "checked_out" ? "opacity-60" : ""
                          }`}
                          style={{
                            top: top(a.start) + 1,
                            height: height(a.start, end) - 2,
                            left: `calc(${(lane / of) * 100}% + 3px)`,
                            width: `calc(${100 / of}% - 6px)`,
                            borderLeft: `4px solid ${vt.color}`,
                          }}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate font-semibold">{fullName(a.patient)}</span>
                            <VisitStatusChip status={a.status} />
                          </div>
                          <div className="truncate text-ink-2">
                            <span className="tabular">{fmtTime(a.start)}</span> · {vt.label}
                            {a.reason && a.reason !== vt.label ? ` · ${a.reason}` : ""}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {cancelled.length > 0 && (
              <aside className="w-56 shrink-0 p-3">
                <h2 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Cancelled</h2>
                <ul className="space-y-1.5">
                  {cancelled.map((a) => (
                    <li key={a.id}>
                      <Link href={`/appointments/${a.id}`} className="block rounded border border-line bg-panel px-2 py-1 hover:border-accent">
                        <div className="font-medium">{fullName(a.patient)}</div>
                        <div className="text-[11.5px] text-ink-3">
                          {fmtTime(a.start)} · {providers.find((p) => p.id === a.providerId)?.name} · {a.cancelReason}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={`inline-block h-3 w-3 rounded-sm border border-line ${className}`} />
      {label}
    </span>
  );
}

// Overlapping appointments (overbooks) sit side by side: [lane, lanes in its group].
function assignLanes(appts: { id: string; start: Date; end: Date | null }[]) {
  const out = new Map<string, [number, number]>();
  const endOf = (a: { start: Date; end: Date | null }) => a.end ?? new Date(a.start.getTime() + 20 * MIN);
  let group: { id: string; lane: number }[] = [];
  let groupEnd = 0;
  let laneEnds: number[] = [];
  const flush = () => {
    for (const g of group) out.set(g.id, [g.lane, laneEnds.length]);
    group = [];
    laneEnds = [];
  };
  for (const a of [...appts].sort((x, y) => x.start.getTime() - y.start.getTime())) {
    if (a.start.getTime() >= groupEnd) flush();
    let lane = laneEnds.findIndex((e) => e <= a.start.getTime());
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = endOf(a).getTime();
    group.push({ id: a.id, lane });
    groupEnd = Math.max(groupEnd, endOf(a).getTime());
  }
  flush();
  return out;
}
