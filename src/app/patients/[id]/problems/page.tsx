import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { fmtDateOnly } from "@/lib/format";
import { Empty } from "@/components/panel";
import { Button, Field, inputCls } from "@/components/form";
import { addProblem, linkToProblem, reactivateProblem, resolveProblem } from "../actions";
import { medLine, orderLine } from "@/lib/notes/problem-ap";
import { logChartView } from "@/lib/audit/server";

export default async function Problems({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await requirePermission("viewClinical");
  await logChartView(id, "Problems");
  const canEdit = can(currentUser.role, "editProblems");
  const [conditions, meds, orders] = await Promise.all([
    db.condition.findMany({ where: { patientId: id }, orderBy: [{ priority: "asc" }] }),
    db.medicationRequest.findMany({ where: { patientId: id, status: { in: ["active", "on_hold"] } }, orderBy: { drug: "asc" } }),
    db.serviceRequest.findMany({ where: { patientId: id, status: { in: ["pending", "signed"] } }, orderBy: { createdAt: "asc" } }),
  ]);
  const active = conditions.filter((c) => c.status === "active");
  const resolved = conditions.filter((c) => c.status === "resolved");
  // Medications and open orders, each linked to at most one active problem.
  const activeIds = new Set(active.map((c) => c.id));
  const items: LinkItem[] = [
    ...meds.map((m) => ({ key: `med:${m.id}`, kind: "Medication" as const, label: medLine(m).slice(2), conditionId: m.conditionId && activeIds.has(m.conditionId) ? m.conditionId : null })),
    ...orders.map((o) => ({ key: `order:${o.id}`, kind: o.type === "medication" ? ("Medication" as const) : ("Order" as const), label: orderLine(o).slice(2), conditionId: o.conditionId && activeIds.has(o.conditionId) ? o.conditionId : null })),
  ];
  const unlinked = items.filter((i) => !i.conditionId);

  return (
    <div className="space-y-4 p-4">
      <section className="rounded-md border border-line bg-panel">
        <header className="border-b border-line px-3 py-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
            Active problems <span className="font-normal text-ink-3">({active.length})</span>
          </h2>
        </header>
        {active.length === 0 ? (
          <Empty>No active problems.</Empty>
        ) : (
          <table className="w-full">
            <thead className="text-left text-[11.5px] text-ink-3">
              <tr>
                <th className="w-10 px-3 py-1.5 font-medium">#</th>
                <th className="px-3 py-1.5 font-medium">Problem</th>
                <th className="px-3 py-1.5 font-medium">ICD-10</th>
                <th className="px-3 py-1.5 font-medium">Onset</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {active.map((c, i) => (
                <tr key={c.id} className="border-t border-line align-top">
                  <td className="tabular px-3 py-1.5 text-ink-3">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{c.display}</div>
                    {c.comment && <div className="text-ink-2">{c.comment}</div>}
                    <LinkedItems patientId={id} problem={c} items={items} canEdit={canEdit} />
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[12px]">{c.code}</td>
                  <td className="tabular px-3 py-1.5 text-ink-2">{fmtDateOnly(c.onset)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {canEdit && (
                      <form action={resolveProblem.bind(null, id, c.id)}>
                        <Button variant="ghost">Resolve</Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {unlinked.length > 0 && (
        <section className="rounded-md border border-line bg-panel">
          <header className="border-b border-line px-3 py-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
              Not linked to a problem <span className="font-normal text-ink-3">({unlinked.length})</span>
            </h2>
            <p className="text-[11.5px] text-ink-3">These show under &ldquo;Other&rdquo; in a note&apos;s assessment and plan. Link them from a problem above.</p>
          </header>
          <ul>
            {unlinked.map((i) => (
              <li key={i.key} className="flex gap-2 border-t border-line px-3 py-1.5 first:border-t-0">
                <span className="w-20 shrink-0 text-[11.5px] text-ink-3">{i.kind}</span>
                <span>{i.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {canEdit && (
        <form action={addProblem.bind(null, id)} className="rounded-md border border-line bg-panel p-3">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Add problem</h2>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Problem" className="min-w-64 flex-1">
              <input name="display" required placeholder="e.g. Essential hypertension" className={inputCls} />
            </Field>
            <Field label="ICD-10">
              <input name="code" placeholder="I10" className={`${inputCls} w-24 font-mono`} />
            </Field>
            <Field label="Onset">
              <input name="onset" type="date" className={inputCls} />
            </Field>
            <Field label="Comment">
              <input name="comment" className={`${inputCls} w-56`} />
            </Field>
            <Button type="submit">Add</Button>
          </div>
        </form>
      )}

      <section className="rounded-md border border-line bg-panel">
        <header className="border-b border-line px-3 py-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
            Resolved <span className="font-normal text-ink-3">({resolved.length})</span>
          </h2>
        </header>
        {resolved.length === 0 ? (
          <Empty>No resolved problems.</Empty>
        ) : (
          <table className="w-full text-ink-2">
            <tbody>
              {resolved.map((c) => (
                <tr key={c.id} className="border-t border-line first:border-t-0">
                  <td className="px-3 py-1.5">{c.display}</td>
                  <td className="px-3 py-1.5 font-mono text-[12px]">{c.code}</td>
                  <td className="tabular px-3 py-1.5">
                    {fmtDateOnly(c.onset)} – {fmtDateOnly(c.resolvedAt)}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    {canEdit && (
                      <form action={reactivateProblem.bind(null, id, c.id)}>
                        <Button variant="ghost">Reactivate</Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

type LinkItem = { key: string; kind: "Medication" | "Order"; label: string; conditionId: string | null };

// A problem's linked medications and orders, with unlink, and a picker to link more.
function LinkedItems({ patientId, problem, items, canEdit }: { patientId: string; problem: { id: string; display: string }; items: LinkItem[]; canEdit: boolean }) {
  const linked = items.filter((i) => i.conditionId === problem.id);
  const others = items.filter((i) => i.conditionId !== problem.id);
  if (!linked.length && (!canEdit || !others.length)) return null;
  return (
    <div className="mt-1 space-y-1">
      {linked.length > 0 && (
        <ul className="border-l-2 border-line pl-2 text-[12.5px]">
          {linked.map((i) => (
            <li key={i.key} className="flex items-center gap-2">
              <span className="w-20 shrink-0 text-[11.5px] text-ink-3">{i.kind}</span>
              <span className="text-ink-2">{i.label}</span>
              {canEdit && (
                <form action={linkToProblem.bind(null, patientId, null)}>
                  <input type="hidden" name="item" value={i.key} />
                  <button className="text-[11.5px] text-ink-3 hover:text-crit hover:underline" aria-label={`Unlink ${i.label} from ${problem.display}`}>
                    Unlink
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && others.length > 0 && (
        <form action={linkToProblem.bind(null, patientId, problem.id)} className="flex items-center gap-1.5">
          <select name="item" required defaultValue="" className={`${inputCls} max-w-80 py-0.5 text-[12px]`} aria-label={`Link a medication or order to ${problem.display}`}>
            <option value="" disabled>
              Link a medication or order…
            </option>
            {(["Medication", "Order"] as const).map((kind) =>
              others.some((i) => i.kind === kind) ? (
                <optgroup key={kind} label={kind === "Medication" ? "Medications" : "Orders"}>
                  {others
                    .filter((i) => i.kind === kind)
                    .map((i) => (
                      <option key={i.key} value={i.key}>
                        {i.label}
                        {i.conditionId ? " (moves from another problem)" : ""}
                      </option>
                    ))}
                </optgroup>
              ) : null,
            )}
          </select>
          <Button variant="ghost">Link</Button>
        </form>
      )}
    </div>
  );
}
