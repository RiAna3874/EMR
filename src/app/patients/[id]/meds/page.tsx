import type { MedStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { fmtDateOnly } from "@/lib/format";
import { Empty } from "@/components/panel";
import { Button, Field, inputCls } from "@/components/form";
import { addMed, discontinueMed, holdMed } from "../actions";

const groups: { status: MedStatus[]; title: string }[] = [
  { status: ["active", "on_hold"], title: "Current medications" },
  { status: ["discontinued", "completed"], title: "Discontinued and completed" },
];

export default async function Meds({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const meds = await db.medicationRequest.findMany({
    where: { patientId: id },
    orderBy: [{ drug: "asc" }],
    include: { prescriber: true },
  });

  return (
    <div className="space-y-4 p-4">
      {groups.map((g) => {
        const list = meds.filter((m) => g.status.includes(m.status));
        return (
          <section key={g.title} className="overflow-x-auto rounded-md border border-line bg-panel">
            <header className="flex items-center justify-between border-b border-line px-3 py-2">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
                {g.title} <span className="font-normal text-ink-3">({list.length})</span>
              </h2>
            </header>
            {list.length === 0 ? (
              <Empty>None.</Empty>
            ) : (
              <table className="w-full min-w-[860px]">
                <thead className="text-left text-[11.5px] text-ink-3">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Medication</th>
                    <th className="px-3 py-1.5 font-medium">Sig</th>
                    <th className="px-3 py-1.5 font-medium">Indication</th>
                    <th className="px-3 py-1.5 font-medium">Start</th>
                    <th className="px-3 py-1.5 font-medium">{g.status[0] === "active" ? "Prescriber" : "End"}</th>
                    <th className="px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {list.map((m) => (
                    <tr key={m.id} className={`border-t border-line ${m.status === "discontinued" ? "text-ink-3" : ""}`}>
                      <td className="px-3 py-1.5">
                        <span className={`font-medium ${m.status === "discontinued" ? "line-through" : ""}`}>{m.drug}</span>
                        {m.status === "on_hold" && (
                          <span className="ml-1.5 rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-warn">ON HOLD</span>
                        )}
                        {m.rxnorm && <div className="font-mono text-[11px] text-ink-3">RxNorm {m.rxnorm}</div>}
                      </td>
                      <td className="px-3 py-1.5">
                        {m.dose} {m.route}, {m.frequency}
                      </td>
                      <td className="px-3 py-1.5 text-ink-2">{m.indication}</td>
                      <td className="tabular px-3 py-1.5 text-ink-2">{fmtDateOnly(m.start)}</td>
                      <td className="px-3 py-1.5 text-ink-2">
                        {g.status[0] === "active" ? m.prescriber?.name : fmtDateOnly(m.end)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-1.5 text-right">
                        {m.status === "active" && (
                          <form action={holdMed.bind(null, id, m.id, true)} className="inline">
                            <Button variant="ghost">Hold</Button>
                          </form>
                        )}
                        {m.status === "on_hold" && (
                          <form action={holdMed.bind(null, id, m.id, false)} className="inline">
                            <Button variant="ghost">Resume</Button>
                          </form>
                        )}
                        {(m.status === "active" || m.status === "on_hold") && (
                          <form action={discontinueMed.bind(null, id, m.id)} className="inline">
                            <Button variant="danger">Discontinue</Button>
                          </form>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        );
      })}

      <form action={addMed.bind(null, id)} className="rounded-md border border-line bg-panel p-3">
        <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Add medication</h2>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Medication" className="min-w-64 flex-1">
            <input name="drug" required placeholder="e.g. Amlodipine 5 mg tablet" className={inputCls} />
          </Field>
          <Field label="Dose">
            <input name="dose" required placeholder="5 mg" className={`${inputCls} w-24`} />
          </Field>
          <Field label="Route">
            <select name="route" className={inputCls} defaultValue="oral">
              {["oral", "inhaled", "subcutaneous", "intramuscular", "topical", "intravenous", "sublingual"].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Frequency">
            <input name="frequency" required placeholder="once daily" className={`${inputCls} w-36`} />
          </Field>
          <Field label="Indication">
            <input name="indication" className={`${inputCls} w-40`} />
          </Field>
          <Button type="submit">Add</Button>
        </div>
      </form>
    </div>
  );
}
