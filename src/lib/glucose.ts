import type { Flag } from "@prisma/client";

// Point-of-care (fingerstick) glucose, filed with the vitals. Kept in mmol/L as
// Bangladeshi clinics read it, with mg/dL shown alongside. Each timing is its own
// flowsheet row because normal differs: fasting is normal up to 5.5, random and
// 2 hours after a meal up to 7.8. Local codes: LOINC has no capillary code per timing.
export const GLUCOSE_TIMINGS = [
  { key: "fasting", code: "poc-glucose-fasting", label: "Fasting", short: "FBS", range: [3.9, 5.5] },
  { key: "random", code: "poc-glucose-random", label: "Random", short: "RBS", range: [3.9, 7.8] },
  { key: "post_meal", code: "poc-glucose-post-meal", label: "2 hours after breakfast", short: "2HABF", range: [3.9, 7.8] },
] as const;

export type GlucoseTiming = (typeof GLUCOSE_TIMINGS)[number]["key"];
export const GLUCOSE_CODES: string[] = GLUCOSE_TIMINGS.map((t) => t.code);
export const isGlucoseCode = (code: string) => GLUCOSE_CODES.includes(code);
export const glucoseTiming = (code: string) => GLUCOSE_TIMINGS.find((t) => t.code === code);

// Below 3.0 is a hypo to treat now; above 16.7 (300 mg/dL) needs a doctor today.
export const GLUCOSE_CRITICAL = { low: 3.0, high: 16.7 };

// What a glucometer can read: 0.6 to 33.3 mmol/L (10 to 600 mg/dL).
export const GLUCOSE_LIMITS = {
  mmol: { label: "POC glucose", min: 0.6, max: 33.3 },
  mg: { label: "POC glucose", min: 10, max: 600 },
} as const;

const MG_PER_MMOL = 18.016;
export const mgToMmol = (mg: number) => Math.round((mg / MG_PER_MMOL) * 10) / 10;
export const mmolToMg = (mmol: number) => Math.round(mmol * MG_PER_MMOL);

export function glucoseFlag(mmol: number, [low, high]: readonly number[]): Flag {
  if (mmol < GLUCOSE_CRITICAL.low) return "LL";
  if (mmol > GLUCOSE_CRITICAL.high) return "HH";
  return mmol < low ? "L" : mmol > high ? "H" : "N";
}

// "6.2 mmol/L (112 mg/dL)"
export const fmtGlucose = (mmol: number) => `${mmol.toFixed(1)} mmol/L (${mmolToMg(mmol)} mg/dL)`;
