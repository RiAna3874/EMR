"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import type { Flag } from "@prisma/client";

export type TrendPoint = { t: number; v: number; flag: Flag | null; imported?: boolean; href?: string };
export type TrendSeries = { name: string; points: TrendPoint[] };

const SERIES_COLORS = ["var(--chrome-2)", "var(--accent)", "#7c3aed"];
const flagColor = (f: Flag | null, fallback: string) =>
  f === "LL" || f === "HH" ? "var(--crit)" : f === "H" || f === "A" ? "var(--high)" : f === "L" ? "var(--low)" : fallback;

const M = { top: 12, right: 16, bottom: 26, left: 44 };

function niceStep(span: number, target: number) {
  const raw = span / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const n = raw / mag;
  return (n >= 5 ? 10 : n >= 2 ? 5 : n >= 1 ? 2 : 1) * mag;
}

const fmtNum = (v: number) => (Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 100) / 100));
function fmtTick(t: number, span: number) {
  const d = new Date(t);
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return span > 400 * 86_400_000 ? `${month} ’${String(d.getFullYear()).slice(2)}` : `${month} ${d.getDate()}`;
}

// Time-proportional line chart with the reference range shaded, flagged points
// colored, imported results drawn as diamonds, and a hover readout.
export function TrendChart({
  series,
  unit,
  refLow,
  refHigh,
  height = 200,
}: {
  series: TrendSeries[];
  unit: string;
  refLow?: number | null;
  refHigh?: number | null;
  height?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<{ s: number; i: number } | null>(null);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const all = series.flatMap((s) => s.points);
  if (all.length === 0) return <div className="py-8 text-center text-ink-3">No numeric results to graph.</div>;

  let t0 = Math.min(...all.map((p) => p.t));
  let t1 = Math.max(...all.map((p) => p.t));
  if (t1 - t0 < 20 * 86_400_000) {
    t0 -= 15 * 86_400_000;
    t1 += 15 * 86_400_000;
  }
  const vals = [...all.map((p) => p.v), ...(refLow != null ? [refLow] : []), ...(refHigh != null ? [refHigh] : [])];
  let v0 = Math.min(...vals);
  let v1 = Math.max(...vals);
  const pad = (v1 - v0 || Math.abs(v1) || 1) * 0.12;
  v0 = v0 >= 0 && v0 - pad < 0 ? 0 : v0 - pad;
  v1 += pad;
  const step = niceStep(v1 - v0, 4);
  v0 = Math.floor(v0 / step) * step;
  v1 = Math.ceil(v1 / step) * step;

  const iw = width - M.left - M.right;
  const ih = height - M.top - M.bottom;
  const x = (t: number) => M.left + ((t - t0) / (t1 - t0)) * iw;
  const y = (v: number) => M.top + ih - ((v - v0) / (v1 - v0)) * ih;

  const yTicks: number[] = [];
  for (let v = v0; v <= v1 + step / 2; v += step) yTicks.push(v);
  const nX = Math.max(2, Math.min(6, Math.floor(iw / 110)));
  const xTicks = Array.from({ length: nX }, (_, i) => t0 + ((t1 - t0) * i) / (nX - 1));

  const bandTop = refHigh != null ? y(Math.min(refHigh, v1)) : M.top;
  const bandBottom = refLow != null ? y(Math.max(refLow, v0)) : M.top + ih;
  const hp = hover ? series[hover.s].points[hover.i] : null;

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    let best = { s: 0, i: 0, d: Infinity };
    for (const [si, s] of series.entries()) {
      for (const [pi, p] of s.points.entries()) {
        const d = Math.abs(x(p.t) - mx);
        if (d < best.d) best = { s: si, i: pi, d };
      }
    }
    setHover(best.d < 40 ? best : null);
  }

  return (
    <div ref={wrap} className="relative w-full select-none">
      <svg width={width} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} role="img" aria-label={`Trend in ${unit}`}>
        {(refLow != null || refHigh != null) && (
          <rect x={M.left} y={bandTop} width={iw} height={Math.max(0, bandBottom - bandTop)} fill="var(--accent-soft)" />
        )}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={M.left} x2={M.left + iw} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray="2 3" />
            <text x={M.left - 6} y={y(v)} dy="0.32em" textAnchor="end" fontSize={10.5} fill="var(--ink-3)">
              {fmtNum(v)}
            </text>
          </g>
        ))}
        {[refLow, refHigh].map((r, i) =>
          r != null && r >= v0 && r <= v1 ? <line key={i} x1={M.left} x2={M.left + iw} y1={y(r)} y2={y(r)} stroke="var(--accent)" strokeOpacity={0.5} /> : null,
        )}
        {xTicks.map((t, i) => (
          <text key={i} x={x(t)} y={height - 8} textAnchor={i === 0 ? "start" : i === nX - 1 ? "end" : "middle"} fontSize={10.5} fill="var(--ink-3)">
            {fmtTick(t, t1 - t0)}
          </text>
        ))}
        <line x1={M.left} x2={M.left + iw} y1={M.top + ih} y2={M.top + ih} stroke="var(--line)" />
        {hp && <line x1={x(hp.t)} x2={x(hp.t)} y1={M.top} y2={M.top + ih} stroke="var(--ink-3)" strokeDasharray="3 3" />}

        {series.map((s, si) => {
          const color = SERIES_COLORS[si % SERIES_COLORS.length];
          const pts = [...s.points].sort((a, b) => a.t - b.t);
          const d = pts.map((p, i) => `${i ? "L" : "M"}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" />
              {s.points.map((p, i) => {
                const cx = x(p.t);
                const cy = y(p.v);
                const fill = flagColor(p.flag, color);
                const big = p.flag === "LL" || p.flag === "HH" || (hover?.s === si && hover.i === i);
                const r = big ? 4.5 : 3.5;
                const mark = p.imported ? (
                  <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} transform={`rotate(45 ${cx} ${cy})`} fill="var(--panel)" stroke={fill} strokeWidth={2} />
                ) : (
                  <circle cx={cx} cy={cy} r={r} fill={fill} stroke="var(--panel)" strokeWidth={1.5} />
                );
                return p.href ? (
                  <Link key={i} href={p.href}>
                    {mark}
                  </Link>
                ) : (
                  <g key={i}>{mark}</g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {hp && hover && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded border border-line bg-panel px-2 py-1 text-[12px] shadow-md"
          style={{ left: Math.min(x(hp.t) + 10, width - 170), top: Math.max(0, y(hp.v) - 46) }}
        >
          <div className="text-ink-3">{new Date(hp.t).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric" })}</div>
          <div className="tabular font-semibold" style={{ color: flagColor(hp.flag, "var(--ink)") }}>
            {series.length > 1 && <span className="font-normal text-ink-2">{series[hover.s].name}: </span>}
            {fmtNum(hp.v)} {unit}
            {hp.flag && hp.flag !== "N" && ` (${hp.flag})`}
          </div>
          {hp.imported && <div className="text-[11px] text-low">Imported from outside report</div>}
        </div>
      )}
      {series.length > 1 && (
        <div className="flex gap-4 pl-11 text-[11.5px] text-ink-2">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-4" style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
