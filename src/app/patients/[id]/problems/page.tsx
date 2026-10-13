import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { fmtDateOnly } from "@/lib/format";
import { Empty } from "@/components/panel";
import { Button, Field, inputCls } from "@/components/form";
import { addProblem, reactivateProblem, resolveProblem } from "../actions";
import { logChartView } from "@/lib/audit/server";

export default async function Problems({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await requirePermission("viewClinical");
  await logChartView(id, "Problems");
  const canEdit = can(currentUser.role, "editProblems");
  const conditions = await db.condition.findMany({ where: { patientId: id }, orderBy: [{ priority: "asc" }] });
  const active = conditions.filter((c) => c.status === "active");
  const resolved = conditions.filter((c) => c.status === "resolved");

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
                <tr key={c.id} className="border-t border-line">
                  <td className="tabular px-3 py-1.5 text-ink-3">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    <div className="font-medium">{c.display}</div>
                    {c.comment && <div className="text-ink-2">{c.comment}</div>}
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
