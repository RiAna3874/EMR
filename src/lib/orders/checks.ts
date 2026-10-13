// Order safety checks: allergies, duplicates, too-soon repeats, and a few
// kidney-function and interaction rules. Pure, so the composer can warn before
// an order is added and the pending list can show the same warnings.
import { satisfyingCodes, type Orderable } from "./catalog";
import { classesForAllergy } from "@/lib/meds/drugs";
import { medWarnings, type MedWarning, type RxInput } from "@/lib/meds/checks";

export type OrderContext = {
  allergies: { substance: string; severity: string }[];
  // Orders already pending or active for this patient, by orderable code.
  openOrders: { code: string; status: string }[];
  // Most recent lab result date (ms) by report code and by LOINC code.
  lastResulted: Record<string, number>;
  activeMeds: string[];
  egfr: number | null;
  ageYears?: number | null;
  now: number;
};

export type OrderWarning = MedWarning;

export { classesForAllergy };

const DAY = 86_400_000;

// Medication orders get the full prescribing checks (src/lib/meds/checks.ts),
// against the sig being ordered when `rx` is given and the defaults otherwise.
export function orderWarnings(o: Orderable, ctx: OrderContext, opts: { ignoreOpenOrder?: boolean; rx?: RxInput & { drug?: string } } = {}): OrderWarning[] {
  const out: OrderWarning[] = [];

  if (o.contrast) {
    for (const a of ctx.allergies) {
      if (classesForAllergy(a.substance).includes("iodinated-contrast")) {
        out.push({ kind: "allergy", level: "stop", text: `Allergy: ${a.substance} (${a.severity}). ${o.display} is a contrast study.` });
      }
    }
  }

  if (!opts.ignoreOpenOrder) {
    const open = ctx.openOrders.find((x) => x.code === o.code);
    if (open) out.push({ level: "caution", text: open.status === "pending" ? "Already in pending orders." : "Already ordered and not yet resulted." });
  }

  if (o.repeatDays) {
    const times = satisfyingCodes(o).map((c) => ctx.lastResulted[c]).filter((t) => t !== undefined);
    const last = times.length ? Math.max(...times) : undefined;
    if (last !== undefined) {
      const days = Math.floor((ctx.now - last) / DAY);
      if (days < o.repeatDays) out.push({ level: "caution", text: `Last resulted ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}.` });
    }
  }

  if (o.med) {
    const rx = opts.rx ?? { dose: o.med.dose, frequency: o.med.frequency, refills: o.med.refills };
    out.push(...medWarnings(opts.rx?.drug ?? o.display, rx, ctx));
  }

  if (o.contrast && ctx.egfr !== null && ctx.egfr < 30) out.push({ kind: "kidney", level: "stop", text: `eGFR ${ctx.egfr}: iodinated contrast risks kidney injury.` });
  return out;
}
