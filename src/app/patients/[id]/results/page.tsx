import Link from "next/link";
import { redirect } from "next/navigation";
import { Fragment } from "react";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { buildTrend, type TrendSection } from "@/lib/labs/trends";
import { blocksOf, isBloodSugar } from "@/lib/labs/groups";
import { matchesTokens, obsHaystack, queryTokens } from "@/lib/labs/result-search";
import { GLUCOSE_CODES } from "@/lib/glucose";
import { ResultsSearchBox } from "@/components/results-search";
import { fmtDate, fmtDateTime, fmtRange, fmtShortDate, fmtTime, fmtValue, unitLabel } from "@/lib/format";
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

const MAX_COLUMNS = 7;
const MAX_ALL_COLUMNS = 40;
// Older links graph every blood sugar with ?view=graph&codes=sugar; that is the Blood sugar tab now.
const SUGAR_CODE = "sugar";

export default async function Results({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; report?: string; codes?: string; range?: string; correct?: string; corrected?: string; group?: string; abn?: string; dates?: string; q?: string }>;
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
  const [patient, fingersticks] = await Promise.all([
    db.patient.findUniqueOrThrow({ where: { id }, select: { sex: true } }),
    db.observation.count({ where: { patientId: id, category: "vital_signs", code: { in: GLUCOSE_CODES } } }),
  ]);
  const view = sp.view === "reports" ? "reports" : sp.view === "graph" ? "graph" : "grid";
  const reportOfObs = new Map(reports.flatMap((r) => r.observations.map((o) => [o.id, r] as const)));
  const sugarCodes = new Set(reports.flatMap((r) => r.observations.filter((o) => isBloodSugar(o, r.display)).map((o) => o.code)));

  // Blood sugars (lab and fingerstick) have their own tab; old graph links go there.
  if (view === "graph" && sp.codes) {
    const codes = sp.codes.split(",");
    if (codes.every((c) => c === SUGAR_CODE || sugarCodes.has(c) || GLUCOSE_CODES.includes(c))) redirect(`/patients/${id}/sugar`);
  }
  const hasSugar = sugarCodes.size > 0 || fingersticks > 0;

  const tokens = queryTokens(sp.q);
  const all = buildTrend(
    reports.flatMap((r) => r.observations.map((o) => ({ obs: o, panel: r.display, reportId: r.id, imported: r.source === "imported" }))),
    { sugar: false },
  );
  const sections = tokens.length ? searchSections(all, tokens, (o) => reportOfObs.get(o.id)) : all;
  const shownReports = tokens.length ? reports.filter((r) => matchesTokens(reportHaystack(r), tokens)) : reports;

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
        <ResultsSearchBox initial={sp.q ?? ""} />
        <Legend />
      </div>
      {hasSugar && (
        <p className="mb-2 text-[12px] text-ink-3">
          Blood sugars (lab glucose and fingerstick readings) are on the{" "}
          <Link href={`/patients/${id}/sugar`} className="font-medium text-accent hover:underline">
            Blood sugar tab
          </Link>
          .
        </p>
      )}
      {(view === "reports" ? shownReports.length === 0 : sections.length === 0) ? (
        <div className="rounded-md border border-line bg-panel">
          <Empty>
            {tokens.length ? (
              <>
                Nothing in the results matches “{sp.q}”.{" "}
                <Link href={view === "grid" ? base : `${base}?view=${view}`} className="font-medium text-accent hover:underline">
                  Clear search
                </Link>
              </>
            ) : all.length === 0 && reports.length > 0 && view !== "reports" ? (
              "Only blood sugars on file. See the Blood sugar tab."
            ) : (
              "No lab results on file."
            )}
          </Empty>
        </div>
      ) : view === "grid" ? (
        <>
          {tokens.length > 0 && <SearchSummary sections={sections} q={sp.q!} clear={base} />}
          <TrendGrid sections={sections} base={base} query={{ group: sp.group, abn: sp.abn, dates: sp.dates, q: sp.q }} tokens={tokens} />
        </>
      ) : view === "graph" ? (
        <GraphView sections={sections} reports={reports} base={base} codes={sp.codes} range={sp.range} />
      ) : (
        <ReportView
          tokens={tokens}
          reports={shownReports}
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

type Section = TrendSection<ObsWithCorrections>;
type Sub = Section["subs"][number];
type GridQuery = { group?: string; abn?: string; dates?: string; q?: string };

function trendHref(base: string, q: GridQuery, hash = "") {
  const p = new URLSearchParams();
  if (q.group) p.set("group", q.group);
  if (q.abn) p.set("abn", q.abn);
  if (q.dates) p.set("dates", q.dates);
  if (q.q) p.set("q", q.q);
  const s = p.toString();
  return `${s ? `${base}?${s}` : base}${hash}`;
}

// Epic-style results review: a tree of sections and panels on the left, and on the
// right one table per panel group with the newest results first.
function TrendGrid({ sections, base, query, tokens }: { sections: Section[]; base: string; query: GridQuery; tokens: string[] }) {
  const abnormalOnly = query.abn === "1";
  const allDates = query.dates === "all";
  const shown = sections
    .filter((s) => !query.group || s.key === query.group)
    .map((s) => (abnormalOnly ? onlyAbnormal(s) : s))
    .filter((s) => s.subs.length > 0);
  const toggle = (active: boolean) =>
    `rounded border px-2.5 py-0.5 ${active ? "border-chrome bg-chrome text-white" : "border-line bg-panel text-ink-2 hover:border-accent hover:text-accent"}`;

  return (
    <div className="flex items-start gap-3">
      <nav className="sticky top-3 w-48 shrink-0 overflow-hidden rounded-md border border-line bg-panel text-[12.5px]" aria-label="Result sections">
        <Link
          href={trendHref(base, { ...query, group: undefined })}
          className={`flex items-center justify-between border-b border-line px-3 py-2 font-semibold ${!query.group ? "bg-accent-soft text-ink" : "text-ink-2 hover:bg-panel-muted"}`}
        >
          All results
        </Link>
        <div className="max-h-[calc(100vh-200px)] overflow-y-auto py-1">
          {sections.map((s) => (
            <div key={s.key} className="py-0.5">
              <Link
                href={trendHref(base, { ...query, group: s.key })}
                className={`flex items-center gap-2 px-3 py-1 font-semibold ${query.group === s.key ? "bg-accent-soft text-ink" : "text-ink hover:bg-panel-muted"}`}
              >
                <span className="flex-1 truncate">{s.label}</span>
                {s.abnormal > 0 && <AbnCount n={s.abnormal} />}
              </Link>
              {s.subs.map((x) => (
                <Link
                  key={x.key}
                  href={trendHref(base, { ...query, group: query.group && query.group !== s.key ? s.key : query.group }, `#panel-${s.key}-${x.key}`)}
                  className="flex items-center gap-2 py-0.5 pl-6 pr-3 text-ink-2 hover:bg-panel-muted hover:text-accent"
                >
                  <span className="flex-1 truncate">{x.label}</span>
                  {x.abnormal > 0 && <AbnCount n={x.abnormal} />}
                </Link>
              ))}
            </div>
          ))}
        </div>
      </nav>

      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex items-center gap-1.5 text-[12px]">
          <span className="text-ink-3">Newest results on the left. Click a date to open its report, or a test to graph it.</span>
          <span className="ml-auto flex gap-1.5">
            <Link href={trendHref(base, { ...query, abn: abnormalOnly ? undefined : "1" })} className={toggle(abnormalOnly)} title="Only tests whose latest result is out of range">
              Abnormal only
            </Link>
            <Link href={trendHref(base, { ...query, dates: allDates ? undefined : "all" })} className={toggle(allDates)} title="Show every date, not just the newest">
              All dates
            </Link>
          </span>
        </div>

        {shown.length === 0 && (
          <div className="rounded-md border border-line bg-panel">
            <Empty>{abnormalOnly ? "No tests with an out-of-range latest result." : "No results in this section."}</Empty>
          </div>
        )}

        {shown.map((s) => (
          <details key={s.key} open id={`section-${s.key}`} className="group scroll-mt-3 overflow-hidden rounded-md border border-line bg-panel">
            <summary className="flex cursor-pointer list-none items-baseline gap-3 bg-chrome px-3 py-1.5 text-white">
              <span className="text-[11px] transition-transform group-open:rotate-90">▶</span>
              <h2 className="text-[13.5px] font-semibold">{s.label}</h2>
              <span className="text-[11.5px] text-white/70">Latest {fmtDate(new Date(s.latestAt))}</span>
              {s.abnormal > 0 && <span className="ml-auto rounded bg-white/15 px-1.5 text-[11.5px] font-semibold">{s.abnormal} out of range</span>}
            </summary>
            <div className="divide-y divide-line">
              {s.blocks.map((b) => (
                <PanelTable key={b.subs[0].key} section={s} block={b} base={base} query={query} allDates={allDates} tokens={tokens} />
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

function AbnCount({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-high-soft px-1.5 text-[10.5px] font-semibold text-high" title={`${n} ${n === 1 ? "test's" : "tests'"} latest result is out of range`}>
      {n}
    </span>
  );
}

function PanelTable({ section, block, base, query, allDates, tokens }: { section: Section; block: Section["blocks"][number]; base: string; query: GridQuery; allDates: boolean; tokens: string[] }) {
  const cols = block.times.slice(0, allDates ? MAX_ALL_COLUMNS : MAX_COLUMNS);
  const hidden = block.times.length - cols.length;
  const single = block.subs.length === 1;
  const title = single ? block.subs[0].label : block.subs.map((x) => x.label).join(", ");
  return (
    <div>
      {block.subs.map((x) => (
        <span key={x.key} id={`panel-${section.key}-${x.key}`} className="block scroll-mt-3" />
      ))}
      <div className="overflow-x-auto">
        <table className="w-full table-fixed" style={{ minWidth: 192 + cols.length * 76 + 256 }}>
          <colgroup>
            <col className="w-48" />
            {cols.map((t) => (
              <col key={t} />
            ))}
            <col className="w-24" />
            <col className="w-20" />
            <col className="w-20" />
          </colgroup>
          <thead>
            <tr className="bg-panel-muted text-[11.5px] text-ink-3">
              <th className="sticky left-0 z-10 bg-panel-muted px-3 py-1.5 text-left text-[12.5px] font-semibold text-ink">
                {single ? title : "Test"}
                {hidden > 0 && (
                  <Link href={trendHref(base, { ...query, dates: "all" })} className="block text-[11px] font-normal text-accent hover:underline">
                    + {hidden} older {hidden === 1 ? "date" : "dates"}
                  </Link>
                )}
              </th>
              {cols.map((t) => (
                <th key={t} className="tabular whitespace-nowrap px-2 py-1.5 text-right font-medium">
                  <DateHead t={t} href={section.reportAt.has(t) ? `${base}?view=reports&report=${section.reportAt.get(t)}` : undefined} imported={section.imported.has(t)} />
                </th>
              ))}
              <th className="px-3 py-1.5 text-left font-medium">Range</th>
              <th className="px-3 py-1.5 text-left font-medium">Units</th>
              <th className="px-3 py-1.5 text-left font-medium">Trend</th>
            </tr>
          </thead>
          <tbody>
            {block.subs.map((x) => (
              <Fragment key={x.key}>
                {!single && (
                  <tr className="border-t border-line">
                    <th colSpan={cols.length + 4} className="bg-accent-soft/30 px-3 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-2">
                      {x.label}
                    </th>
                  </tr>
                )}
                {x.rows.map((r) => (
                  <tr key={r.code} id={r.code} className="group/row scroll-mt-4 border-t border-line hover:bg-accent-soft/30 target:bg-warn-soft">
                    <td className="sticky left-0 z-10 truncate bg-panel px-3 py-1.5 group-hover/row:bg-accent-soft/30">
                      <Link href={`${base}?view=graph&codes=${encodeURIComponent(r.code)}`} className="hover:text-accent hover:underline" title={`Graph ${r.display}`}>
                        <Marked text={r.display} tokens={tokens} />
                      </Link>
                    </td>
                    {cols.map((t) => {
                      const o = r.byTime.get(t);
                      return (
                        <td
                          key={t}
                          className={`tabular whitespace-nowrap px-2 py-1.5 text-right ${o ? flagText(o.flag) : ""}`}
                          title={o?.flag && o.flag !== "N" ? flagTitle(o.flag) : undefined}
                        >
                          {o ? (
                            <>
                              {fmtValue(o)}
                              <FlagBadge flag={o.flag} />
                              {o.correctedAt && <CorrectedMark obs={o} />}
                            </>
                          ) : (
                            <span className="text-ink-3/60">·</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="tabular truncate px-3 py-1.5 text-ink-2" title={fmtRange(r)}>
                      {fmtRange(r)}
                    </td>
                    <td className="truncate px-3 py-1.5 text-ink-2" title={unitLabel(r.unit)}>
                      {unitLabel(r.unit)}
                    </td>
                    <td className="px-3 py-1.5">
                      <Sparkline values={r.values} refLow={r.refLow} refHigh={r.refHigh} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Tests whose latest value is flagged.
function onlyAbnormal(s: Section): Section {
  const latestFlag = (m: Map<number, { flag: Flag | null }>) => [...m.entries()].sort((a, b) => b[0] - a[0])[0]?.[1].flag;
  const subs = s.subs
    .map((x) => {
      const rows = x.rows.filter((r) => { const f = latestFlag(r.byTime); return f && f !== "N"; });
      return { ...x, rows };
    })
    .filter((x) => x.rows.length);
  return withSubs(s, subs);
}

function DateHead({ t, href, imported }: { t: number; href?: string; imported: boolean }) {
  const body = (
    <>
      <div className="font-semibold text-ink-2">{fmtShortDate(new Date(t))}</div>
      <div className="font-normal">
        {imported && <ImportedMark />}
        {fmtTime(new Date(t))}
      </div>
    </>
  );
  return href ? (
    <Link href={href} className="hover:text-accent" title="Open this report">
      {body}
    </Link>
  ) : (
    body
  );
}

// A section with some of its panels, its dates and table groups worked out again.
function withSubs(s: Section, subs: Sub[]): Section {
  return { ...s, subs, blocks: blocksOf(subs), times: [...new Set(subs.flatMap((x) => x.times))].sort((a, b) => b - a), abnormal: subs.reduce((n, x) => n + x.abnormal, 0) };
}

// Results search: keep the tests whose name, aliases, values, flags, panel, section or
// report (title, lab) contain every word typed.
function searchSections(sections: Section[], tokens: string[], reportOf: (o: ObsWithCorrections) => ReportWithObs | undefined): Section[] {
  const latestFlag = (m: Map<number, { flag: Flag | null }>) => [...m.entries()].sort((a, b) => b[0] - a[0])[0]?.[1].flag;
  return sections
    .map((s) => {
      const subs = s.subs
        .map((x) => {
          const rows = x.rows.filter((r) => {
            const hay = [...r.byTime.values()]
              .map((o) => {
                const rep = reportOf(o);
                return obsHaystack(o, [x.label, s.label, rep?.display, rep?.performer, fmtDate(o.effectiveAt)]);
              })
              .join(" | ");
            return matchesTokens(hay, tokens);
          });
          const times = [...new Set(rows.flatMap((r) => [...r.byTime.keys()]))].sort((a, b) => b - a);
          const abnormal = rows.filter((r) => { const f = latestFlag(r.byTime); return f && f !== "N"; }).length;
          return { ...x, rows, times, abnormal };
        })
        .filter((x) => x.rows.length);
      return withSubs(s, subs);
    })
    .filter((s) => s.subs.length);
}

function reportHaystack(r: ReportWithObs) {
  return [r.display, r.performer, fmtDate(r.effectiveAt)].join(" | ").toLowerCase() + " | " + r.observations.map((o) => obsHaystack(o)).join(" | ");
}

function SearchSummary({ sections, q, clear }: { sections: Section[]; q: string; clear: string }) {
  const n = sections.reduce((k, s) => k + s.subs.reduce((m, x) => m + x.rows.length, 0), 0);
  return (
    <p className="mb-2 text-[12.5px] text-ink-2">
      {n} {n === 1 ? "test matches" : "tests match"} “{q}”.{" "}
      <Link href={clear} className="font-medium text-accent hover:underline">
        Clear search
      </Link>
    </p>
  );
}

// The typed words, highlighted where they appear in a name.
function Marked({ text, tokens }: { text: string; tokens: string[] }) {
  if (!tokens.length) return <>{text}</>;
  const re = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(re);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded-sm bg-warn-soft px-px text-ink">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function ReportView({
  tokens,
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
  tokens: string[];
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
  const qs = tokens.length ? `&q=${encodeURIComponent(tokens.join(" "))}` : "";
  const here = `${base}?view=reports&report=${current.id}${qs}`;
  const hit = (o: ObsWithCorrections) => tokens.length > 0 && matchesTokens(obsHaystack(o), tokens);
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
                href={`${base}?view=reports&report=${r.id}${qs}`}
                className={`block border-l-[3px] px-3 py-2 ${r.id === current.id ? "border-accent bg-accent-soft" : "border-transparent hover:bg-panel-muted"}`}
              >
                <div className="flex justify-between gap-2">
                  <span className="font-medium">
                    {r.source === "imported" && <ImportedMark />}
                    <Marked text={r.display} tokens={tokens} />
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
                <tr key={o.id} id={o.id} className={`scroll-mt-4 border-t border-line ${justCorrected === o.id ? "bg-warn-soft/60" : hit(o) ? "bg-warn-soft/30" : ""}`}>
                  <td className="px-4 py-1.5">
                    <Marked text={o.display} tokens={tokens} />
                  </td>
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

function GraphView({ sections, reports, base, codes, range }: { sections: Section[]; reports: ReportWithObs[]; base: string; codes?: string; range?: string }) {
  const days = range && range in RANGES ? RANGES[range as keyof typeof RANGES] : 0;
  const cutoff = days ? Date.now() - days * 86_400_000 : 0;

  const allRows = sections.flatMap((s) => s.subs.flatMap((x) => x.rows));
  const latestFlag = (row: (typeof allRows)[number]) => [...row.byTime.entries()].sort((a, b) => b[0] - a[0])[0]?.[1].flag;

  let selected = [...new Set((codes ?? "").split(",").filter((c) => allRows.some((r) => r.code === c)))];
  if (!selected.length) {
    const abnormal = allRows.filter((r) => { const f = latestFlag(r); return f && f !== "N"; }).map((r) => r.code);
    selected = (abnormal.length ? abnormal : allRows.map((r) => r.code)).slice(0, 4);
  }
  const reportOf = new Map(reports.flatMap((r) => r.observations.map((o) => [o.id, r] as const)));
  const href = (next: string[], r = range) => `${base}?view=graph&codes=${next.map(encodeURIComponent).join(",")}${r ? `&range=${r}` : ""}`;
  const item = (code: string, label: string, f: Flag | null | undefined, strong = false) => {
    const on = selected.includes(code);
    return (
      <Link
        key={code}
        href={href(on ? selected.filter((c) => c !== code) : [...selected, code])}
        className={`flex items-center gap-2 px-3 py-1 pl-4 ${on ? "bg-accent-soft" : "hover:bg-panel-muted"}`}
      >
        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border text-[10px] leading-none ${on ? "border-accent bg-accent text-white" : "border-line"}`}>
          {on ? "✓" : ""}
        </span>
        <span className={`flex-1 truncate ${strong ? "font-medium" : ""}`}>{label}</span>
        {f && f !== "N" && <FlagBadge flag={f} />}
      </Link>
    );
  };

  return (
    <div className="flex gap-3">
      <nav className="w-64 shrink-0 self-start overflow-hidden rounded-md border border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Tests</span>
          <span className="text-[11px] text-ink-3">{selected.length} shown</span>
        </div>
        <div className="max-h-[calc(100vh-220px)] overflow-y-auto">
          {sections.filter((s) => s.subs.some((x) => x.rows.some((r) => r.values.length > 0))).map((s) => (
            <div key={s.key} className="border-b border-line last:border-b-0">
              <div className="bg-panel-muted px-3 py-1 text-[12px] font-semibold text-ink">{s.label}</div>
              {s.subs.map((x) => {
                const rows = x.rows.filter((r) => r.values.length > 0);
                if (!rows.length) return null;
                return (
                  <div key={x.key}>
                    {(s.subs.length > 1 || x.label !== s.label) && <div className="px-3 pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">{x.label}</div>}
                    {rows.map((r) => item(r.code, r.display, latestFlag(r)))}
                  </div>
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
              <Empty>Pick tests on the left to graph them.</Empty>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
