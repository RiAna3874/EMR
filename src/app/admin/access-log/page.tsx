import Link from "next/link";
import { baseDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { displayName, roleLabel } from "@/lib/roles";
import { fmtDateTime, fullName } from "@/lib/format";
import { AUDIT_ACTIONS, isAuditAction } from "@/lib/audit/labels";
import { ACTION_GROUPS, logWhere, namesFor, type LogFilters } from "@/lib/audit/query";
import { Button, inputCls } from "@/components/form";

export const metadata = { title: "Access log" };
export const dynamic = "force-dynamic";

const PAGE = 100;

// Who opened, printed or changed which chart, and every sign-in. For answering a patient's
// "who looked at my record?" and for spotting snooping. Entries can't be edited or deleted.
export default async function AccessLog({ searchParams }: { searchParams: Promise<LogFilters & { before?: string }> }) {
  await requireAdmin();
  const f = await searchParams;
  const { where, patientIds } = await logWhere(f);
  const before = f.before ? new Date(f.before) : null;
  const rows = await baseDb.auditEvent.findMany({
    where: { ...where, ...(before && !isNaN(before.getTime()) ? { at: { ...(where.at as object), lt: before } } : {}) },
    orderBy: [{ at: "desc" }, { id: "desc" }],
    take: PAGE + 1,
  });
  const more = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const [{ actors, patients }, staff, onePatient] = await Promise.all([
    namesFor(page),
    baseDb.practitioner.findMany({ where: { username: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, username: true } }),
    f.patient ? baseDb.patient.findUnique({ where: { id: f.patient }, select: { firstName: true, lastName: true, mrn: true } }) : null,
  ]);

  const qs = (extra: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ patient: f.patient, q: f.q, user: f.user, action: f.action, from: f.from, to: f.to, ...extra })) if (v) p.set(k, v);
    return p.toString();
  };

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <h1 className="text-[16px] font-semibold">Access log</h1>
        <p className="mb-4 text-[12.5px] text-ink-2">
          Every time someone opens, prints or changes a chart, and every sign-in. Entries can&apos;t be edited or deleted. Times are the clinic&apos;s time zone.
        </p>

        <form className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-line bg-panel p-3 text-[12.5px]">
          {f.patient ? (
            <span className="flex items-center gap-2 rounded bg-accent-soft px-2 py-1 text-accent">
              <input type="hidden" name="patient" value={f.patient} />
              Patient: {onePatient ? `${fullName(onePatient)} · ${onePatient.mrn}` : "removed"}
              <Link href={`/admin/access-log?${qs({ patient: undefined })}`} className="text-ink-3 hover:text-crit" aria-label="Clear patient">
                ×
              </Link>
            </span>
          ) : (
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-ink-3">Patient name or MRN</span>
              <input name="q" defaultValue={f.q} className={`${inputCls} w-48`} />
            </label>
          )}
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-ink-3">Staff member</span>
            <select name="user" defaultValue={f.user ?? ""} className={inputCls}>
              <option value="">Anyone</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.username})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-ink-3">What</span>
            <select name="action" defaultValue={f.action ?? ""} className={inputCls}>
              <option value="">Everything</option>
              {Object.entries(ACTION_GROUPS).map(([k, g]) => (
                <option key={k} value={k}>
                  {g.label}
                </option>
              ))}
              <optgroup label="Only">
                {Object.entries(AUDIT_ACTIONS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-ink-3">From</span>
            <input type="date" name="from" defaultValue={f.from} className={inputCls} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span className="text-[11px] font-medium text-ink-3">To</span>
            <input type="date" name="to" defaultValue={f.to} className={inputCls} />
          </label>
          <Button type="submit">Show</Button>
          <Link href="/admin/access-log" className="px-1 py-1 text-ink-3 hover:underline">
            Clear
          </Link>
          <a href={`/admin/access-log/export?${qs({})}`} className="ml-auto rounded border border-line px-2.5 py-1 font-medium text-ink hover:bg-panel-muted">
            Download CSV
          </a>
        </form>

        {patientIds && patientIds.length === 0 ? (
          <p className="rounded-md border border-line bg-panel px-3 py-6 text-center text-ink-3">No patient matches &ldquo;{f.q}&rdquo;.</p>
        ) : page.length === 0 ? (
          <p className="rounded-md border border-line bg-panel px-3 py-6 text-center text-ink-3">Nothing in the log matches.</p>
        ) : (
          <table className="w-full overflow-hidden rounded-md border border-line bg-panel text-[12.5px]">
            <thead className="bg-panel-muted text-left text-[11.5px] text-ink-3">
              <tr>
                <th className="px-3 py-1.5 font-medium">When</th>
                <th className="px-3 py-1.5 font-medium">Who</th>
                <th className="px-3 py-1.5 font-medium">Did</th>
                <th className="px-3 py-1.5 font-medium">Patient</th>
                <th className="px-3 py-1.5 font-medium">Details</th>
                <th className="px-3 py-1.5 font-medium">From</th>
              </tr>
            </thead>
            <tbody>
              {page.map((r) => {
                const a = r.actorId ? actors.get(r.actorId) : null;
                const p = r.patientId ? patients.get(r.patientId) : null;
                const failed = r.action === "sign_in_failed" || r.action === "two_step_failed";
                return (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">{fmtDateTime(r.at)}</td>
                    <td className="px-3 py-1.5">
                      {a ? (
                        <Link href={`/admin/access-log?${qs({ user: r.actorId!, before: undefined })}`} className="hover:underline">
                          {displayName(a)}
                        </Link>
                      ) : (
                        <span className="text-ink-3">{r.actorName ?? "Unknown"}</span>
                      )}
                      {a && <span className="block text-[11px] text-ink-3">{roleLabel[a.role]}</span>}
                    </td>
                    <td className={`px-3 py-1.5 ${failed ? "font-medium text-crit" : ""}`}>
                      {isAuditAction(r.action) ? AUDIT_ACTIONS[r.action] : r.action} <span className="text-ink-2">{r.subject}</span>
                    </td>
                    <td className="px-3 py-1.5">
                      {p ? (
                        <Link href={`/admin/access-log?${qs({ patient: r.patientId!, q: undefined, before: undefined })}`} className="hover:underline">
                          {fullName(p)} <span className="font-mono text-[11.5px] text-ink-3">{p.mrn}</span>
                        </Link>
                      ) : r.patientId ? (
                        <span className="text-ink-3">Removed chart</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-1.5 text-ink-2">{r.detail}</td>
                    <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-3">{r.ip}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {more && (
          <div className="mt-3 text-center">
            <Link href={`/admin/access-log?${qs({ before: page[page.length - 1].at.toISOString() })}`} className="text-accent hover:underline">
              Older entries
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
