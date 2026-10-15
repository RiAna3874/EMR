// Multi-step doses, as Epic writes them: one prescription whose sig changes over time.
// A taper (40 mg daily for 5 days, then 30 mg…, then stop), a ramp-up (titration), or a
// loading dose "followed by" a maintenance dose. Steps run one after another; every step
// but the last needs a number of days, and a last step with no days goes on until stopped.
// Pure: the composer, the checks, the printed and texted prescriptions all read these.
import type { Product } from "./formulary";
import { timesPerDay, unitsPerDose } from "./sig";

export type DoseStep = { dose: string; frequency: string; days: number | null };

const MAX_STEPS = 12;

// Steps from stored JSON or a form, or null unless there are at least two good ones.
export function parseSteps(v: unknown): DoseStep[] | null {
  let raw = v;
  if (typeof raw === "string") {
    if (!raw.trim()) return null;
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_STEPS) return null;
  const steps: DoseStep[] = [];
  for (const [i, s] of raw.entries()) {
    if (!s || typeof s !== "object") return null;
    const dose = String((s as DoseStep).dose ?? "").trim();
    const frequency = String((s as DoseStep).frequency ?? "")
      .trim()
      .replace(/\s+for \d+ days?$/, "");
    const n = Number((s as DoseStep).days);
    const days =
      (s as DoseStep).days === null || (s as DoseStep).days === undefined || String((s as DoseStep).days) === ""
        ? null
        : Number.isFinite(n)
          ? Math.round(n)
          : NaN;
    if (!dose || !frequency || Number.isNaN(days) || (days !== null && (days < 1 || days > 365))) return null;
    // Only the last step can run on without an end.
    if (days === null && i < raw.length - 1) return null;
    steps.push({ dose, frequency, days });
  }
  return steps;
}

// What's wrong with steps being written, for the composer; null when they can be signed.
export function stepsProblem(steps: DoseStep[]): string | null {
  if (steps.length < 2) return "Add a second step, or switch back to a single dose.";
  for (const [i, s] of steps.entries()) {
    if (!s.dose.trim() || !s.frequency.trim()) return `Step ${i + 1} needs a dose and a frequency.`;
    if (i < steps.length - 1 && !s.days) return `Step ${i + 1} needs a number of days, since another step follows it.`;
  }
  return null;
}

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

// Days the whole course lasts, or null when the last step goes on.
export function totalDays(steps: DoseStep[]): number | null {
  if (steps.some((s) => !s.days)) return null;
  return steps.reduce((t, s) => t + (s.days ?? 0), 0);
}

// "daily for 5 days, then 30 mg daily for 5 days, then stop": what is stored as the
// medication's frequency after its first dose, so anything that reads only dose and
// frequency still shows the whole course.
export function stepsFrequency(steps: DoseStep[]): string {
  const [first, ...rest] = steps;
  const head = `${first.frequency}${first.days ? ` for ${days(first.days)}` : ""}`;
  const tail = rest.map((s) => `${s.dose} ${s.frequency}${s.days ? ` for ${days(s.days)}` : ""}`);
  return [head, ...tail].join(", then ") + (totalDays(steps) ? ", then stop" : "");
}

// "40 mg daily for 5 days, then 30 mg daily for 5 days, then stop"
export const stepsText = (steps: DoseStep[]) => `${steps[0].dose} ${stepsFrequency(steps)}`;

// Units to dispense for the whole course; an open-ended last step is supplied for `openDays`.
export function stepsQuantity(product: Product, steps: DoseStep[], openDays: number): string | null {
  let n = 0;
  for (const s of steps) {
    const perDose = unitsPerDose(s.dose, product);
    const perDay = timesPerDay(s.frequency);
    if (perDose === null || perDay === null) return null;
    n += perDose * perDay * (s.days ?? openDays);
  }
  const total = Math.ceil(n - 1e-9);
  return total > 0 ? `${total} ${product.unit}` : null;
}

// The days a dispensed quantity covers: the whole course, plus the open step's supply.
export const stepsDaysSupply = (steps: DoseStep[], openDays: number) => steps.reduce((t, s) => t + (s.days ?? openDays), 0);

// Which step a patient is on, counting from the day the prescription was written.
export function currentStep(
  steps: DoseStep[],
  written: Date,
  now = new Date(),
): { index: number; day: number; from: number; to: number | null } | { done: true; day: number } {
  const DAY = 86_400_000;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const day = Math.floor((startOf(now) - startOf(written)) / DAY) + 1;
  let from = 1;
  for (const [index, s] of steps.entries()) {
    const to = s.days ? from + s.days - 1 : null;
    if (to === null || day <= to) return { index, day: Math.max(1, day), from, to };
    from = to + 1;
  }
  return { done: true, day };
}

export type TaperPlan = {
  from: string; // starting amount, e.g. "40"
  to: string; // last amount before stopping (or the dose to stay on)
  by: string; // change at each step
  unit: string; // "mg"
  frequency: string;
  every: number; // days at each dose
  // A ramp up stays on its last dose; a taper ends with "then stop" unless asked to stay.
  hold?: boolean;
};

// Epic's taper/ramp calculator: from a starting dose, change by a fixed amount every so
// many days down to (or up to) a final dose. Returns null when the numbers don't make one.
export function buildTaper(p: TaperPlan): DoseStep[] | null {
  const a = Number(p.from);
  const b = Number(p.to);
  const by = Math.abs(Number(p.by));
  if (![a, b, by].every(Number.isFinite) || by <= 0 || a < 0 || b < 0 || a === b || !p.frequency.trim() || !(p.every >= 1)) return null;
  const n = Math.floor(Math.abs(a - b) / by + 1e-9) + 1;
  if (n < 2 || n > MAX_STEPS) return null;
  const down = b < a;
  const amounts = Array.from({ length: n }, (_, i) => Math.round((down ? a - i * by : a + i * by) * 1000) / 1000);
  // A step that doesn't land on the final dose gets one more step at it.
  if (amounts[n - 1] !== b) {
    if (n + 1 > MAX_STEPS) return null;
    amounts.push(b);
  }
  // Tapering to zero just means stopping after the last real dose.
  const doses = amounts.filter((x) => x > 0);
  if (doses.length < 2) return null;
  const hold = p.hold ?? !down;
  return doses.map((x, i) => ({
    dose: p.unit ? `${x} ${p.unit}` : String(x),
    frequency: p.frequency.trim(),
    days: hold && i === doses.length - 1 ? null : p.every,
  }));
}
