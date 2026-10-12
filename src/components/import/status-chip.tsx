import type { ImportStatus } from "@prisma/client";

const styles: Record<ImportStatus, [string, string]> = {
  extracting: ["Reading…", "bg-accent-soft text-accent border-accent/30"],
  needs_review: ["Needs review", "bg-warn-soft text-warn border-warn/30"],
  failed: ["Couldn't read", "bg-crit-soft text-crit border-crit/30"],
  filed: ["Filed", "bg-panel-muted text-ok border-line"],
  discarded: ["Discarded", "bg-panel-muted text-ink-3 border-line"],
};

export function ImportStatusChip({ status }: { status: ImportStatus }) {
  const [label, cls] = styles[status];
  return <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}
