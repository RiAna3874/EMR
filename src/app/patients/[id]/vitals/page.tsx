import Link from "next/link";
import { Hover } from "@/components/hover/hover-card";
import { ResultCard } from "@/components/hover/cards";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { pivot } from "@/lib/chart";
import { fmtDateTime, fmtShortDate, fmtTime, fmtValue, unitLabel } from "@/lib/format";
import { Empty } from "@/components/panel";
import { FlagBadge, flagText } from "@/components/flag";
import { Sparkline } from "@/components/sparkline";
import { Button, inputCls } from "@/components/form";
import { VitalsFields } from "@/components/vitals-fields";
import { TrendChart, type TrendSeries } from "@/components/trend-chart";
import { correctVitals, recordVitals } from "../actions";
import { VITALS_CHANGE_REASONS, vitalsFormValues } from "@/lib/vitals";
import { displayName } from "@/lib/roles";
import type { Flag } from "@prisma/client";
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

export default async function Vitals({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; error?: string; edit?: string; changed?: string }>;
}) {
  const { id } = await params;
  const currentUser = await requirePermission("viewClinical");
  await logChartView(id, "Vitals");
  const sp = await searchParams;
  const graph = sp.view === "graph";
  const [observations, removed] = await Promise.all([
    db.observation.findMany({
      where: { patientId: id, category: "vital_signs" },
      include: { corrections: { orderBy: { correctedAt: "asc" }, include: { correctedBy: { select: { name: true, credentials: true } } } } },
    }),
    // Single readings taken off the chart while fixing a set (whole sets marked in error aren't history of a fix).
    db.observation.findMany({ where: { patientId: id, category: "vital_signs", enteredInErrorAt: { not: null } }, orderBy: { enteredInErrorAt: "desc" }, take: 50 }),
  ]);
  const { times, rows } = pivot(observations);
  const cols = times.slice(0, MAX_COLUMNS);
  const lastHeight = rows.find((r) => r.code === "8302-2")?.values.at(-1);
  const record = recordVitals.bind(null, id);
  const canEdit = can(currentUser.role, "recordVitals");
  const byId = new Map(observations.map((o) => [o.id, o]));

  // The set being fixed, if any.
  const editAt = canEdit && sp.edit ? new Date(sp.edit) : null;
  const editSet = editAt && !Number.isNaN(editAt.getTime()) ? observations.filter((o) => o.effectiveAt.getTime() === editAt.getTime()) : [];

  // What changed: corrected numbers, readings added to a set later, and readings removed from one.
  const removedFromSet = removed.filter((r) => observations.some((o) => o.effectiveAt.getTime() === r.effectiveAt.getTime()));
  const staff = await db.practitioner.findMany({
    where: { id: { in: [...new Set(removedFromSet.map((r) => r.enteredInErrorById!).filter(Boolean))] } },
    select: { id: true, name: true, credentials: true },
  });
  const history = [
    ...observations.flatMap((o) =>
      o.corrections.map((c, i) => {
        const after = o.corrections[i + 1] ?? o;
        return { key: c.id, at: c.correctedAt, display: o.display, setAt: o.effectiveAt, what: <>changed from <s>{vitalWords(o.code, c)}</s> to {vitalWords(o.code, after)}</>, by: displayName(c.correctedBy), reason: c.reason };
      }),
    ),
    ...observations
      .filter((o) => o.correctedAt && !o.corrections.length)
      .map((o) => ({ key: o.id, at: o.correctedAt!, display: o.display, setAt: o.effectiveAt, what: <>added: {vitalWords(o.code, o)}</>, by: null, reason: null })),
    ...removedFromSet.map((r) => {
      const who = staff.find((p) => p.id === r.enteredInErrorById);
      return { key: r.id, at: r.enteredInErrorAt!, display: r.display, setAt: r.effectiveAt, what: <>removed: <s>{vitalWords(r.code, r)}</s></>, by: who ? displayName(who) : null, reason: r.enteredInErrorReason };
    }),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-4 p-4">
      {editSet.length > 0 && editAt && (
        <form id="edit-vitals" action={correctVitals.bind(null, id, editAt.toISOString())} className="rounded-md border border-warn/40 bg-warn-soft/30 p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
              Fix vitals from {fmtShortDate(editAt)} {fmtTime(editAt)}
            </h2>
            <span className="text-[11.5px] text-ink-3">Change a wrong number, or clear a box to remove that reading. The old values stay in the history below.</span>
          </div>
          {sp.error && <p className="mb-2 text-crit">{sp.error}</p>}
          <div className="flex flex-wrap items-end gap-2">
            <VitalsFields key={editAt.toISOString()} initial={vitalsFormValues(editSet)} />
          </div>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-ink-3">Why</span>
              <select name="reason" required defaultValue="" className={inputCls}>
                <option value="" disabled>
                  Choose
                </option>
                {VITALS_CHANGE_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label className="flex min-w-48 flex-1 flex-col gap-0.5">
              <span className="text-[11px] font-medium text-ink-3">Note (optional)</span>
              <input name="note" className={inputCls} />
            </label>
            <Button type="submit">Save changes</Button>
            <Link href={`/patients/${id}/vitals`} className="px-2 py-1 text-[12.5px] text-ink-2 hover:underline">
              Cancel
            </Link>
          </div>
        </form>
      )}

      {sp.changed && !sp.edit && <p className="rounded border border-accent/30 bg-accent-soft/40 px-3 py-1.5 text-[12.5px]">Vitals updated. The old values are kept in the history below.</p>}

      {canEdit && !editSet.length && (
        <form action={record} className="rounded-md border border-line bg-panel p-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Enter vitals</h2>
            <span className="text-[11.5px] text-ink-3">Recorded now. Leave any field blank to skip it.</span>
          </div>
          {sp.error && !sp.edit && <p className="mb-2 text-crit">{sp.error}</p>}
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
                    {canEdit && (
                      <Link href={`/patients/${id}/vitals?edit=${encodeURIComponent(new Date(t).toISOString())}#edit-vitals`} className="font-normal text-accent hover:underline">
                        Edit
                      </Link>
                    )}
                  </th>
                ))}
                <th className="px-3 py-2 text-left font-medium">Units</th>
                <th className="px-3 py-2 text-left font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const times = [...r.byTime.keys()].sort((a, b) => b - a);
                return (
                <tr key={r.code} className="border-t border-line hover:bg-accent-soft/30">
                  <td className="px-3 py-1.5">{r.display}</td>
                  {cols.map((t) => {
                    const o = r.byTime.get(t);
                    const older = times[times.indexOf(t) + 1];
                    return (
                      <Hover
                        as="td"
                        key={t}
                        className={`tabular px-3 py-1.5 text-right ${o ? flagText(o.flag) : ""}`}
                        card={o ? <ResultCard o={o} previous={older !== undefined ? r.byTime.get(older) : null} /> : null}
                      >
                        {o ? (
                          <>
                            {isGlucoseCode(r.code) && o.valueNum !== null ? o.valueNum.toFixed(1) : fmtValue(o)}
                            <FlagBadge flag={o.flag} />
                            {o.correctedAt && <ChangedMark code={r.code} obs={byId.get(o.id)} />}
                            {isGlucoseCode(r.code) && o.valueNum !== null && <div className="text-[11px] text-ink-3">{mmolToMg(o.valueNum)} mg/dL</div>}
                          </>
                        ) : (
                          <span className="text-ink-3">—</span>
                        )}
                      </Hover>
                    );
                  })}
                  <td className="px-3 py-1.5 text-ink-2">{unitLabel(r.unit)}</td>
                  <td className="px-3 py-1.5">
                    <Sparkline values={r.values} refLow={r.refLow} refHigh={r.refHigh} />
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
          {canEdit && (
            <div className="space-y-1 border-t border-line px-3 py-2">
              <div className="text-[11.5px] text-ink-3">To fix a wrong number or remove one reading, use Edit above its column. A whole set entered on the wrong patient can be removed:</div>
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

      {history.length > 0 && (
        <section className="rounded-md border border-line bg-panel px-3 py-2">
          <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Changes to vitals</h3>
          <ul className="space-y-1 text-[12.5px]">
            {history.map((h) => (
              <li key={h.key} className="flex flex-wrap gap-x-1.5">
                <span className="font-medium">{h.display}</span>
                <span className="text-ink-3">
                  ({fmtShortDate(h.setAt)} {fmtTime(h.setAt)})
                </span>
                <span className="tabular text-ink-2">{h.what}</span>
                <span className="text-ink-3">
                  {h.by ? `by ${h.by} ` : ""}on {fmtDateTime(h.at)}.{h.reason ? ` ${h.reason}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type StoredValue = { valueNum: number | null; valueText: string | null; unit: string | null; flag: Flag | null };

function vitalWords(code: string, o: StoredValue) {
  if (isGlucoseCode(code) && o.valueNum !== null) return `${o.valueNum.toFixed(1)} mmol/L (${mmolToMg(o.valueNum)} mg/dL)`;
  return `${fmtValue(o) || "blank"}${o.unit ? ` ${unitLabel(o.unit)}` : ""}`.trim();
}

// "C" for a vital fixed after it was filed, as on lab results; hovering shows what it was.
function ChangedMark({ code, obs }: { code: string; obs?: StoredValue & { corrections: StoredValue[] } }) {
  const first = obs?.corrections[0];
  const title = first ? `Corrected. First filed as ${vitalWords(code, first)}.` : "Added to this set later.";
  return (
    <span title={title} className="ml-1 inline-block rounded bg-warn-soft px-1 align-[1px] text-[9.5px] font-bold leading-[14px] text-warn">
      C
    </span>
  );
}
