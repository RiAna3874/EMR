import type { EncounterStatus } from "@prisma/client";
import { minutesLabel, statusLabel } from "@/lib/scheduling/workflow";

const styles: Record<EncounterStatus, string> = {
  planned: "bg-panel-muted text-ink-2 border-line",
  arrived: "bg-accent-soft text-accent border-accent/30",
  roomed: "bg-low-soft text-low border-low/30",
  in_progress: "bg-warn-soft text-warn border-warn/30",
  finished: "bg-panel text-ok border-ok/30",
  checked_out: "bg-panel-muted text-ink-3 border-line",
  no_show: "bg-crit-soft text-crit border-crit/30",
  cancelled: "bg-panel-muted text-ink-3 border-line line-through",
};

// Status with, for patients in the clinic, how long they have been in it.
export function VisitStatusChip({ status, since, now = new Date() }: { status: EncounterStatus; since?: Date | null; now?: Date }) {
  const timed = since && (status === "arrived" || status === "roomed" || status === "in_progress" || status === "finished");
  const waited = timed ? now.getTime() - since.getTime() : 0;
  // Waiting over 20 minutes to be roomed or seen is worth noticing.
  const long = timed && (status === "arrived" || status === "roomed") && waited > 20 * 60_000;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] ${styles[status]}`}>
      {statusLabel[status]}
      {timed && <span className={`tabular ${long ? "font-semibold text-high" : "opacity-75"}`}>{minutesLabel(waited)}</span>}
    </span>
  );
}
