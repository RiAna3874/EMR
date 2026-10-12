import { db } from "@/lib/db";
import { pivot } from "@/lib/chart";
import { fmtShortDate, fmtTime, fmtValue, unitLabel } from "@/lib/format";
import { Empty } from "@/components/panel";
import { FlagBadge, flagText } from "@/components/flag";
import { Sparkline } from "@/components/sparkline";
import { Button, Field, inputCls } from "@/components/form";
import { recordVitals } from "../actions";

const MAX_COLUMNS = 8;

export default async function Vitals({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const observations = await db.observation.findMany({ where: { patientId: id, category: "vital_signs" } });
  const { times, rows } = pivot(observations);
  const cols = times.slice(0, MAX_COLUMNS);
  const lastHeight = rows.find((r) => r.code === "8302-2")?.values.at(-1);
  const record = recordVitals.bind(null, id);

  return (
    <div className="space-y-4 p-4">
      <form action={record} className="rounded-md border border-line bg-panel p-3">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Enter vitals</h2>
          <span className="text-[11.5px] text-ink-3">Recorded now. Leave any field blank to skip it.</span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field label="BP (mmHg)">
            <div className="flex items-center gap-1">
              <input name="sbp" inputMode="numeric" placeholder="120" className={`${inputCls} w-14`} />
              <span className="text-ink-3">/</span>
              <input name="dbp" inputMode="numeric" placeholder="80" className={`${inputCls} w-14`} />
            </div>
          </Field>
          <Field label="HR (/min)">
            <input name="hr" inputMode="numeric" className={`${inputCls} w-16`} />
          </Field>
          <Field label="RR (/min)">
            <input name="rr" inputMode="numeric" className={`${inputCls} w-16`} />
          </Field>
          <Field label="Temp (°C)">
            <input name="temp" inputMode="decimal" className={`${inputCls} w-16`} />
          </Field>
          <Field label="SpO₂ (%)">
            <input name="spo2" inputMode="numeric" className={`${inputCls} w-16`} />
          </Field>
          <Field label="Weight (kg)">
            <input name="weight" inputMode="decimal" className={`${inputCls} w-20`} />
          </Field>
          <Field label="Height (cm)">
            <input name="height" inputMode="decimal" defaultValue={lastHeight ?? ""} className={`${inputCls} w-20`} />
          </Field>
          <Field label="Pain (0–10)">
            <input name="pain" inputMode="numeric" className={`${inputCls} w-16`} />
          </Field>
          <Button type="submit">File vitals</Button>
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="rounded-md border border-line bg-panel">
          <Empty>No vitals recorded.</Empty>
        </div>
      ) : (
        <section className="overflow-x-auto rounded-md border border-line bg-panel">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="bg-panel-muted text-[11.5px] text-ink-3">
                <th className="w-44 px-3 py-2 text-left text-[12.5px] font-semibold text-ink">Flowsheet</th>
                {cols.map((t) => (
                  <th key={t} className="tabular px-3 py-2 text-right font-medium">
                    {fmtShortDate(new Date(t))}
                    <div className="font-normal">{fmtTime(new Date(t))}</div>
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-medium">Units</th>
                <th className="px-3 py-2 text-left font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.code} className="border-t border-line hover:bg-accent-soft/30">
                  <td className="px-3 py-1.5">{r.display}</td>
                  {cols.map((t) => {
                    const o = r.byTime.get(t);
                    return (
                      <td key={t} className={`tabular px-3 py-1.5 text-right ${o ? flagText(o.flag) : ""}`}>
                        {o ? (
                          <>
                            {fmtValue(o)}
                            <FlagBadge flag={o.flag} />
                          </>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-1.5 text-ink-2">{unitLabel(r.unit)}</td>
                  <td className="px-3 py-1.5">
                    <Sparkline values={r.values} refLow={r.refLow} refHigh={r.refHigh} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
