// Building blocks for what goes inside a hover card. Plain components, so server pages can fill cards.

export function HoverTitle({ children, sub, tone }: { children: React.ReactNode; sub?: React.ReactNode; tone?: "crit" | "high" | "low" | "warn" }) {
  const color = tone === "crit" ? "text-crit" : tone === "high" ? "text-high" : tone === "low" ? "text-low" : tone === "warn" ? "text-warn" : "text-ink";
  return (
    <div className="border-b border-line bg-panel-muted px-3 py-2">
      <div className={`font-semibold leading-snug ${color}`}>{children}</div>
      {sub && <div className="text-[11.5px] text-ink-3">{sub}</div>}
    </div>
  );
}

// Label/value pairs; empty values are left out.
export function HoverRows({ rows }: { rows: [string, React.ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false);
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 px-3 py-2">
      {shown.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="whitespace-nowrap text-ink-3">{k}</dt>
          <dd className="min-w-0 break-words">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function HoverText({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return <div className={`border-t border-line px-3 py-2 first:border-t-0 ${muted ? "text-[11.5px] text-ink-3" : "text-ink-2"}`}>{children}</div>;
}

// Just a sentence: what a button, badge or icon does.
export function HoverHint({ title, children }: { title?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-3 py-2">
      {title && <div className="font-semibold">{title}</div>}
      <div className="text-ink-2">{children}</div>
    </div>
  );
}
