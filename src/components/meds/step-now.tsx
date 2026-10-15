import { currentStep, parseSteps, totalDays } from "@/lib/meds/steps";

// Where a patient is in a taper or "followed by" prescription today, counted from the day it was written.
export function StepNow({ steps: raw, written, className = "" }: { steps: unknown; written: Date; className?: string }) {
  const steps = parseSteps(raw);
  if (!steps) return null;
  const now = currentStep(steps, written);
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
