import { GLUCOSE_TIMINGS, fmtGlucose } from "@/lib/glucose";

// The day's vitals as printed on the visit prescription ("O/E") and shown on the
// visit screen. Temperature is kept in °C and shown in °F, as Bangladeshi clinics read it.
type Obs = { code: string; valueNum: number | null };

export function vitalsSummary(byCode: Map<string, Obs>): { label: string; value: string }[] {
  const n = (code: string) => byCode.get(code)?.valueNum ?? null;
  const out: { label: string; value: string }[] = [];
  const sbp = n("8480-6");
  const dbp = n("8462-4");
  if (sbp !== null && dbp !== null) out.push({ label: "BP", value: `${sbp}/${dbp} mmHg` });
  const add = (code: string, label: string, unit: string, f: (v: number) => number = (v) => v) => {
    const v = n(code);
    if (v !== null) out.push({ label, value: `${f(v)}${unit}` });
  };
  add("8867-4", "Pulse", " /min");
  add("8310-5", "Temp", " °F", (c) => Math.round((c * 9) / 5 * 10 + 320) / 10);
  add("9279-1", "RR", " /min");
  add("59408-5", "SpO₂", "%");
  add("29463-7", "Weight", " kg");
  add("39156-5", "BMI", "");
  for (const t of GLUCOSE_TIMINGS) {
    const v = n(t.code);
    if (v !== null) out.push({ label: t.short, value: fmtGlucose(v) });
  }
  return out;
}
