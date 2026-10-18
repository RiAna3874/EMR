import Link from "next/link";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { logChartView } from "@/lib/audit/server";
import { loadBloodSugar, type SugarDayCell } from "@/lib/labs/sugar-load";
import { sugarLabel, sugarShort } from "@/lib/labs/groups";
import { mmolToMg } from "@/lib/glucose";
import { fmtDate, fmtDateTime, fmtDayShort, fmtTime, fmtValue, toLocalDate } from "@/lib/format";
import { Empty } from "@/components/panel";
import { FlagBadge, flagText, flagTitle } from "@/components/flag";
import { TrendChart } from "@/components/trend-chart";
import { AddSugarNote, SugarNote } from "@/components/sugar-note";

const RANGES = { "1m": 31, "3m": 91, "1y": 365, all: 0 } as const;
const RANGE_LABEL: Record<keyof typeof RANGES, string> = { "1m": "1 month", "3m": "3 months", "1y": "1 year", all: "All time" };
const MAX_DAYS = 31;

// The Blood sugar tab, in mmol/L: one row per day with the fasting sugar and the sugar 2 hours
// after breakfast side by side, the rise between them, and a note for the day; a graph of both
// trends above. Readings come from lab results and from the fingerstick glucose in Vitals.
// Random readings and same-day repeats are listed under "Other readings".
export default async function BloodSugar({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ range?: string; dates?: string }>;
}) {
  const { id } = await params;
  const user = await requirePermission("viewClinical");
  await logChartView(id, "Blood sugar");
  const sp = await searchParams;
  const base = `/patients/${id}/sugar`;
  const chart = `/patients/${id}`;
  const canNote = can(user.role, "recordVitals");
  const today = toLocalDate(new Date());

  const { cells, days: allDays, others: allOthers, a1c, a1cCode } = await loadBloodSugar(id);
  const range = sp.range && sp.range in RANGES ? (sp.range as keyof typeof RANGES) : "all";
  const cutoff = RANGES[range] ? toLocalDate(new Date(Date.now() - RANGES[range] * 86_400_000)) : "";
  const days = allDays.filter((d) => d.day >= cutoff);
  const others = allOthers.filter((c) => toLocalDate(c.obs.effectiveAt) >= cutoff);
  const shownDays = sp.dates === "all" ? days : days.slice(0, MAX_DAYS);

  const href = (next: { range?: string; dates?: string }) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries({ range: sp.range, dates: sp.dates, ...next })) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const opened = (c: SugarDayCell) => (c.reportId ? `${chart}/results?view=reports&report=${c.reportId}` : `${chart}/vitals`);
  const pill = (on: boolean) => `border-l border-line px-2.5 py-0.5 first:border-l-0 ${on ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`;
  const latest = (t: "fasting" | "post_meal") => cells.filter((c) => c.timing === t).at(-1);
  const series = [
    { name: "Fasting (FBS)", points: days.flatMap((d) => (d.fasting ? [d.fasting] : [])) },
    { name: "2 hours after breakfast (2HABF)", points: days.flatMap((d) => (d.afterBreakfast ? [d.afterBreakfast] : [])) },
  ]
    .map((s) => ({ ...s, points: s.points.reverse().map((c) => ({ t: c.obs.effectiveAt.getTime(), v: c.mmol, flag: c.flag, imported: c.imported, href: opened(c) })) }))
    .filter((s) => s.points.length > 0);

  const reading = (c: SugarDayCell | undefined) =>
    c ? (
      <Link
        href={opened(c)}
        className="group block"
        title={`${sugarLabel(c.timing)}, ${c.source === "fingerstick" ? "fingerstick (Vitals)" : "lab"}: ${c.mmol.toFixed(1)} mmol/L (${mmolToMg(c.mmol)} mg/dL)${c.flag && c.flag !== "N" ? `, ${flagTitle(c.flag).toLowerCase()}` : ""}`}
      >
        <span className={`tabular text-[15px] font-semibold group-hover:underline ${flagText(c.flag)}`}>{c.mmol.toFixed(1)}</span>
        {c.source === "fingerstick" && <span className="text-ink-3">°</span>}
        <FlagBadge flag={c.flag} />
        {c.obs.correctedAt && <span className="ml-1 text-[10.5px] font-semibold text-warn">C</span>}
        <div className="tabular text-[11.5px] text-ink-3">
          {mmolToMg(c.mmol)} mg/dL · {fmtTime(c.obs.effectiveAt)} · {c.source === "fingerstick" ? "Vitals" : c.imported ? "outside lab" : "lab"}
        </div>
      </Link>
    ) : (
      <span className="text-ink-3">—</span>
    );

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold">Blood sugar</h1>
        <span className="text-[12.5px] text-ink-3">Fasting and 2 hours after breakfast, in mmol/L, from lab results and Vitals</span>
        <Link href={`${chart}/vitals`} className="ml-auto text-[12.5px] font-medium text-accent hover:underline">
          Record a fingerstick reading in Vitals →
        </Link>
      </div>

      {cells.length === 0 && allDays.length === 0 ? (
        <div className="rounded-md border border-line bg-panel">
          <Empty>No blood sugar readings on file. Fingerstick readings recorded in Vitals and lab glucose results show here.</Empty>
          {canNote && (
            <div className="border-t border-line px-3 py-2">
              <AddSugarNote patientId={id} today={today} />
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {(["fasting", "post_meal"] as const).map((t) => {
              const c = latest(t);
              return (
                <div key={t} className="rounded-md border border-line bg-panel px-3 py-2">
                  <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
                    Latest {sugarLabel(t).toLowerCase()} ({sugarShort(t)})
                  </div>
                  {c ? (
                    <>
                      <div className={`tabular text-[20px] font-semibold ${flagText(c.flag)}`}>
                        {c.mmol.toFixed(1)}
                        <span className="ml-1 text-[12px] font-normal text-ink-3">mmol/L</span>
                        <FlagBadge flag={c.flag} />
                      </div>
                      <div className="text-[12px] text-ink-3">
                        {mmolToMg(c.mmol)} mg/dL · {fmtDate(c.obs.effectiveAt)} · {c.source === "fingerstick" ? "Vitals" : "lab"}
                      </div>
                    </>
                  ) : (
                    <div className="py-1 text-ink-3">None recorded</div>
                  )}
                </div>
              );
            })}
            <div className="rounded-md border border-line bg-panel px-3 py-2">
              <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Latest HbA1c</div>
              {a1c ? (
                <>
                  <div className={`tabular text-[20px] font-semibold ${flagText(a1c.flag)}`}>
                    {fmtValue(a1c)}
                    <span className="ml-1 text-[12px] font-normal text-ink-3">%</span>
                    <FlagBadge flag={a1c.flag} />
                  </div>
                  <div className="text-[12px] text-ink-3">
                    {fmtDate(a1c.effectiveAt)} ·{" "}
                    <Link href={`${chart}/results?view=graph&codes=${encodeURIComponent(a1cCode!)}`} className="text-accent hover:underline">
                      trend
                    </Link>
                  </div>
                </>
              ) : (
                <div className="py-1 text-ink-3">None on file</div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3 text-[12px]">
            <span className="text-ink-3">Show</span>
            <div className="flex overflow-hidden rounded border border-line bg-panel">
              {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
                <Link key={k} href={href({ range: k === "all" ? undefined : k, dates: undefined })} className={pill(range === k)}>
                  {RANGE_LABEL[k]}
                </Link>
              ))}
            </div>
          </div>

          <section className="rounded-md border border-line bg-panel">
            <header className="flex items-baseline gap-3 border-b border-line px-3 py-2">
              <h2 className="font-semibold">Trend</h2>
              <span className="text-[11.5px] text-ink-3">
                Shaded band 3.9–7.8 mmol/L (normal 2 hours after breakfast) · dashed line 5.5 (fasting limit) · diamonds are outside reports · click a point to open it
              </span>
            </header>
            <div className="px-2 py-2">
              {series.length ? (
                <TrendChart marks={[{ v: 5.5, label: "Fasting limit 5.5" }]} height={260} unit="mmol/L" refLow={3.9} refHigh={7.8} series={series} />
              ) : (
                <div className="py-8 text-center text-ink-3">No fasting or 2-hour readings in this period.</div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-md border border-line bg-panel">
            <header className="flex items-baseline gap-3 border-b border-line bg-panel-muted px-3 py-2">
              <h2 className="font-semibold">By day</h2>
              <span className="text-[11.5px] text-ink-3">Newest first · mmol/L · ° fingerstick from Vitals · C corrected</span>
              <span className="ml-auto">{canNote && <AddSugarNote patientId={id} today={today} />}</span>
            </header>
            {shownDays.length === 0 ? (
              <Empty>No fasting or 2-hour readings in this period.</Empty>
            ) : (
              <table className="w-full table-fixed">
                <colgroup>
                  <col className="w-40" />
                  <col className="w-56" />
                  <col className="w-56" />
                  <col className="w-24" />
                  <col />
                </colgroup>
                <thead className="text-left text-[11.5px] text-ink-3">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Date</th>
                    <th className="px-3 py-1.5 font-medium">Fasting (FBS)</th>
                    <th className="px-3 py-1.5 font-medium">2 hours after breakfast (2HABF)</th>
                    <th className="px-3 py-1.5 font-medium" title="2-hour sugar minus fasting sugar">
                      Rise
                    </th>
                    <th className="px-3 py-1.5 font-medium">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {shownDays.map((d) => {
                    const date = new Date(`${d.day}T12:00:00`);
                    return (
                      <tr key={d.day} className="border-t border-line align-top hover:bg-accent-soft/20">
                        <td className="tabular px-3 py-2">
                          <div className="font-medium">{fmtDayShort(date)}</div>
                          <div className="text-[11.5px] text-ink-3">{date.getFullYear()}</div>
                        </td>
                        <td className="px-3 py-2">{reading(d.fasting)}</td>
                        <td className="px-3 py-2">{reading(d.afterBreakfast)}</td>
                        <td className="tabular px-3 py-2 text-ink-2">
                          {d.rise === undefined ? <span className="text-ink-3">—</span> : `${d.rise > 0 ? "+" : ""}${d.rise.toFixed(1)}`}
                        </td>
                        <td className="px-3 py-2">
                          <SugarNote
                            patientId={id}
                            day={d.day}
                            text={d.note?.text}
                            by={d.note ? `${d.note.updatedBy.name}, ${fmtDateTime(d.note.updatedAt)}` : undefined}
                            canEdit={canNote}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {days.length > shownDays.length ? (
              <Link href={href({ dates: "all" })} className="block border-t border-line px-3 py-1.5 text-[12px] font-medium text-accent hover:underline">
                Show {days.length - shownDays.length} older days
              </Link>
            ) : (
              sp.dates === "all" &&
              days.length > MAX_DAYS && (
                <Link href={href({ dates: undefined })} className="block border-t border-line px-3 py-1.5 text-[12px] font-medium text-accent hover:underline">
                  Newest days only
                </Link>
              )
            )}
          </section>

          {others.length > 0 && (
            <details className="overflow-hidden rounded-md border border-line bg-panel">
              <summary className="cursor-pointer select-none bg-panel-muted px-3 py-2">
                <span className="font-semibold">Other readings ({others.length})</span>
                <span className="ml-3 text-[11.5px] text-ink-3">Random sugars, and second fasting or 2-hour readings on the same day</span>
              </summary>
              <table className="w-full">
                <thead className="text-left text-[11.5px] text-ink-3">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Date</th>
                    <th className="px-3 py-1.5 font-medium">Timing</th>
                    <th className="px-3 py-1.5 font-medium">From</th>
                    <th className="px-3 py-1.5 text-right font-medium">mmol/L</th>
                    <th className="px-3 py-1.5 text-right font-medium">mg/dL</th>
                    <th className="px-3 py-1.5" />
                  </tr>
                </thead>
                <tbody>
                  {others.map((c) => (
                    <tr key={c.obs.id} className="border-t border-line">
                      <td className="tabular px-3 py-1.5">
                        {fmtDate(c.obs.effectiveAt)} <span className="text-ink-3">{fmtTime(c.obs.effectiveAt)}</span>
                      </td>
                      <td className="px-3 py-1.5">
                        {sugarLabel(c.timing)} <span className="text-ink-3">({sugarShort(c.timing)})</span>
                      </td>
                      <td className="px-3 py-1.5 text-ink-2">{c.source === "fingerstick" ? "Vitals (fingerstick)" : c.imported ? "Outside lab report" : "Lab"}</td>
                      <td className={`tabular px-3 py-1.5 text-right font-medium ${flagText(c.flag)}`}>
                        {c.mmol.toFixed(1)}
                        <FlagBadge flag={c.flag} />
                      </td>
                      <td className="tabular px-3 py-1.5 text-right text-ink-2">{mmolToMg(c.mmol)}</td>
                      <td className="px-3 py-1.5 text-right">
                        <Link href={opened(c)} className="text-[12px] font-medium text-accent hover:underline">
                          {c.reportId ? "Open report" : "Open vitals"}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </>
      )}
    </div>
  );
}
