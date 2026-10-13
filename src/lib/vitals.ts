import type { Flag } from "@prisma/client";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const num = (f: FormData, k: string) => {
  const s = str(f, k);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

function flagFor(value: number, low?: number, high?: number): Flag | null {
  if (low === undefined || high === undefined) return null;
  return value < low ? "L" : value > high ? "H" : "N";
}

// Observation rows for the vitals entry fields (src/components/vitals-fields.tsx);
// blank fields are skipped and BMI is computed from weight and height.
export function vitalObservations(form: FormData, { patientId, at, encounterId }: { patientId: string; at: Date; encounterId?: string }) {
  const weight = num(form, "weight");
  const height = num(form, "height");
  const entries: { code: string; display: string; value: number | null; unit: string; low?: number; high?: number }[] = [
    { code: "8480-6", display: "Systolic BP", value: num(form, "sbp"), unit: "mm[Hg]", low: 90, high: 129 },
    { code: "8462-4", display: "Diastolic BP", value: num(form, "dbp"), unit: "mm[Hg]", low: 60, high: 79 },
    { code: "8867-4", display: "Heart rate", value: num(form, "hr"), unit: "/min", low: 60, high: 100 },
    { code: "9279-1", display: "Respiratory rate", value: num(form, "rr"), unit: "/min", low: 12, high: 20 },
    { code: "8310-5", display: "Temperature", value: num(form, "temp"), unit: "Cel", low: 36.1, high: 37.8 },
    { code: "59408-5", display: "SpO2", value: num(form, "spo2"), unit: "%", low: 95, high: 100 },
    { code: "29463-7", display: "Weight", value: weight, unit: "kg" },
    { code: "8302-2", display: "Height", value: height, unit: "cm" },
    {
      code: "39156-5",
      display: "BMI",
      value: weight && height ? Math.round((weight / (height / 100) ** 2) * 10) / 10 : null,
      unit: "kg/m2",
      low: 18.5,
      high: 24.9,
    },
    { code: "72514-3", display: "Pain score", value: num(form, "pain"), unit: "{score}" },
  ];
  const data = entries
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
      refLow: e.low ?? null,
      refHigh: e.high ?? null,
      flag: flagFor(e.value!, e.low, e.high),
      effectiveAt: at,
      sortOrder: e.sortOrder,
    }));
  return data;
}
