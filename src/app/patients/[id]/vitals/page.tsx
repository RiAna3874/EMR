import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { pivot } from "@/lib/chart";
import { fmtShortDate, fmtTime, fmtValue, unitLabel } from "@/lib/format";
import { Empty } from "@/components/panel";
import { FlagBadge, flagText } from "@/components/flag";
import { Sparkline } from "@/components/sparkline";
import { Button } from "@/components/form";
import { VitalsFields } from "@/components/vitals-fields";
import { TrendChart, type TrendSeries } from "@/components/trend-chart";
import { recordVitals } from "../actions";
import { logChartView } from "@/lib/audit/server";
import { EnteredInError } from "@/components/entered-in-error";
import { markVitalsInError } from "../error-actions";
import { GLUCOSE_CODES, isGlucoseCode, mmolToMg } from "@/lib/glucose";

const MAX_COLUMNS = 8;

// Graphs on the vitals flowsheet; BP draws systolic and diastolic together.
const GRAPHS: { title: string; codes: string[]; unit: string; low?: number; high?: number }[] = [
  { title: "Blood pressure", codes: ["8480-6", "8462-4"], unit: "mmHg" },
  { title: "Heart rate", codes: ["8867-4"], unit: "/min", low: 60, high: 100 },
  { title: "Weight", codes: ["29463-7"], unit: "kg" },
  { title: "BMI", codes: ["39156-5"], unit: "kg/m²", low: 18.5, high: 24.9 },
  { title: "SpO₂", codes: ["59408-5"], unit: "%", low: 95, high: 100 },
  { title: "Temperature", codes: ["8310-5"], unit: "°C", low: 36.1, high: 37.8 },
  { title: "POC glucose", codes: GLUCOSE_CODES, unit: "mmol/L", low: 3.9, high: 7.8 },
];

export default async function Vitals({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ view?: string; error?: string }> }) {
  const { id } = await params;
  const currentUser = await requirePermission("viewClinical");
  await logChartView(id, "Vitals");
  const sp = await searchParams;
  const graph = sp.view === "graph";
  const observations = await db.observation.findMany({ where: { patientId: id, category: "vital_signs" } });
  const { times, rows } = pivot(observations);
  const cols = times.slice(0, MAX_COLUMNS);
  const lastHeight = rows.find((r) => r.code === "8302-2")?.values.at(-1);
  const record = recordVitals.bind(null, id);

  return (
    <div className="space-y-4 p-4">
      {can(currentUser.role, "recordVitals") && (
        <form action={record} className="rounded-md border border-line bg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Enter vitals</h2>
            <span className="text-[11.5px] text-ink-3">Recorded now. Leave any field blank to skip it.</span>
          </div>
          {sp.error && <p className="mb-2 text-crit">{sp.error}</p>}
          <div className="flex flex-wrap items-end gap-2">
            <VitalsFields lastHeight={lastHeight} />
            <Button type="submit">File vitals</Button>
          </div>
        </form>
      )}

      <div className="flex overflow-hidden rounded border border-line bg-panel text-[12.5px] w-fit">
        <Link href={`/patients/${id}/vitals`} className={`px-3 py-1 ${!graph ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}>
          Flowsheet
        </Link>
        <Link href={`/patients/${id}/vitals?view=graph`} className={`border-l border-line px-3 py-1 ${graph ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}>
          Graph
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-line bg-panel">
          <Empty>No vitals recorded.</Empty>
        </div>
      ) : graph ? (
        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
          {GRAPHS.map((g) => {
            const series: TrendSeries[] = g.codes.flatMap((code) => {
              const row = rows.find((r) => r.code === code);
              if (!row) return [];
              const points = [...row.byTime.values()]
                .filter((o) => o.valueNum !== null)
                .map((o) => ({ t: o.effectiveAt.getTime(), v: o.valueNum!, flag: o.flag }));
              return [{ name: row.display, points }];
            });
            if (!series.length) return null;
            return (
              <section key={g.title} className="rounded-md border border-line bg-panel">
                <header className="border-b border-line px-3 py-2 font-semibold">{g.title}</header>
                <div className="px-2 py-2">
                  <TrendChart series={series} unit={g.unit} refLow={g.low} refHigh={g.high} height={180} />
                </div>
              </section>
            );
          })}
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
                            {isGlucoseCode(r.code) && o.valueNum !== null ? o.valueNum.toFixed(1) : fmtValue(o)}
                            <FlagBadge flag={o.flag} />
                            {isGlucoseCode(r.code) && o.valueNum !== null && <div className="text-[11px] text-ink-3">{mmolToMg(o.valueNum)} mg/dL</div>}
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
          {can(currentUser.role, "recordVitals") && (
            <div className="space-y-1 border-t border-line px-3 py-2">
              <div className="text-[11.5px] text-ink-3">A set of vitals entered on the wrong patient or mistyped can be removed:</div>
              {cols.map((t) => (
                <div key={t} className="flex items-start gap-2">
                  <span className="tabular w-36 shrink-0 pt-0.5 text-[12px] text-ink-2">
                    {fmtShortDate(new Date(t))} {fmtTime(new Date(t))}
                  </span>
                  <EnteredInError action={markVitalsInError.bind(null, id, new Date(t).toISOString())} what="these vitals" />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
