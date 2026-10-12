// Tiny inline trend line. Points are oldest-first; the reference band is shaded.
export function Sparkline({
  values,
  refLow,
  refHigh,
  width = 72,
  height = 20,
}: {
  values: number[];
  refLow?: number | null;
  refHigh?: number | null;
  width?: number;
  height?: number;
}) {
  if (values.length < 2) return <span className="inline-block" style={{ width, height }} />;
  const pad = 2;
  const lo = Math.min(...values, refLow ?? Infinity);
  const hi = Math.max(...values, refHigh ?? -Infinity);
  const span = hi - lo || 1;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => height - pad - ((v - lo) * (height - pad * 2)) / span;
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values[values.length - 1];
  const out = (refLow != null && last < refLow) || (refHigh != null && last > refHigh);
  const bandTop = refHigh != null ? y(refHigh) : pad;
  const bandBottom = refLow != null ? y(refLow) : height - pad;
  return (
    <svg width={width} height={height} className="inline-block align-middle" aria-hidden>
      {(refLow != null || refHigh != null) && (
        <rect x={0} y={bandTop} width={width} height={Math.max(0, bandBottom - bandTop)} fill="var(--accent-soft)" />
      )}
      <path d={d} fill="none" stroke="var(--ink-3)" strokeWidth={1.25} />
      <circle cx={x(values.length - 1)} cy={y(last)} r={2.2} fill={out ? "var(--high)" : "var(--accent)"} />
    </svg>
  );
}
