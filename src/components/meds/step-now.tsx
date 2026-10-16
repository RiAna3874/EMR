import { currentStep, parseSteps, totalDays } from "@/lib/meds/steps";
import { toLocalDate } from "@/lib/format";
import { relativeDayLabel } from "@/lib/orders/dates";

const ymd = (d: Date) => d.toISOString().slice(0, 10);

// When a prescription's course starts (if still ahead) or ends: "Starts tomorrow", "Ends 19 Oct 2026".
export function CourseDates({ med, className = "" }: { med: { courseStart: Date | null; end: Date | null; status: string }; className?: string }) {
  if (med.status !== "active" && med.status !== "on_hold") return null;
  const today = toLocalDate(new Date());
  const start = med.courseStart && ymd(med.courseStart) > today ? ymd(med.courseStart) : null;
  const end = med.end ? ymd(med.end) : null;
  if (!start && !end) return null;
  const words = (d: string) => relativeDayLabel(d, today).replace(/^(Today|Tomorrow|Yesterday)$/, (w) => w.toLowerCase());
  const parts = [start && `Starts ${words(start)}`, end && (end < today ? `Ended ${words(end)}` : `${start ? "ends" : "Ends"} ${words(end)}`)].filter(Boolean);
  return <div className={`text-[12px] ${start ? "font-medium text-warn" : "text-ink-3"} ${className}`}>{parts.join(", ")}</div>;
}

// Where a patient is in a taper or "followed by" prescription today, counted from the day it was written.
export function StepNow({ steps: raw, written, className = "" }: { steps: unknown; written: Date; className?: string }) {
  const steps = parseSteps(raw);
  if (!steps) return null;
  const now = currentStep(steps, written);
  // Not started yet: CourseDates says when it starts.
  if (ymd(written) > toLocalDate(new Date())) return null;
  if ("done" in now) return <div className={`text-[12px] text-ink-3 ${className}`}>All {steps.length} steps finished (day {now.day}).</div>;
  const s = steps[now.index];
  const total = totalDays(steps);
  return (
    <div className={`text-[12px] text-accent ${className}`}>
      Day {now.day}
      {total ? ` of ${total}` : ""}: step {now.index + 1} of {steps.length}, {s.dose} {s.frequency}
      {now.to === null ? "" : now.to === now.day ? " (last day of this step)" : ` through day ${now.to}`}
    </div>
  );
}
