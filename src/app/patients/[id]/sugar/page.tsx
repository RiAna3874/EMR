import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { logChartView } from "@/lib/audit/server";
import { buildTrend } from "@/lib/labs/trends";
import { SUGAR_TIMINGS, sugarLabel, sugarShort } from "@/lib/labs/groups";
import { GLUCOSE_CODES, mmolToMg } from "@/lib/glucose";
import { fmtDate, fmtShortDate, fmtTime, fmtValue } from "@/lib/format";
import { Empty } from "@/components/panel";
import { FlagBadge, flagText, flagTitle } from "@/components/flag";
import { TrendChart } from "@/components/trend-chart";
import type { GlucoseTiming } from "@/lib/glucose";

const MAX_COLUMNS = 12;
const TAG: Record<GlucoseTiming, string> = { fasting: "F", random: "R", post_meal: "2H" };
const RANGES = { "3m": 91, "1y": 365, all: 0 } as const;

// Every blood sugar on one tab: lab glucose of any timing (converted to mmol/L) and the
// fingerstick readings recorded with the vitals, with HbA1c alongside for context.
export default async function BloodSugar({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ timing?: string; source?: string; range?: string; dates?: string }>;
}) {
  const { id } = await params;
  await requirePermission("viewClinical");
  await logChartView(id, "Blood sugar");
  const sp = await searchParams;
  const base = `/patients/${id}/sugar`;
  const chart = `/patients/${id}`;

  const [reports, fingersticks] = await Promise.all([
    db.diagnosticReport.findMany({ where: { patientId: id }, orderBy: { effectiveAt: "desc" }, include: { observations: { orderBy: { sortOrder: "asc" } } } }),
    db.observation.findMany({ where: { patientId: id, category: "vital_signs", code: { in: GLUCOSE_CODES } } }),
  ]);
  const subs = buildTrend([
    ...reports.flatMap((r) => r.observations.map((o) => ({ obs: o, panel: r.display, reportId: r.id, imported: r.source === "imported" }))),
    ...fingersticks.map((o) => ({ obs: o })),
  ]).flatMap((s) => s.subs);
  const sugar = subs.find((x) => x.sugar)?.sugar;
  const a1c = subs.find((x) => x.key === "a1c")?.rows[0];

  const timing = SUGAR_TIMINGS.some((t) => t.key === sp.timing) ? (sp.timing as GlucoseTiming) : undefined;
  const source = sp.source === "lab" || sp.source === "fingerstick" ? sp.source : undefined;
  const days = sp.range && sp.range in RANGES ? RANGES[sp.range as keyof typeof RANGES] : 0;
  const cutoff = days ? Date.now() - days * 86_400_000 : 0;
  const cells = (sugar?.cells ?? []).filter(
    (c) => (!timing || c.timing === timing) && (!source || c.source === source) && c.obs.effectiveAt.getTime() >= cutoff,
  );
  const newest = [...cells].reverse();
  const cols = [...new Set(newest.map((c) => c.obs.effectiveAt.getTime()))];
  const shownCols = sp.dates === "all" ? cols : cols.slice(0, MAX_COLUMNS);
  const byTime = new Map<number, typeof cells>();
  for (const c of newest) byTime.set(c.obs.effectiveAt.getTime(), [...(byTime.get(c.obs.effectiveAt.getTime()) ?? []), c]);

  const href = (next: { timing?: string; source?: string; range?: string; dates?: string }) => {
    const q = new URLSearchParams();
    const m = { timing: sp.timing, source: sp.source, range: sp.range, dates: sp.dates, ...next };
    for (const [k, v] of Object.entries(m)) if (v) q.set(k, v);
    const s = q.toString();
    return s ? `${base}?${s}` : base;
  };
  const opened = (c: (typeof cells)[number]) => (c.reportId ? `${chart}/results?view=reports&report=${c.reportId}` : `${chart}/vitals`);
  const pill = (on: boolean) => `border-l border-line px-2.5 py-0.5 first:border-l-0 ${on ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`;

  const latestOf = (t: GlucoseTiming) => sugar?.cells.filter((c) => c.timing === t).at(-1);
  const a1cLatest = a1c ? [...a1c.byTime.entries()].sort((x, y) => y[0] - x[0])[0]?.[1] : undefined;

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <h1 className="text-base font-semibold">Blood sugar</h1>
        <span className="text-[12.5px] text-ink-3">Lab glucose and fingerstick (POC) readings, in mmol/L</span>
        <Link href={`${chart}/vitals`} className="ml-auto text-[12.5px] font-medium text-accent hover:underline">
          Record a fingerstick reading in Vitals →
        </Link>
      </div>

      {!sugar ? (
        <div className="rounded-md border border-line bg-panel">
          <Empty>No blood sugar readings on file. Fingerstick readings are recorded in Vitals; lab glucose comes in with lab results.</Empty>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {SUGAR_TIMINGS.map((t) => {
              const c = latestOf(t.key);
              return (
                <div key={t.key} className="rounded-md border border-line bg-panel px-3 py-2">
                  <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">
                    Latest {t.label.toLowerCase()} ({t.short})
                  </div>
                  {c ? (
                    <>
                      <div className={`tabular text-[20px] font-semibold ${flagText(c.flag)}`}>
                        {c.mmol.toFixed(1)}
                        <span className="ml-1 text-[12px] font-normal text-ink-3">mmol/L</span>
                        <FlagBadge flag={c.flag} />
                      </div>
                      <div className="text-[12px] text-ink-3">
                        {mmolToMg(c.mmol)} mg/dL · {fmtDate(c.obs.effectiveAt)} · {c.source === "fingerstick" ? "fingerstick" : "lab"}
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
              {a1cLatest ? (
                <>
                  <div className={`tabular text-[20px] font-semibold ${flagText(a1cLatest.flag)}`}>
                    {fmtValue(a1cLatest)}
                    <span className="ml-1 text-[12px] font-normal text-ink-3">%</span>
                    <FlagBadge flag={a1cLatest.flag} />
                  </div>
                  <div className="text-[12px] text-ink-3">
                    {fmtDate(a1cLatest.effectiveAt)} ·{" "}
                    <Link href={`${chart}/results?view=graph&codes=${encodeURIComponent(a1c!.code)}`} className="text-accent hover:underline">
                      trend
                    </Link>
                  </div>
                </>
              ) : (
                <div className="py-1 text-ink-3">None on file</div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-[12px]">
            <span className="text-ink-3">Show</span>
            <div className="flex overflow-hidden rounded border border-line bg-panel">
              <Link href={href({ timing: undefined })} className={pill(!timing)}>
                All timings
              </Link>
              {SUGAR_TIMINGS.map((t) => (
                <Link key={t.key} href={href({ timing: t.key })} className={pill(timing === t.key)}>
                  {t.label} ({t.short})
                </Link>
              ))}
            </div>
            <div className="flex overflow-hidden rounded border border-line bg-panel">
              <Link href={href({ source: undefined })} className={pill(!source)}>
                Lab and fingerstick
              </Link>
              <Link href={href({ source: "lab" })} className={pill(source === "lab")}>
                Lab only
              </Link>
              <Link href={href({ source: "fingerstick" })} className={pill(source === "fingerstick")}>
                Fingerstick only
              </Link>
            </div>
            <div className="flex overflow-hidden rounded border border-line bg-panel">
              {Object.keys(RANGES).map((k) => (
                <Link key={k} href={href({ range: k === "all" ? undefined : k })} className={pill((sp.range ?? "all") === k)}>
                  {k === "all" ? "All time" : k === "3m" ? "3 months" : "1 year"}
                </Link>
              ))}
            </div>
          </div>

          {cells.length === 0 ? (
            <div className="rounded-md border border-line bg-panel">
              <Empty>No readings match these filters.</Empty>
            </div>
          ) : (
            <>
              <section className="rounded-md border border-line bg-panel">
                <header className="flex items-baseline gap-3 border-b border-line px-3 py-2">
                  <h2 className="font-semibold">Trend</h2>
                  <span className="text-[11.5px] text-ink-3">
                    {cells.length} {cells.length === 1 ? "reading" : "readings"} · shaded band is 3.9–7.8 mmol/L (fasting normal up to 5.5) · diamonds are imported reports
                  </span>
                </header>
                <div className="px-2 py-2">
                  <TrendChart
                    height={240}
                    unit="mmol/L"
                    refLow={3.9}
                    refHigh={7.8}
                    series={SUGAR_TIMINGS.map((t) => ({
                      name: `${t.label} (${t.short})`,
                      points: cells
                        .filter((c) => c.timing === t.key)
                        .map((c) => ({ t: c.obs.effectiveAt.getTime(), v: c.mmol, flag: c.flag, imported: c.imported, href: opened(c) })),
                    })).filter((s) => s.points.length > 0)}
                  />
                </div>
              </section>

              <section className="overflow-hidden rounded-md border border-line bg-panel">
                <header className="flex items-baseline gap-3 border-b border-line bg-panel-muted px-3 py-2">
                  <h2 className="font-semibold">Blood sugar by date</h2>
                  <span className="text-[11.5px] text-ink-3">Newest on the left. F fasting · R random · 2H two hours after a meal · ° fingerstick</span>
                  {cols.length > shownCols.length ? (
                    <Link href={href({ dates: "all" })} className="ml-auto text-[11.5px] font-medium text-accent hover:underline">
                      Show {cols.length - shownCols.length} older dates
                    </Link>
                  ) : (
                    sp.dates === "all" && (
                      <Link href={href({ dates: undefined })} className="ml-auto text-[11.5px] font-medium text-accent hover:underline">
                        Newest dates only
                      </Link>
                    )
                  )}
                </header>
                <div className="overflow-x-auto">
                  <table className="table-fixed" style={{ minWidth: "100%", width: 160 + shownCols.length * 84 }}>
                    <colgroup>
                      <col className="w-40" />
                      {shownCols.map((t) => (
                        <col key={t} className="w-[84px]" />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="text-[11.5px] text-ink-3">
                        <th className="sticky left-0 z-10 bg-panel px-3 py-1.5 text-left font-medium">Date</th>
                        {shownCols.map((t) => (
                          <th key={t} className="tabular whitespace-nowrap px-2 py-1.5 text-right font-medium">
                            <div className="font-semibold text-ink-2">{fmtShortDate(new Date(t))}</div>
                            <div className="font-normal">{fmtTime(new Date(t))}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t border-line">
                        <td className="sticky left-0 z-10 bg-panel px-3 py-2 font-medium">
                          Blood sugar
                          <div className="text-[11px] font-normal text-ink-3">mmol/L</div>
                        </td>
                        {shownCols.map((t) => (
                          <td key={t} className="tabular whitespace-nowrap px-2 py-2 text-right">
                            {byTime.get(t)!.map((c) => (
                              <Link
                                key={c.obs.id}
                                href={opened(c)}
                                className={`block hover:underline ${flagText(c.flag)}`}
                                title={`${sugarLabel(c.timing)}, ${c.source === "fingerstick" ? "fingerstick" : "lab"}: ${c.mmol.toFixed(1)} mmol/L (${mmolToMg(c.mmol)} mg/dL)${c.flag && c.flag !== "N" ? `, ${flagTitle(c.flag).toLowerCase()}` : ""}`}
                              >
                                {c.mmol.toFixed(1)}
                                {c.source === "fingerstick" && <span className="text-ink-3">°</span>}
                                <span className="ml-0.5 text-[10px] font-semibold text-ink-3">{TAG[c.timing]}</span>
                                <FlagBadge flag={c.flag} />
                              </Link>
                            ))}
                          </td>
                        ))}
                      </tr>
                      <tr className="border-t border-line text-[11.5px] text-ink-3">
                        <td className="sticky left-0 z-10 bg-panel px-3 py-1.5">mg/dL</td>
                        {shownCols.map((t) => (
                          <td key={t} className="tabular px-2 py-1.5 text-right">
                            {byTime.get(t)!.map((c) => (
                              <div key={c.obs.id}>{mmolToMg(c.mmol)}</div>
                            ))}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="overflow-hidden rounded-md border border-line bg-panel">
                <header className="border-b border-line bg-panel-muted px-3 py-2 font-semibold">All readings</header>
                <table className="w-full">
                  <thead className="text-left text-[11.5px] text-ink-3">
                    <tr>
                      <th className="px-3 py-1.5 font-medium">Date</th>
                      <th className="px-3 py-1.5 font-medium">Timing</th>
                      <th className="px-3 py-1.5 font-medium">Source</th>
                      <th className="px-3 py-1.5 text-right font-medium">mmol/L</th>
                      <th className="px-3 py-1.5 text-right font-medium">mg/dL</th>
                      <th className="px-3 py-1.5 font-medium">Flag</th>
                      <th className="px-3 py-1.5" />
                    </tr>
                  </thead>
                  <tbody>
                    {newest.map((c) => (
                      <tr key={c.obs.id} className="border-t border-line hover:bg-accent-soft/30">
                        <td className="tabular px-3 py-1.5">
                          {fmtDate(c.obs.effectiveAt)} <span className="text-ink-3">{fmtTime(c.obs.effectiveAt)}</span>
                        </td>
                        <td className="px-3 py-1.5">
                          {sugarLabel(c.timing)} <span className="text-ink-3">({sugarShort(c.timing)})</span>
                        </td>
                        <td className="px-3 py-1.5 text-ink-2">
                          {c.source === "fingerstick" ? "Fingerstick (POC)" : c.imported ? "Lab, outside report" : "Lab"}
                        </td>
                        <td className={`tabular px-3 py-1.5 text-right font-medium ${flagText(c.flag)}`}>{c.mmol.toFixed(1)}</td>
                        <td className="tabular px-3 py-1.5 text-right text-ink-2">{mmolToMg(c.mmol)}</td>
                        <td className="px-3 py-1.5">
                          <FlagBadge flag={c.flag} />
                          {c.obs.correctedAt && <span className="ml-1 text-[11px] font-semibold text-warn">Corrected</span>}
                        </td>
                        <td className="px-3 py-1.5 text-right">
                          <Link href={opened(c)} className="text-[12px] font-medium text-accent hover:underline">
                            {c.reportId ? "Open report" : "Open vitals"}
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
