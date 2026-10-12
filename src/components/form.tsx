export const inputCls =
  "rounded border border-line bg-panel px-2 py-1 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  const styles = {
    primary: "bg-accent text-white hover:bg-accent/90 border-accent",
    secondary: "bg-panel text-ink border-line hover:bg-panel-muted",
    ghost: "border-transparent text-ink-2 hover:bg-panel-muted hover:text-ink",
    danger: "border-transparent text-crit hover:bg-crit-soft",
  }[variant];
  return <button {...props} className={`rounded border px-2.5 py-1 text-[12.5px] font-medium ${styles} ${className}`} />;
}

export function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex flex-col gap-0.5 ${className}`}>
      <span className="text-[11px] font-medium text-ink-3">{label}</span>
      {children}
    </label>
  );
}
