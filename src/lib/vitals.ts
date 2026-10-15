import type { Flag } from "@prisma/client";
import { age } from "@/lib/format";
import { GLUCOSE_LIMITS, GLUCOSE_TIMINGS, glucoseFlag, mgToMmol } from "@/lib/glucose";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const s = str(f, k);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
};

function flagFor(value: number, low?: number, high?: number): Flag | null {
  if (low === undefined || high === undefined) return null;
  return value < low ? "L" : value > high ? "H" : "N";
}

// Values outside these can't be a living patient's: almost always a typo or the wrong unit.
// The vitals fields (src/components/vitals-fields.tsx) use the same limits.
export const VITAL_LIMITS = {
  sbp: { label: "Systolic BP", min: 40, max: 300 },
  dbp: { label: "Diastolic BP", min: 20, max: 200 },
  hr: { label: "Heart rate", min: 20, max: 300 },
  rr: { label: "Respiratory rate", min: 4, max: 100 },
  tempC: { label: "Temperature", min: 30, max: 45 },
  tempF: { label: "Temperature", min: 86, max: 113 },
  spo2: { label: "SpO2", min: 40, max: 100 },
  weight: { label: "Weight", min: 0.3, max: 350 },
  height: { label: "Height", min: 25, max: 250 },
  pain: { label: "Pain score", min: 0, max: 10 },
} as const;

// Normal heart and breathing rates awake, by age (paediatric life support tables).
// Blood pressure isn't flagged under 18: children's limits depend on height centiles.
export function normalRanges(ageYears: number | null) {
  const a = ageYears ?? 18;
  const [hr, rr] =
    a < 1 ? [[100, 160], [30, 60]] : a < 3 ? [[90, 150], [24, 40]] : a < 6 ? [[80, 140], [22, 34]] : a < 12 ? [[70, 120], [18, 30]] : a < 18 ? [[60, 100], [12, 20]] : [[60, 100], [12, 20]];
  const adult = a >= 18;
  return { hr, rr, sbp: adult ? [90, 129] : null, dbp: adult ? [60, 79] : null, bmi: adult ? [18.5, 24.9] : null };
}

export const fahrenheitToCelsius = (f: number) => Math.round(((f - 32) * 5) / 9 * 10) / 10;

type Entry = { code: string; display: string; value: number | null; unit: string; range?: readonly number[] | null; flag?: Flag | null };

// Observation rows for the vitals entry fields; blank fields are skipped and BMI is
// computed from weight and height. Temperature can be typed in °F or °C and is kept in °C;
// POC glucose in mmol/L or mg/dL and is kept in mmol/L, filed under its timing.
// Returns an error instead when a value can't be right, so nothing is filed.
export function vitalObservations(
  form: FormData,
  { patientId, at, encounterId, dob }: { patientId: string; at: Date; encounterId?: string; dob?: Date | null },
): { data: ReturnType<typeof rows>; error: string | null } {
  const fahrenheit = str(form, "tempUnit") !== "C";
  const values = {
    sbp: num(form, "sbp"),
    dbp: num(form, "dbp"),
    hr: num(form, "hr"),
    rr: num(form, "rr"),
    temp: num(form, "temp"),
    spo2: num(form, "spo2"),
    weight: num(form, "weight"),
    height: num(form, "height"),
    pain: num(form, "pain"),
    glucose: num(form, "glucose"),
  };
  const mg = str(form, "glucoseUnit") === "mg";
  const timing = GLUCOSE_TIMINGS.find((t) => t.key === str(form, "glucoseTiming")) ?? GLUCOSE_TIMINGS[1];
  const check: [number | null, { label: string; min: number; max: number }, string][] = [
    [values.sbp, VITAL_LIMITS.sbp, "mmHg"],
    [values.dbp, VITAL_LIMITS.dbp, "mmHg"],
    [values.hr, VITAL_LIMITS.hr, "/min"],
    [values.rr, VITAL_LIMITS.rr, "/min"],
    [values.temp, fahrenheit ? VITAL_LIMITS.tempF : VITAL_LIMITS.tempC, fahrenheit ? "°F" : "°C"],
    [values.spo2, VITAL_LIMITS.spo2, "%"],
    [values.weight, VITAL_LIMITS.weight, "kg"],
    [values.height, VITAL_LIMITS.height, "cm"],
    [values.pain, VITAL_LIMITS.pain, ""],
    [values.glucose, mg ? GLUCOSE_LIMITS.mg : GLUCOSE_LIMITS.mmol, mg ? "mg/dL" : "mmol/L"],
  ];
  for (const [v, lim, unit] of check) {
    if (v === null) continue;
    if (Number.isNaN(v)) return { data: [], error: `${lim.label} must be a number.` };
    if (v < lim.min || v > lim.max) {
      const hint =
        lim.label === "Temperature" ? ` Is the unit right (°F or °C)?` : lim.label === "POC glucose" ? ` Is the unit right (mmol/L or mg/dL)?` : "";
      return { data: [], error: `${lim.label} ${v} ${unit} is outside ${lim.min} to ${lim.max} ${unit}.${hint} Nothing was filed.`.replace(/ +\./g, ".") };
    }
  }
  if (values.sbp !== null && values.dbp !== null && values.dbp >= values.sbp) {
    return { data: [], error: "Diastolic BP must be lower than systolic. Nothing was filed." };
  }
  if ((values.sbp === null) !== (values.dbp === null)) return { data: [], error: "Enter both numbers of the blood pressure. Nothing was filed." };

  const r = normalRanges(dob ? age(dob, at) : null);
  const { weight, height } = values;
  const entries: Entry[] = [
    { code: "8480-6", display: "Systolic BP", value: values.sbp, unit: "mm[Hg]", range: r.sbp },
    { code: "8462-4", display: "Diastolic BP", value: values.dbp, unit: "mm[Hg]", range: r.dbp },
    { code: "8867-4", display: "Heart rate", value: values.hr, unit: "/min", range: r.hr },
    { code: "9279-1", display: "Respiratory rate", value: values.rr, unit: "/min", range: r.rr },
    { code: "8310-5", display: "Temperature", value: values.temp === null ? null : fahrenheit ? fahrenheitToCelsius(values.temp) : values.temp, unit: "Cel", range: [36.1, 37.8] },
    { code: "59408-5", display: "SpO2", value: values.spo2, unit: "%", range: [95, 100] },
    { code: "29463-7", display: "Weight", value: weight, unit: "kg" },
    { code: "8302-2", display: "Height", value: height, unit: "cm" },
    { code: "39156-5", display: "BMI", value: weight && height ? Math.round((weight / (height / 100) ** 2) * 10) / 10 : null, unit: "kg/m2", range: r.bmi },
    { code: "72514-3", display: "Pain score", value: values.pain, unit: "{score}" },
    ...GLUCOSE_TIMINGS.map((t) => {
      const mmol = t === timing && values.glucose !== null ? (mg ? mgToMmol(values.glucose) : values.glucose) : null;
      return { code: t.code, display: `POC glucose (${t.label.toLowerCase()})`, value: mmol, unit: "mmol/L", range: t.range, flag: mmol === null ? null : glucoseFlag(mmol, t.range) };
    }),
  ];
  return { data: rows(entries, { patientId, at, encounterId }), error: null };
}

function rows(entries: Entry[], { patientId, at, encounterId }: { patientId: string; at: Date; encounterId?: string }) {
  return entries
    .map((e, sortOrder) => ({ ...e, sortOrder }))
    .filter((e) => e.value !== null)
    .map((e) => ({
      patientId,
      encounterId: encounterId ?? null,
      category: "vital_signs" as const,
      code: e.code,
      display: e.display,
      valueNum: e.value,
      unit: e.unit,
      refLow: e.range?.[0] ?? null,
      refHigh: e.range?.[1] ?? null,
      flag: e.flag ?? flagFor(e.value!, e.range?.[0], e.range?.[1]),
      effectiveAt: at,
      sortOrder: e.sortOrder,
    }));
}

export const VITALS_CHANGE_REASONS = ["Typing mistake", "Wrong unit", "Typed in the wrong box", "Other"];

export type VitalRow = ReturnType<typeof rows>[number];
type StoredVital = { id: string; code: string; valueNum: number | null; unit: string | null; refLow: number | null; refHigh: number | null; flag: Flag | null };

// Fixing one set of vitals: the set as re-entered, compared with what was filed.
// A changed number is corrected (old value kept), a cleared box removes that reading,
// a filled-in empty box adds one. BMI follows weight and height on its own.
export function planVitalsEdit(stored: StoredVital[], next: VitalRow[]) {
  const nextByCode = new Map(next.map((n) => [n.code, n]));
  const storedCodes = new Set(stored.map((s) => s.code));
  const change: { from: StoredVital; to: VitalRow }[] = [];
  const remove: StoredVital[] = [];
  for (const s of stored) {
    const n = nextByCode.get(s.code);
    if (!n) remove.push(s);
    else if (n.valueNum !== s.valueNum || n.unit !== s.unit) change.push({ from: s, to: n });
  }
  const add = next.filter((n) => !storedCodes.has(n.code));
  return { change, remove, add, empty: !change.length && !remove.length && !add.length };
}

const celsiusToFahrenheit = (c: number) => Math.round((c * 9) / 5 * 10 + 320) / 10;

// The vitals entry fields filled in with a filed set, for editing it. Temperature
// is shown in °F as it's usually typed; it converts back to the same °C.
export function vitalsFormValues(stored: { code: string; valueNum: number | null }[]) {
  const v = (code: string) => stored.find((s) => s.code === code)?.valueNum ?? null;
  const s = (n: number | null) => (n === null ? "" : String(n));
  const temp = v("8310-5");
  const glucose = stored.find((o) => GLUCOSE_TIMINGS.some((t) => t.code === o.code) && o.valueNum !== null);
  return {
    sbp: s(v("8480-6")),
    dbp: s(v("8462-4")),
    hr: s(v("8867-4")),
    rr: s(v("9279-1")),
    temp: temp === null ? "" : String(celsiusToFahrenheit(temp)),
    spo2: s(v("59408-5")),
    weight: s(v("29463-7")),
    height: s(v("8302-2")),
    pain: s(v("72514-3")),
    glucose: glucose ? s(glucose.valueNum) : "",
    glucoseTiming: GLUCOSE_TIMINGS.find((t) => t.code === glucose?.code)?.key ?? "random",
  };
}
