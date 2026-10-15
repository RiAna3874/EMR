"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FlagBadge, flagText } from "@/components/flag";
import { TrendChart } from "@/components/trend-chart";
import { HIT_KINDS, kindLabel, type HitKind, type SearchHit, type SearchResult } from "@/lib/search/types";
import type { Snippet } from "@/lib/search/text";

const EXAMPLES = ["a1c", "bp", "creatinine", "chest x-ray", "usg abdomen", "\"chest pain\"", "napa", "allergy", "ef"];

// Search everything in one chart as you type. Results come from /api/patients/[id]/search.
export function ChartSearch({ patientId, initialQuery, initialKind, initial }: { patientId: string; initialQuery: string; initialKind: HitKind | null; initial: SearchResult | null }) {
  const [q, setQ] = useState(initialQuery);
  const [kind, setKind] = useState<HitKind | null>(initialKind);
  const [result, setResult] = useState<SearchResult | null>(initial);
  const [loading, setLoading] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    // The server already searched for the query the page opened with.
    if (first.current) {
      first.current = false;
      if (initial) return;
    }
    const query = q.trim();
    const url = new URL(window.location.href);
    if (query) url.searchParams.set("q", query);
    else url.searchParams.delete("q");
    if (kind) url.searchParams.set("kind", kind);
    else url.searchParams.delete("kind");
    window.history.replaceState(null, "", url);
    if (!query) {
      setResult(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      setLoading(true);
      fetch(`/api/patients/${patientId}/search?${new URLSearchParams({ q: query, ...(kind ? { kind } : {}) })}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((r: SearchResult | null) => r && setResult(r))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 160);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, kind, patientId, initial]);

  const counts = result?.counts ?? {};
  const total = result?.total ?? 0;
  return (
    <div className="mx-auto max-w-5xl p-4">
      <div className="relative">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && setQ("")}
          placeholder="Search this chart: labs, imaging, notes, documents, meds, orders, photos…"
          aria-label="Search this chart"
          className="w-full rounded-md border border-line bg-panel px-4 py-2.5 pr-24 text-[15px] shadow-sm outline-none focus:border-accent"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11.5px] text-ink-3">{loading ? "Searching…" : result ? `${total} found` : ""}</span>
      </div>

      {result && total > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5 text-[12px]">
          <Chip active={!kind} onClick={() => setKind(null)}>
            All <span className="text-ink-3">{total}</span>
          </Chip>
          {HIT_KINDS.filter((k) => counts[k.id]).map((k) => (
            <Chip key={k.id} active={kind === k.id} onClick={() => setKind(kind === k.id ? null : k.id)}>
              {k.label} <span className="text-ink-3">{counts[k.id]}</span>
            </Chip>
          ))}
        </div>
      )}

      {!q.trim() && (
        <div className="mt-6 rounded-md border border-line bg-panel p-4 text-[13px] text-ink-2">
          <p className="font-medium text-ink">Search finds anything in this chart, as you type.</p>
          <p className="mt-1">
            Lab tests show every value with a trend graph. Abbreviations and local names work both ways (a1c, sgpt, usg, napa), spelling slips are forgiven, and
            British or American spelling doesn&apos;t matter. Put words in quotes to keep them together. Each result opens its source with your words highlighted.
          </p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map((x) => (
              <button key={x} onClick={() => setQ(x)} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-2 hover:border-accent hover:text-accent">
                {x}
              </button>
            ))}
          </div>
        </div>
      )}

      {result && q.trim() && (
        <div className="mt-3 space-y-2">
          {result.hits.length === 0 && <div className="rounded-md border border-line bg-panel px-4 py-6 text-center text-ink-3">Nothing in this chart matches “{result.query}”.</div>}
          {result.partial && result.hits.length > 0 && (
            <p className="text-[12.5px] text-warn">Nothing has every word you typed. These are the closest matches.</p>
          )}
          {result.hits.map((h) => (
            <HitCard key={h.key} hit={h} />
          ))}
          {result.hits.length < (kind ? (counts[kind] ?? 0) : total) && (
            <p className="py-2 text-center text-[12px] text-ink-3">Showing the best {result.hits.length}. Add a word or pick a type above to narrow it down.</p>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded-full border px-2.5 py-0.5 ${active ? "border-chrome bg-chrome text-white [&_span]:text-white/70" : "border-line bg-panel text-ink-2 hover:border-accent"}`}>
      {children}
    </button>
  );
}

export function Marked({ snippet }: { snippet: Snippet }) {
  const parts: React.ReactNode[] = [];
  let at = 0;
  snippet.marks.forEach(([a, b], i) => {
    if (a > at) parts.push(snippet.text.slice(at, a));
    parts.push(
      <mark key={i} className="rounded-sm bg-warn-soft px-0.5 font-medium text-ink">
        {snippet.text.slice(a, b)}
      </mark>,
    );
    at = b;
  });
  parts.push(snippet.text.slice(at));
  return <>{parts}</>;
}

function HitCard({ hit }: { hit: SearchHit }) {
  return (
    <article className="rounded-md border border-line bg-panel">
      <div className="flex gap-3 px-4 py-2.5">
        {hit.thumb && (
          <Link href={hit.href} className="h-14 w-14 shrink-0 overflow-hidden rounded border border-line bg-panel-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={hit.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">{kindLabel[hit.kind]}</span>
            <Link href={hit.href} className="text-[14px] font-semibold text-ink hover:text-accent hover:underline">
              {hit.title}
            </Link>
            {hit.flag && <FlagBadge flag={hit.flag} />}
            {hit.status && <span className="rounded bg-panel-muted px-1.5 text-[11px] text-ink-2 ring-1 ring-line">{hit.status}</span>}
          </div>
          <div className="text-[12px] text-ink-3">{hit.subtitle}</div>
          {hit.snippet && (
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-2">
              <span className="mr-1 text-[11px] text-ink-3">{hit.snippet.field}:</span>
              <Marked snippet={hit.snippet} />
            </p>
          )}
          {hit.links && hit.links.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {hit.links.map((l) => (
                <Link key={l.href} href={l.href} className="rounded border border-line px-1.5 text-[11.5px] text-ink-2 hover:border-accent hover:text-accent">
                  {l.label}
                </Link>
              ))}
            </div>
          )}
        </div>
        <Link href={hit.href} className="shrink-0 self-start text-[12px] text-accent hover:underline">
          Open →
        </Link>
      </div>
      {hit.series && <SeriesView hit={hit} />}
    </article>
  );
}

const SHOW_ROWS = 6;

// Every value of a lab test, vital sign or report measurement, with its trend.
function SeriesView({ hit }: { hit: SearchHit }) {
  const s = hit.series!;
  const [all, setAll] = useState(false);
  const numeric = s.points.filter((p) => p.v !== null);
  const rows = [...s.points].reverse();
  const shown = all ? rows : rows.slice(0, SHOW_ROWS);
  return (
    <div className="grid gap-3 border-t border-line px-4 py-3 md:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        {numeric.length >= 2 ? (
          <TrendChart
            series={[{ name: hit.title, points: numeric.map((p) => ({ t: p.t, v: p.v!, flag: p.flag, imported: p.imported, href: p.href })) }]}
            unit={s.unit}
            refLow={s.refLow}
            refHigh={s.refHigh}
            height={170}
          />
        ) : (
          <div className="flex h-full items-center justify-center py-6 text-[12px] text-ink-3">{numeric.length === 1 ? "Only one numeric value so far, so no trend yet." : "Text results, no graph."}</div>
        )}
        {s.graphHref && (
          <Link href={s.graphHref} className="mt-1 inline-block text-[12px] text-accent hover:underline">
            Open in the graph view, with other results →
          </Link>
        )}
      </div>
      <div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] text-ink-3">
              <th className="pb-1 font-medium">Date</th>
              <th className="pb-1 text-right font-medium">
                Value{s.unit ? ` (${s.unit})` : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((p, i) => (
              <tr key={i} className="border-t border-line">
                <td className="py-1">
                  <Link href={p.href} className="hover:text-accent hover:underline" title={p.source ? `From ${p.source}` : "Open the source"}>
                    {new Date(p.t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    {p.imported && <span className="ml-1 text-[10px] text-ink-3" title="Imported from an outside report">◆</span>}
                  </Link>
                </td>
                <td className={`tabular py-1 text-right ${flagText(p.flag)}`}>
                  {p.text}
                  <FlagBadge flag={p.flag} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > SHOW_ROWS && (
          <button onClick={() => setAll(!all)} className="mt-1 text-[12px] text-accent hover:underline">
            {all ? "Show fewer" : `Show all ${rows.length} values`}
          </button>
        )}
        {(s.refLow !== null || s.refHigh !== null || s.refText) && (
          <p className="mt-1 text-[11px] text-ink-3">Reference range {s.refText || `${s.refLow ?? ""}–${s.refHigh ?? ""}`}</p>
        )}
      </div>
    </div>
  );
}
