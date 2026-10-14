// Sig arithmetic: how often a frequency means per day, how many units a dose
// is, and from those the quantity to dispense and the days a fill lasts.
import type { Product } from "./formulary";

export type Sig = {
  dose: string;
  route: string;
  frequency: string;
  prn?: boolean;
  prnReason?: string | null;
  durationDays?: number | null;
};

// Doses per day for a frequency phrase; for "as needed" sigs this is the most a
// patient could take. null when it can't be read (e.g. "at migraine onset").
export function timesPerDay(frequency: string): number | null {
  const f = frequency.toLowerCase();
  const everyHours = f.match(/every\s+(\d+(?:\.\d+)?)\s*(?:to\s*\d+\s*)?hours?/);
  if (everyHours) return 24 / Number(everyHours[1]);
  if (/once weekly|every week|weekly/.test(f)) return 1 / 7;
  if (/monthly|every month/.test(f)) return 1 / 30;
  if (/every other day|alternate days/.test(f)) return 1 / 2;
  if (/four times|qid/.test(f)) return 4;
  if (/three times|tid/.test(f)) return 3;
  if (/twice|two times|bid/.test(f)) return 2;
  if (/once daily|daily|nightly|at bedtime|every (morning|evening)|once a day|^once\b/.test(f)) return 1;
  return null;
}

// A dose in mg when it states one ("500 mg", "0.05 mg", "75 mcg"), using only the
// first amount in phrases like "500 mg day 1, then 250 mg".
export function doseMg(dose: string, product?: Pick<Product, "unitMg">): number | null {
  const m = dose.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|g)\b/i);
  if (m) {
    const n = Number(m[1]);
    return m[2].toLowerCase() === "mcg" ? n / 1000 : m[2].toLowerCase() === "g" ? n * 1000 : n;
  }
  const units = dose.match(/(\d+(?:\.\d+)?)\s*(tablet|capsule|tab|cap)s?\b/i);
  if (units && product?.unitMg) return Number(units[1]) * product.unitMg;
  return null;
}

// Tablets or capsules per dose.
export function unitsPerDose(dose: string, product: Product): number | null {
  // Loading doses and tapers ("500 mg day 1, then 250 mg") aren't one number.
  if (!product.countable || /then|,/i.test(dose)) return null;
  const units = dose.match(/^\s*(\d+(?:\.\d+)?)\s*(tablet|capsule|tab|cap)s?\b/i);
  if (units) return Number(units[1]);
  const mg = doseMg(dose, product);
  if (mg !== null && product.unitMg) return mg / product.unitMg;
  return null;
}

// What to dispense for a sig over a number of days, e.g. "60 tablets".
export function suggestQuantity(product: Product, sig: Pick<Sig, "dose" | "frequency">, days: number): string | null {
  const perDose = unitsPerDose(sig.dose, product);
  const perDay = timesPerDay(sig.frequency);
  if (perDose === null || perDay === null || !days) return null;
  const n = Math.ceil(perDose * perDay * days - 1e-9);
  return n > 0 ? `${n} ${product.unit}` : null;
}

export const quantityCount = (quantity: string | null | undefined) => {
  const m = quantity?.match(/^\s*(\d+)/);
  return m ? Number(m[1]) : null;
};

// How many days a fill lasts at the full sig.
export function daysSupplyFor(product: Product | undefined, sig: Pick<Sig, "dose" | "frequency">, quantity: string): number | null {
  if (!product?.countable) return null;
  const perDose = unitsPerDose(sig.dose, product);
  const perDay = timesPerDay(sig.frequency);
  const n = quantityCount(quantity);
  if (!perDose || !perDay || !n) return null;
  return Math.floor(n / (perDose * perDay) + 1e-9);
}

export function sigText(sig: Sig) {
  // A stored frequency may carry its course ("twice daily for 7 days").
  const course = sig.frequency.match(/^(.*?)\s+for (\d+) days?$/);
  const s = course && !sig.durationDays ? { ...sig, frequency: course[1], durationDays: Number(course[2]) } : sig;
  const freq = s.prn && s.prnReason && !/as needed/.test(s.frequency) ? `${s.frequency} as needed` : s.frequency;
  const reason = s.prn && s.prnReason ? ` for ${s.prnReason}` : "";
  const duration = s.durationDays ? ` for ${s.durationDays} day${s.durationDays === 1 ? "" : "s"}` : "";
  return `${s.dose} ${s.route}, ${freq}${reason}${duration}`.replace(/\s+,/, ",");
}

const NUMBER_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

// Quantities are written out on paper prescriptions so they can't be altered.
export function numberWords(n: number): string {
  if (n < 20) return NUMBER_WORDS[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${NUMBER_WORDS[n % 10]}` : "");
  if (n < 1000) return `${NUMBER_WORDS[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ""}`;
  return String(n);
}

// "2 tablets" when a dose isn't one tablet or capsule, for the patient's copy.
export function unitsHint(dose: string, product: Product | undefined) {
  if (!product) return null;
  const n = unitsPerDose(dose, product);
  if (n === null || n === 1 || /tablet|capsule/i.test(dose)) return null;
  return `${n} ${n < 1 ? product.unit.replace(/s$/, "") : product.unit}`;
}
