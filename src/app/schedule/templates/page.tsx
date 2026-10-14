import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fmtDate, fmtTime } from "@/lib/format";
import { Button, Field, inputCls } from "@/components/form";
import { Panel, Empty } from "@/components/panel";
import { ActionButton } from "@/components/action-button";
import { clinicHours } from "@/lib/clinic";
import { addBlock, addSession, deleteBlock, deleteSession } from "../actions";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const hhmm = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

// Provider templates: the weekly sessions that make up each provider's open
// schedule, and time blocked off it (vacation, meetings, admin).
export default async function Templates({ searchParams }: { searchParams: Promise<{ provider?: string }> }) {
  const sp = await searchParams;
  await requirePermission("editSchedules");
  const providers = await db.practitioner.findMany({
    where: { active: true, role: { in: ["physician", "resident"] } },
    orderBy: { name: "asc" },
    include: {
      scheduleSessions: { orderBy: [{ weekday: "asc" }, { startMin: "asc" }] },
      scheduleBlocks: { where: { end: { gte: new Date() } }, orderBy: { start: "asc" } },
    },
  });
  const current = providers.find((p) => p.id === sp.provider) ?? providers[0];

  return (
    <main className="flex h-full">
      <aside className="w-56 shrink-0 border-r border-line bg-panel py-3">
        <h2 className="px-4 pb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Providers</h2>
        {providers.map((p) => (
          <Link
            key={p.id}
            href={`/schedule/templates?provider=${p.id}`}
            className={`block border-l-[3px] px-4 py-1.5 ${p.id === current?.id ? "border-accent bg-accent-soft font-medium" : "border-transparent text-ink-2 hover:bg-panel-muted"}`}
          >
            {p.name}
            <span className="block text-[11px] text-ink-3">
              {p.scheduleSessions.length ? `${new Set(p.scheduleSessions.map((s) => s.weekday)).size} clinic days a week` : "Clinic standard hours"}
            </span>
          </Link>
        ))}
      </aside>
      {current && (
        <section className="min-w-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex items-baseline gap-3">
            <h1 className="text-xl font-semibold">
              {current.name}
              {current.credentials ? `, ${current.credentials}` : ""}
            </h1>
            <Link href={`/schedule?providers=${current.id}`} className="text-accent hover:underline">
              View schedule
            </Link>
          </div>

          <Panel title="Weekly sessions">
            {current.scheduleSessions.length === 0 ? (
              <Empty>
                No hours of their own yet, so {current.name} works the clinic&apos;s standard hours:{" "}
                {clinicHours.weekdays.map((d) => WEEKDAYS[d]).join(", ")}, {hhmm(clinicHours.startMin)} to {hhmm(clinicHours.endMin)}, {clinicHours.slotMinutes}-minute slots. Add
                sessions below to set different hours; once a provider has any, only theirs are used.
              </Empty>
            ) : (
              <table className="w-full">
                <thead className="text-left text-[11.5px] text-ink-3">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Day</th>
                    <th className="px-3 py-1.5 font-medium">Hours</th>
                    <th className="px-3 py-1.5 font-medium">Slot length</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {current.scheduleSessions.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="px-3 py-1.5 font-medium">{WEEKDAYS[s.weekday]}</td>
                      <td className="tabular px-3 py-1.5">
                        {hhmm(s.startMin)} to {hhmm(s.endMin)}
                      </td>
                      <td className="px-3 py-1.5">{s.slotMinutes} min</td>
                      <td className="px-3 py-1 text-right">
                        <ActionButton action={deleteSession.bind(null, s.id)} variant="danger" confirm="Remove this session? Booked appointments stay.">
                          Remove
                        </ActionButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <form action={addSession} className="flex flex-wrap items-end gap-3 border-t border-line bg-panel-muted p-3">
              <input type="hidden" name="practitionerId" value={current.id} />
              <fieldset className="flex items-center gap-2 pb-1">
                {WEEKDAYS.map((d, i) => (
                  <label key={d} className="flex items-center gap-1">
                    <input type="checkbox" name="weekday" value={i} defaultChecked={current.scheduleSessions.length === 0 && clinicHours.weekdays.includes(i)} />
                    {d}
                  </label>
                ))}
              </fieldset>
              <Field label="From">
                <input type="time" name="start" defaultValue={hhmm(clinicHours.startMin)} step={300} className={inputCls} />
              </Field>
              <Field label="To">
                <input type="time" name="end" defaultValue={hhmm(clinicHours.endMin)} step={300} className={inputCls} />
              </Field>
              <Field label="Slot length">
                <select name="slotMinutes" defaultValue="20" className={inputCls}>
                  {[5, 10, 15, 20, 30, 40, 60].map((m) => (
                    <option key={m} value={m}>
                      {m} min
                    </option>
                  ))}
                </select>
              </Field>
              <Button type="submit">Add session</Button>
            </form>
          </Panel>

          <Panel title="Blocked time">
            {current.scheduleBlocks.length === 0 ? (
              <Empty>Nothing blocked.</Empty>
            ) : (
              <ul>
                {current.scheduleBlocks.map((b) => (
                  <li key={b.id} className="flex items-center gap-3 border-t border-line px-3 py-1.5 first:border-t-0">
                    <span className="tabular w-72">
                      {fmtDate(b.start)} {fmtTime(b.start)} to {b.end.toDateString() === b.start.toDateString() ? "" : `${fmtDate(b.end)} `}
                      {fmtTime(b.end)}
                    </span>
                    <span className="font-medium">{b.reason}</span>
                    <span className="ml-auto">
                      <ActionButton action={deleteBlock.bind(null, b.id)} variant="danger">
                        Remove
                      </ActionButton>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <form action={addBlock} className="flex flex-wrap items-end gap-3 border-t border-line bg-panel-muted p-3">
              <input type="hidden" name="practitionerId" value={current.id} />
              <Field label="Date">
                <input type="date" name="date" required className={inputCls} />
              </Field>
              <Field label="From">
                <input type="time" name="start" defaultValue="12:00" step={900} className={inputCls} />
              </Field>
              <Field label="Until date (optional)">
                <input type="date" name="endDate" className={inputCls} />
              </Field>
              <Field label="To">
                <input type="time" name="end" defaultValue="13:00" step={900} className={inputCls} />
              </Field>
              <Field label="Reason">
                <input name="reason" placeholder="Meeting, vacation, admin time" className={inputCls} />
              </Field>
              <Button type="submit">Block time</Button>
            </form>
          </Panel>
        </section>
      )}
    </main>
  );
}
