import Link from "next/link";
import { db } from "@/lib/db";
import { pivot } from "@/lib/chart";
import { fmtDateTime, fmtRange, fmtShortDate, fmtTime, fmtValue, unitLabel } from "@/lib/format";
import { Empty } from "@/components/panel";
import { FlagBadge, flagText, flagTitle } from "@/components/flag";
import { Sparkline } from "@/components/sparkline";

const MAX_COLUMNS = 6;

export default async function Results({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string; report?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const base = `/patients/${id}/results`;
  const reports = await db.diagnosticReport.findMany({
    where: { patientId: id },
    orderBy: { effectiveAt: "desc" },
    include: { observations: { orderBy: { sortOrder: "asc" } }, verifiedBy: true },
  });
  const view = sp.view === "reports" ? "reports" : "grid";

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
        </div>
        <Legend />
      </div>
      {reports.length === 0 ? (
        <div className="rounded-md border border-line bg-panel">
          <Empty>No lab results on file.</Empty>
        </div>
      ) : view === "grid" ? (
        <TrendGrid reports={reports} base={base} />
      ) : (
        <ReportView reports={reports} selected={sp.report} base={base} />
      )}
    </div>
  );
}

type ReportWithObs = Awaited<ReturnType<typeof db.diagnosticReport.findMany<{ include: { observations: true; verifiedBy: true } }>>>[number];

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
                    <td className="px-3 py-1.5">{r.display}</td>
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

function ReportView({ reports, selected, base }: { reports: ReportWithObs[]; selected?: string; base: string }) {
  const current = reports.find((r) => r.id === selected) ?? reports[0];
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
          <h2 className="text-[15px] font-semibold">{current.display}</h2>
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
              </dd>
            </div>
          </dl>
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
            </tr>
          </thead>
          <tbody>
            {current.observations.map((o) => (
              <tr key={o.id} className="border-t border-line">
                <td className="px-4 py-1.5">{o.display}</td>
                <td className={`tabular px-3 py-1.5 text-right font-medium ${flagText(o.flag)}`}>{fmtValue(o)}</td>
                <td className="px-3 py-1.5">
                  <FlagBadge flag={o.flag} />
                </td>
                <td className="tabular px-3 py-1.5 text-ink-2">{fmtRange(o)}</td>
                <td className="px-3 py-1.5 text-ink-2">{unitLabel(o.unit)}</td>
                <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-3">{o.code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </article>
    </div>
  );
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
    </div>
  );
}
