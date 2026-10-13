import { Field, inputCls } from "@/components/form";

// Vitals inputs, read by vitalObservations (src/lib/vitals.ts). Used on the
// Vitals tab and when rooming a patient.
export function VitalsFields({ lastHeight }: { lastHeight?: number | null }) {
  return (
    <>
      <Field label="BP (mmHg)">
        <div className="flex items-center gap-1">
          <input name="sbp" inputMode="numeric" placeholder="120" className={`${inputCls} w-14`} />
          <span className="text-ink-3">/</span>
          <input name="dbp" inputMode="numeric" placeholder="80" className={`${inputCls} w-14`} />
        </div>
      </Field>
      <Field label="HR (/min)">
        <input name="hr" inputMode="numeric" className={`${inputCls} w-16`} />
      </Field>
      <Field label="RR (/min)">
        <input name="rr" inputMode="numeric" className={`${inputCls} w-16`} />
      </Field>
      <Field label="Temp (°C)">
        <input name="temp" inputMode="decimal" className={`${inputCls} w-16`} />
      </Field>
      <Field label="SpO₂ (%)">
        <input name="spo2" inputMode="numeric" className={`${inputCls} w-16`} />
      </Field>
      <Field label="Weight (kg)">
        <input name="weight" inputMode="decimal" className={`${inputCls} w-20`} />
      </Field>
      <Field label="Height (cm)">
        <input name="height" inputMode="decimal" defaultValue={lastHeight ?? ""} className={`${inputCls} w-20`} />
      </Field>
      <Field label="Pain (0–10)">
        <input name="pain" inputMode="numeric" className={`${inputCls} w-16`} />
      </Field>
    </>
  );
}
