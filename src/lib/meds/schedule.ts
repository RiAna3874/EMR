// How a medicine is written on a Bangladeshi prescription: the morning + noon + night
// pattern ("1+0+1"), before or after food, and for how long ("7 days", or "continue").
// Pure: used by the printed visit prescription and its tests.
import { bnDigits } from "@/lib/visits/bangla";
import type { Product } from "./formulary";
import { unitsPerDose } from "./sig";

export type Lang = "en" | "bn";

export type ScheduleInput = {
  drug: string;
  dose: string;
  frequency: string;
  prn: boolean;
  prnReason?: string | null;
  patientInstructions?: string | null;
  start?: Date | null; // when this prescription was written
  end?: Date | null;
};

export type Schedule = {
  form: string | null; // "Tab.", "Cap."…
  pattern: string | null; // "1+0+1" / "১+০+১"
  amount: string | null; // the dose, when the pattern can't count it ("10 units")
  how: string | null; // "every 4 hours", "once weekly", "if needed"…
  food: string | null; // "after food" / "খাবার পরে"
  duration: string | null; // "7 days" / "৭ দিন", "continue" / "চলবে", or nothing for as-needed medicines
};

const T = {
  afterFood: { en: "after food", bn: "খাবার পরে" },
  beforeFood: { en: "before food", bn: "খাবারের আগে" },
  bedtime: { en: "at bedtime", bn: "রাতে ঘুমানোর আগে" },
  ifNeeded: { en: "if needed", bn: "প্রয়োজনে" },
  continue: { en: "continue", bn: "চলবে" },
  days: { en: (n: number) => `${n} day${n === 1 ? "" : "s"}`, bn: (n: number) => `${bnDigits(n)} দিন` },
  everyHours: { en: (n: number) => `every ${n} hours`, bn: (n: number) => `${bnDigits(n)} ঘণ্টা পর পর` },
  weekly: { en: "once a week", bn: "সপ্তাহে ১ বার" },
  monthly: { en: "once a month", bn: "মাসে ১ বার" },
  alternate: { en: "every other day", bn: "একদিন পর পর" },
  once: { en: "one dose only", bn: "একবার" },
} as const;

// Tab./Cap./Syp. as written before the medicine's name.
export function dosageForm(drug: string, product?: Pick<Product, "unit">): string | null {
  const s = `${drug} ${product?.unit ?? ""}`.toLowerCase();
  if (/syrup|suspension|elixir|oral solution|\bsyp\b/.test(s)) return "Syp.";
  if (/inhaler|\bpuffs?\b|inhalation/.test(s)) return "Inh.";
  if (/injection|\bpens?\b|vial|ampoule|\binj\b/.test(s)) return "Inj.";
  if (/cream|ointment|gel\b|lotion/.test(s)) return "Oint.";
  if (/drops?\b/.test(s)) return "Drop";
  if (/suppositor/.test(s)) return "Supp.";
  if (/sachet|powder/.test(s)) return "Sachet";
  if (/capsule|\bcap\b/.test(s)) return "Cap.";
  if (/tablet|\btab\b|\bodt\b/.test(s)) return "Tab.";
  return null;
}

// ½, 1½, ¼: how part-tablets are written.
const FRACTIONS: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };
function count(n: number, lang: Lang) {
  const whole = Math.floor(n + 1e-9);
  const frac = FRACTIONS[String(Math.round((n - whole) * 100) / 100)];
  const s = n - whole < 1e-6 ? String(whole) : frac ? `${whole || ""}${frac}` : String(Math.round(n * 100) / 100);
  return lang === "bn" ? bnDigits(s) : s;
}

// Morning, noon, night (and late night for four times a day), or null when the
// frequency isn't one of these daily patterns.
function slots(frequency: string): number[] | null {
  const f = frequency.toLowerCase();
  if (/four times|\bqid\b|\bqds\b|every 6 hours/.test(f)) return [1, 1, 1, 1];
  if (/three times|\btid\b|\btds\b|every 8 hours/.test(f)) return [1, 1, 1];
  if (/twice|two times|\bbid\b|\bbd\b|every 12 hours/.test(f)) return [1, 0, 1];
  if (/every other day|alternate|weekly|monthly|every \d+ hours/.test(f)) return null;
  if (/nightly|bedtime|at night|evening|\bhs\b/.test(f)) return [0, 0, 1];
  if (/once daily|^daily|\bdaily\b|once a day|morning|breakfast|\bqd\b|\bod\b/.test(f)) return [1, 0, 0];
  return null;
}

function how(frequency: string, lang: Lang): string | null {
  const f = frequency.toLowerCase();
  const hours = f.match(/every\s+(\d+)\s*(?:to\s*\d+\s*)?hours?/);
  if (hours) return T.everyHours[lang](Number(hours[1]));
  if (/weekly|every week/.test(f)) return T.weekly[lang];
  if (/monthly|every month/.test(f)) return T.monthly[lang];
  if (/every other day|alternate/.test(f)) return T.alternate[lang];
  if (/^once$|single dose|\bstat\b/.test(f)) return T.once[lang];
  return null;
}

function food(text: string, lang: Lang): string | null {
  const t = text.toLowerCase();
  if (/before (meals?|food|breakfast|eating)|empty stomach|\bac\b/.test(t)) return T.beforeFood[lang];
  if (/(with|after) (meals?|food|breakfast|eating)|\bpc\b/.test(t)) return T.afterFood[lang];
  if (/bedtime/.test(t)) return T.bedtime[lang];
  return null;
}

const DAY = 86_400_000;
const dayNumber = (d: Date) => Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY);

// "1 tablet" / "১টি করে" when a dose is a count of tablets or capsules but has no daily pattern.
function unitsText(n: number, drug: string, product: Product | undefined, lang: Lang) {
  if (lang === "bn") return `${count(n, "bn")}টি করে`;
  const unit = (product?.unit ?? (/capsule/i.test(drug) ? "capsules" : "tablets")).replace(/s$/, "");
  return `${count(n, "en")} ${unit}${n > 1 ? "s" : ""}`;
}

export function doseSchedule(m: ScheduleInput, lang: Lang, product?: Product): Schedule {
  // A stored frequency may carry its course ("twice daily for 7 days").
  const course = m.frequency.match(/^(.*?)\s+for (\d+) days?$/);
  const frequency = course ? course[1] : m.frequency;
  const prn = m.prn || /as needed|\bprn\b|\bsos\b/i.test(frequency);

  const perDose = product?.countable ? unitsPerDose(m.dose, product) : (m.dose.match(/^\s*(\d+(?:\.\d+)?)\s*(tablets?|capsules?|tabs?|caps?)\b/i)?.[1] ?? null);
  const units = perDose === null ? null : Number(perDose);
  const pattern = prn ? null : slots(frequency);

  const parts = pattern?.map((s) => (s ? count(units ?? 1, lang) : lang === "bn" ? "০" : "0"));
  const howText = [prn ? `${T.ifNeeded[lang]}${m.prnReason ? ` (${m.prnReason})` : ""}` : null, how(frequency, lang)].filter(Boolean).join(", ") || null;

  // An as-needed medicine with no end date is taken when needed, not "continued".
  let duration: string | null = prn ? null : T.continue[lang];
  if (course) duration = T.days[lang](Number(course[2]));
  else if (m.end && m.start) duration = T.days[lang](Math.max(1, dayNumber(m.end) - dayNumber(m.start) + 1));

  return {
    form: dosageForm(m.drug, product),
    pattern: parts ? parts.join("+") : null,
    // The pattern counts tablets; anything else (mg of a liquid, units of insulin) says the dose too.
    amount: units === null ? m.dose : pattern ? null : unitsText(units, m.drug, product, lang),
    how: howText,
    food: food(`${frequency} ${m.patientInstructions ?? ""}`, lang),
    duration,
  };
}
