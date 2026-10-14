import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { pivot } from "@/lib/chart";
import { fmtDateTime, fmtRange, fmtShortDate, fmtTime, fmtValue, unitLabel } from "@/lib/format";
import { Empty } from "@/components/panel";
import { FlagBadge, flagText, flagTitle } from "@/components/flag";
import { Sparkline } from "@/components/sparkline";
import { TrendChart } from "@/components/trend-chart";
import { Button } from "@/components/form";
import { acknowledgeResult } from "@/app/inbox/actions";
import { logChartView } from "@/lib/audit/server";
import { EnteredInError } from "@/components/entered-in-error";
import { markReportInError } from "../error-actions";
import { CorrectResultForm } from "@/components/correct-result-form";
import { canCorrectResult } from "@/lib/labs/correction";
import { correctLabResult } from "./actions";
import { displayName, type SessionUser } from "@/lib/roles";
import type { Flag, Sex } from "@prisma/client";

const MAX_COLUMNS = 6;

export default async function Results({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; report?: string; codes?: string; range?: string; correct?: string; corrected?: string }>;
}) {
  const { id } = await params;
  const currentUser = await requirePermission("viewClinical");
  await logChartView(id, "Results");
  const sp = await searchParams;
  const base = `/patients/${id}/results`;
  const reports = await db.diagnosticReport.findMany({
    where: { patientId: id },
    orderBy: { effectiveAt: "desc" },
    include: REPORT_INCLUDE,
  });
  const patient = await db.patient.findUniqueOrThrow({ where: { id }, select: { sex: true } });
  const view = sp.view === "reports" ? "reports" : sp.view === "graph" ? "graph" : "grid";

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center gap-3">
        <h1 className="text-base font-semibold">Results</h1>
        <div className="flex overflow-hidden rounded border border-line bg-panel text-[12.5px]">
          <Link href={base} className={`px-3 py-1 ${view === "grid" ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}>
            Trend table
          </Link>
          <Link
            href={`${base}?view=reports`}
            className={`border-l border-line px-3 py-1 ${view === "reports" ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}
          >
            Reports
          </Link>
          <Link
            href={`${base}?view=graph`}
            className={`border-l border-line px-3 py-1 ${view === "graph" ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}
          >
            Graph
          </Link>
        </div>
        <Legend />
      </div>
      {reports.length === 0 ? (
        <div className="rounded-md border border-line bg-panel">
          <Empty>No lab results on file.</Empty>
        </div>
      ) : view === "grid" ? (
        <TrendGrid reports={reports} base={base} />
      ) : view === "graph" ? (
        <GraphView reports={reports} base={base} codes={sp.codes} range={sp.range} />
      ) : (
        <ReportView
          reports={reports}
          selected={sp.report}
          base={base}
          canReview={can(currentUser.role, "reviewResults")}
          canFile={can(currentUser.role, "fileImports")}
          user={currentUser}
          sex={patient.sex}
          correcting={sp.correct}
          justCorrected={sp.corrected}
        />
      )}
    </div>
  );
}

const REPORT_INCLUDE = {
  observations: {
    orderBy: { sortOrder: "asc" },
    include: { corrections: { orderBy: { correctedAt: "asc" }, include: { correctedBy: { select: { name: true, credentials: true } } } } },
  },
  verifiedBy: true,
  reviewedBy: true,
  importJob: { select: { createdById: true } },
} as const;

type ReportWithObs = Awaited<ReturnType<typeof db.diagnosticReport.findMany<{ include: typeof REPORT_INCLUDE }>>>[number];
type ObsWithCorrections = ReportWithObs["observations"][number];

function TrendGrid({ reports, base }: { reports: ReportWithObs[]; base: string }) {
  // One section per panel type, newest results on the left.
  const panels = new Map<string, ReportWithObs[]>();
  for (const r of reports) panels.set(r.code, [...(panels.get(r.code) ?? []), r]);
  // Every panel shares the same date columns so values line up down the page.
  const cols = [...new Set(reports.map((r) => r.effectiveAt.getTime()))].sort((a, b) => b - a).slice(0, MAX_COLUMNS);

  return (
    <div className="space-y-4">
      {[...panels.values()].map((group) => {
        const obs = group.flatMap((r) => r.observations);
        const { rows } = pivot(obs);
        const reportAt = new Map(group.map((r) => [r.effectiveAt.getTime(), r.id]));
        const imported = new Set(group.filter((r) => r.source === "imported").map((r) => r.effectiveAt.getTime()));
        return (
          <section key={group[0].code} className="overflow-x-auto rounded-md border border-line bg-panel">
            <table className="w-full min-w-[860px] table-fixed">
              <colgroup>
                <col className="w-60" />
                {cols.map((t) => (
                  <col key={t} />
                ))}
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-28" />
              </colgroup>
              <thead>
                <tr className="bg-panel-muted text-[11.5px] text-ink-3">
                  <th className="px-3 py-2 text-left text-[12.5px] font-semibold text-ink">{group[0].display}</th>
                  {cols.map((t) => (
                    <th key={t} className="tabular px-3 py-2 text-right font-medium">
                      {reportAt.has(t) ? (
                        <Link href={`${base}?view=reports&report=${reportAt.get(t)}`} className="hover:text-accent">
                          {imported.has(t) && <ImportedMark />}
                          {fmtShortDate(new Date(t))}
                          <div className="font-normal">{fmtTime(new Date(t))}</div>
                        </Link>
                      ) : (
                        <>
                          {fmtShortDate(new Date(t))}
                          <div className="font-normal">{fmtTime(new Date(t))}</div>
                        </>
                      )}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-left font-medium">Range</th>
                  <th className="px-3 py-2 text-left font-medium">Units</th>
                  <th className="px-3 py-2 text-left font-medium">Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.code} id={r.code} className="scroll-mt-4 border-t border-line hover:bg-accent-soft/30 target:bg-warn-soft">
                    <td className="px-3 py-1.5">
                      <Link href={`${base}?view=graph&codes=${encodeURIComponent(r.code)}`} className="hover:text-accent hover:underline" title="Graph this result">
                        {r.display}
                      </Link>
                    </td>
                    {cols.map((t) => {
                      const o = r.byTime.get(t);
                      return (
                        <td
                          key={t}
                          className={`tabular px-3 py-1.5 text-right ${o ? flagText(o.flag) : ""}`}
                          title={o?.flag && o.flag !== "N" ? flagTitle(o.flag) : undefined}
                        >
                          {o ? (
                            <>
                              {fmtValue(o)}
                              <FlagBadge flag={o.flag} />
                              {o.correctedAt && <CorrectedMark />}
                            </>
                          ) : (
                            <span className="text-ink-3">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="tabular px-3 py-1.5 text-ink-2">{fmtRange(r)}</td>
                    <td className="px-3 py-1.5 text-ink-2">{unitLabel(r.unit)}</td>
                    <td className="px-3 py-1.5">
                      <Sparkline values={r.values} refLow={r.refLow} refHigh={r.refHigh} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}

function ReportView({
  reports,
  selected,
  base,
  canReview,
  canFile,
  user,
  sex,
  correcting,
  justCorrected,
}: {
  reports: ReportWithObs[];
  selected?: string;
  base: string;
  canReview: boolean;
  canFile: boolean;
  user: SessionUser;
  sex: Sex;
  correcting?: string;
  justCorrected?: string;
}) {
  const current = reports.find((r) => r.id === selected) ?? reports[0];
  const here = `${base}?view=reports&report=${current.id}`;
  const canCorrect = canCorrectResult(user, current);
  const corrections = current.observations.flatMap((o) => o.corrections.map((c, i) => ({ ...c, obs: o, after: o.corrections[i + 1] ?? o })));
  return (
    <div className="flex gap-3">
      <ul className="w-72 shrink-0 overflow-hidden rounded-md border border-line bg-panel">
        {reports.map((r) => {
          const abnormal = r.observations.filter((o) => o.flag && o.flag !== "N").length;
          return (
            <li key={r.id} className="border-t border-line first:border-t-0">
              <Link
                href={`${base}?view=reports&report=${r.id}`}
                className={`block border-l-[3px] px-3 py-2 ${r.id === current.id ? "border-accent bg-accent-soft" : "border-transparent hover:bg-panel-muted"}`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {r.source === "imported" && <ImportedMark />}
                    {r.display}
                  </span>
                  {abnormal > 0 && <span className="shrink-0 text-[11px] font-semibold text-high">{abnormal} abn</span>}
                </div>
                <div className="tabular text-ink-3">{fmtDateTime(r.effectiveAt)}</div>
              </Link>
            </li>
          );
        })}
      </ul>

      <article className="min-w-0 flex-1 rounded-md border border-line bg-panel">
        <header className="border-b border-line px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-[15px] font-semibold">{current.display}</h2>
            <div className="flex shrink-0 gap-3 text-[12.5px]">
              <Link href={`${base}?view=graph&codes=${current.observations.map((o) => encodeURIComponent(o.code)).join(",")}`} className="font-medium text-accent hover:underline">
                Graph
              </Link>
              <Link href={`/print/results?${printQuery(reports, current)}`} className="font-medium text-accent hover:underline">
                Print
              </Link>
              <Link href={`/print/results?${printQuery(reports, current)}&copy=patient`} className="font-medium text-accent hover:underline">
                Patient letter
              </Link>
            </div>
          </div>
          <dl className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5 text-ink-2 md:grid-cols-4">
            <div>
              <dt className="text-[11px] uppercase text-ink-3">Collected</dt>
              <dd className="tabular">{fmtDateTime(current.effectiveAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-ink-3">Resulted</dt>
              <dd className="tabular">{fmtDateTime(current.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-ink-3">Performing lab</dt>
              <dd>{current.performer}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase text-ink-3">Status</dt>
              <dd className="capitalize">
                {current.status}
                {current.source === "imported" && <span className="ml-1.5 rounded bg-low-soft px-1 text-[10.5px] font-semibold text-low">IMPORTED</span>}
                {current.correctedAt && (
                  <span className="ml-1.5 rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-warn" title={`Last corrected ${fmtDateTime(current.correctedAt)}`}>
                    CORRECTED
                  </span>
                )}
              </dd>
            </div>
          </dl>
          <ReviewLine report={current} next={`${base}?view=reports&report=${current.id}`} canReview={canReview} />
          {current.source === "imported" && (
            <p className="mt-2 text-[12px] text-ink-3">
              Transcribed from an outside report
              {current.verifiedBy && current.verifiedAt && (
                <>
                  {" "}
                  and verified by {current.verifiedBy.name} on {fmtDateTime(current.verifiedAt)}
                </>
              )}
              .
              {current.importJobId && (
                <Link href={`/patients/${current.patientId}/import/${current.importJobId}`} className="ml-2 font-medium text-accent hover:underline">
                  View source document →
                </Link>
              )}
            </p>
          )}
          {canFile && (
            <div className="mt-2">
              <EnteredInError action={markReportInError.bind(null, current.patientId, current.id)} what="this report" />
            </div>
          )}
        </header>
        <table className="w-full">
          <thead className="text-left text-[11.5px] text-ink-3">
            <tr>
              <th className="px-4 py-2 font-medium">Component</th>
              <th className="px-3 py-2 text-right font-medium">Value</th>
              <th className="px-3 py-2 font-medium">Flag</th>
              <th className="px-3 py-2 font-medium">Reference range</th>
              <th className="px-3 py-2 font-medium">Units</th>
              <th className="px-3 py-2 font-medium">LOINC</th>
              {canCorrect && <th className="w-20 px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {current.observations.map((o) =>
              correcting === o.id && canCorrect ? (
                <tr key={o.id} id={o.id} className="border-t border-line">
                  <td colSpan={7} className="p-0">
                    <CorrectResultForm
                      result={o}
                      sex={sex}
                      action={correctLabResult.bind(null, current.patientId, o.id)}
                      cancelHref={here}
                    />
                  </td>
                </tr>
              ) : (
                <tr key={o.id} id={o.id} className={`scroll-mt-4 border-t border-line ${justCorrected === o.id ? "bg-warn-soft/60" : ""}`}>
                  <td className="px-4 py-1.5">{o.display}</td>
                  <td className={`tabular px-3 py-1.5 text-right font-medium ${flagText(o.flag)}`}>
                    {fmtValue(o)}
                    {o.correctedAt && <CorrectedMark obs={o} />}
                  </td>
                  <td className="px-3 py-1.5">
                    <FlagBadge flag={o.flag} />
                  </td>
                  <td className="tabular px-3 py-1.5 text-ink-2">{fmtRange(o)}</td>
                  <td className="px-3 py-1.5 text-ink-2">{unitLabel(o.unit)}</td>
                  <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-3">{o.code}</td>
                  {canCorrect && (
                    <td className="px-3 py-1.5 text-right">
                      <Link href={`${here}&correct=${o.id}#${o.id}`} className="text-[12px] font-medium text-accent hover:underline" title="Fix a value that was typed or read wrong">
                        Correct
                      </Link>
                    </td>
                  )}
                </tr>
              ),
            )}
          </tbody>
        </table>
        {corrections.length > 0 && (
          <section className="border-t border-line px-4 py-3">
            <h3 className="mb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Corrections</h3>
            <ul className="space-y-1 text-[12.5px]">
              {corrections
                .sort((a, b) => b.correctedAt.getTime() - a.correctedAt.getTime())
                .map((c) => (
                  <li key={c.id} className="flex flex-wrap gap-x-1.5">
                    <span className="font-medium">{c.obs.display}</span>
                    <span className="tabular text-ink-2">
                      changed from <s>{resultWords(c)}</s> to {resultWords(c.after)}
                    </span>
                    <span className="text-ink-3">
                      by {displayName(c.correctedBy)} on {fmtDateTime(c.correctedAt)}. {c.reason}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}

// "C" for a corrected value, as on lab reports; hovering shows what it was before.
function CorrectedMark({ obs }: { obs?: ObsWithCorrections }) {
  const first = obs?.corrections[0];
  const title = first ? `Corrected. Originally filed as ${resultWords(first)}.` : "Corrected value. See the report for what it was.";
  return (
    <span title={title} className="ml-1 inline-block rounded bg-warn-soft px-1 align-[1px] text-[9.5px] font-bold leading-[14px] text-warn">
      C
    </span>
  );
}

function resultWords(o: { valueNum: number | null; valueText: string | null; unit: string | null; refLow: number | null; refHigh: number | null; refText: string | null; flag: Flag | null }) {
  const flag = o.flag && o.flag !== "N" ? ` (${flagTitle(o.flag).toLowerCase()})` : "";
  const range = fmtRange(o);
  return `${fmtValue(o) || "blank"}${o.unit ? ` ${unitLabel(o.unit)}` : ""}${flag}${range ? `, range ${range}` : ""}`;
}

function ImportedMark() {
  return (
    <span title="Imported from an outside report" className="mr-1 inline-block rounded bg-low-soft px-1 align-[1px] text-[9.5px] font-bold leading-[14px] text-low">
      IMP
    </span>
  );
}

function Legend() {
  return (
    <div className="ml-auto flex items-center gap-3 text-[11.5px] text-ink-3">
      <span>
        <FlagBadge flag="H" /> High
      </span>
      <span>
        <FlagBadge flag="L" /> Low
      </span>
      <span>
        <FlagBadge flag="HH" /> Critical
      </span>
      <span>
        <ImportedMark />
        Imported
      </span>
      <span>
        <CorrectedMark />
        Corrected
      </span>
    </div>
  );
}

// Reports collected together (same draw, or the same imported document) print as one.
function printQuery(reports: ReportWithObs[], current: ReportWithObs) {
  const together = reports.filter((r) =>
    current.importJobId ? r.importJobId === current.importJobId : r.effectiveAt.getTime() === current.effectiveAt.getTime() && !r.importJobId,
  );
  return together.map((r) => `report=${r.id}`).join("&");
}

function ReviewLine({ report, next, canReview }: { report: ReportWithObs; next: string; canReview: boolean }) {
  if (report.reviewedAt) {
    return (
      <p className="mt-2 text-[12px] text-ink-3">
        Acknowledged by {report.reviewedBy?.name ?? "unknown"} on {fmtDateTime(report.reviewedAt)}
        {report.reviewComment && <span className="text-ink-2">: “{report.reviewComment}”</span>}
      </p>
    );
  }
  if (!canReview) return <p className="mt-2 text-[12px] text-warn">Not yet acknowledged by a clinician.</p>;
  return (
    <form action={acknowledgeResult.bind(null, report.id, next)} className="mt-2 flex items-center gap-2 text-[12px]">
      <span className="rounded bg-warn-soft px-1.5 py-0.5 font-semibold text-warn">Not yet acknowledged</span>
      <Button type="submit" variant="secondary" className="py-0.5 text-[11.5px]">
        Acknowledge
      </Button>
    </form>
  );
}

const RANGES = { "1y": 365, "2y": 730, all: 0 } as const;

function GraphView({ reports, base, codes, range }: { reports: ReportWithObs[]; base: string; codes?: string; range?: string }) {
  const days = range && range in RANGES ? RANGES[range as keyof typeof RANGES] : 0;
  const cutoff = days ? Date.now() - days * 86_400_000 : 0;

  // Components grouped by panel, in the order the trend table shows them.
  const panels = new Map<string, { display: string; rows: ReturnType<typeof pivot>["rows"] }>();
  const byPanel = new Map<string, ReportWithObs[]>();
  for (const r of reports) byPanel.set(r.code, [...(byPanel.get(r.code) ?? []), r]);
  for (const [code, group] of byPanel) {
    const rows = pivot(group.flatMap((r) => r.observations)).rows.filter((row) => row.values.length > 0);
    if (rows.length) panels.set(code, { display: group[0].display, rows });
  }
  const allRows = [...panels.values()].flatMap((p) => p.rows);
  const latestFlag = (row: (typeof allRows)[number]) => [...row.byTime.entries()].sort((a, b) => b[0] - a[0])[0]?.[1].flag;

  let selected = (codes ?? "").split(",").filter((c) => allRows.some((r) => r.code === c));
  if (!selected.length) {
    const abnormal = allRows.filter((r) => { const f = latestFlag(r); return f && f !== "N"; }).map((r) => r.code);
    selected = (abnormal.length ? abnormal : allRows.map((r) => r.code)).slice(0, 4);
  }
  const reportOf = new Map(reports.flatMap((r) => r.observations.map((o) => [o.id, r] as const)));
  const href = (next: string[], r = range) => `${base}?view=graph&codes=${next.map(encodeURIComponent).join(",")}${r ? `&range=${r}` : ""}`;

  return (
    <div className="flex gap-3">
      <nav className="w-64 shrink-0 self-start overflow-hidden rounded-md border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Components</span>
          <span className="text-[11px] text-ink-3">{selected.length} shown</span>
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
          {[...panels.entries()].map(([code, p]) => (
            <div key={code} className="border-b border-line last:border-b-0">
              <div className="bg-panel-muted px-3 py-1 text-[11.5px] font-semibold text-ink-2">{p.display}</div>
              {p.rows.map((r) => {
                const on = selected.includes(r.code);
                const f = latestFlag(r);
                return (
                  <Link
                    key={r.code}
                    href={href(on ? selected.filter((c) => c !== r.code) : [...selected, r.code])}
                    className={`flex items-center gap-2 px-3 py-1 ${on ? "bg-accent-soft" : "hover:bg-panel-muted"}`}
                  >
                    <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none ${on ? "border-accent bg-accent text-white" : "border-line"}`}>
                      {on ? "✓" : ""}
                    </span>
                    <span className="flex-1 truncate">{r.display}</span>
                    {f && f !== "N" && <FlagBadge flag={f} />}
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-2 text-[12px]">
          <span className="text-ink-3">Time range</span>
          <div className="flex overflow-hidden rounded border border-line bg-panel">
            {Object.keys(RANGES).map((k) => (
              <Link
                key={k}
                href={href(selected, k === "all" ? undefined : k)}
                className={`border-l border-line px-2.5 py-0.5 first:border-l-0 ${(range ?? "all") === k ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}
              >
                {k === "all" ? "All" : k === "1y" ? "1 year" : "2 years"}
              </Link>
            ))}
          </div>
          <span className="ml-auto text-ink-3">Shaded band is the reference range. Diamonds are imported results. Click a point to open its report.</span>
        </div>
        <div className="grid grid-cols-1 gap-3 2xl:grid-cols-2">
          {selected.map((code) => {
            const row = allRows.find((r) => r.code === code)!;
            const points = [...row.byTime.values()]
              .filter((o) => o.valueNum !== null && o.unit === row.unit && o.effectiveAt.getTime() >= cutoff)
              .map((o) => {
                const rep = reportOf.get(o.id);
                return {
                  t: o.effectiveAt.getTime(),
                  v: o.valueNum!,
                  flag: o.flag,
                  imported: rep?.source === "imported",
                  href: rep ? `${base}?view=reports&report=${rep.id}` : undefined,
                };
              })
              .sort((a, b) => a.t - b.t);
            const last = points.at(-1);
            const first = points[0];
            return (
              <section key={code} className="rounded-md border border-line bg-panel">
                <header className="flex items-baseline gap-3 border-b border-line px-3 py-2">
                  <h3 className="font-semibold">{row.display}</h3>
                  <span className="text-[11.5px] text-ink-3">
                    {unitLabel(row.unit)} · range {fmtRange(row) || "none"}
                  </span>
                  {last && (
                    <span className={`tabular ml-auto font-semibold ${flagText(last.flag)}`}>
                      {last.v}
                      <FlagBadge flag={last.flag} />
                      {first && first !== last && (
                        <span className="ml-2 text-[11.5px] font-normal text-ink-3">
                          {last.v > first.v ? "▲" : last.v < first.v ? "▼" : "="} from {first.v} over {points.length} results
                        </span>
                      )}
                    </span>
                  )}
                </header>
                <div className="px-2 py-2">
                  <TrendChart series={[{ name: row.display, points }]} unit={unitLabel(row.unit)} refLow={row.refLow} refHigh={row.refHigh} />
                </div>
              </section>
            );
          })}
          {selected.length === 0 && (
            <div className="rounded-md border border-line bg-panel">
              <Empty>Pick components on the left to graph them.</Empty>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
