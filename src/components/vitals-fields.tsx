"use client";

import { useState } from "react";
import { Field, inputCls } from "@/components/form";
import { VITAL_LIMITS } from "@/lib/vitals";
import { GLUCOSE_LIMITS, GLUCOSE_TIMINGS } from "@/lib/glucose";

type VitalsInput = "sbp" | "dbp" | "hr" | "rr" | "temp" | "spo2" | "weight" | "height" | "pain" | "glucose" | "glucoseTiming";

const limits = (k: keyof typeof VITAL_LIMITS, step = "1") => ({ type: "number", min: VITAL_LIMITS[k].min, max: VITAL_LIMITS[k].max, step });

// Vitals inputs, read by vitalObservations (src/lib/vitals.ts). Used on the
// Vitals tab and when rooming a patient. The browser refuses impossible values
// before the form is sent; the server checks them again.
// `initial` fills them in with a filed set when it's being edited.
export function VitalsFields({ lastHeight, initial }: { lastHeight?: number | null; initial?: Partial<Record<VitalsInput, string>> }) {
  const [tempUnit, setTempUnit] = useState<"F" | "C">("F");
  const [glucoseUnit, setGlucoseUnit] = useState<"mmol" | "mg">("mmol");
  const gl = GLUCOSE_LIMITS[glucoseUnit];
  return (
    <>
      <Field label="BP (mmHg)">
        <div className="flex items-center gap-1">
          <input name="sbp" defaultValue={initial?.sbp} inputMode="numeric" placeholder="120" {...limits("sbp")} className={`${inputCls} w-16`} />
          <span className="text-ink-3">/</span>
          <input name="dbp" defaultValue={initial?.dbp} inputMode="numeric" placeholder="80" {...limits("dbp")} className={`${inputCls} w-16`} />
        </div>
      </Field>
      <Field label="HR (/min)">
        <input name="hr" defaultValue={initial?.hr} inputMode="numeric" {...limits("hr")} className={`${inputCls} w-16`} />
      </Field>
      <Field label="RR (/min)">
        <input name="rr" defaultValue={initial?.rr} inputMode="numeric" {...limits("rr")} className={`${inputCls} w-16`} />
      </Field>
      <Field label="Temp">
        <div className="flex items-center gap-1">
          <input name="temp" defaultValue={initial?.temp} inputMode="decimal" {...limits(tempUnit === "F" ? "tempF" : "tempC", "0.1")} className={`${inputCls} w-16`} />
          <input type="hidden" name="tempUnit" value={tempUnit} />
          <div className="flex overflow-hidden rounded border border-line text-[12px]" role="group" aria-label="Temperature unit">
            {(["F", "C"] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={tempUnit === u}
                onClick={() => setTempUnit(u)}
                className={`px-1.5 py-0.5 ${tempUnit === u ? "bg-chrome text-white" : "bg-panel text-ink-2 hover:bg-panel-muted"}`}
              >
                °{u}
              </button>
            ))}
          </div>
        </div>
      </Field>
      <Field label="SpO₂ (%)">
        <input name="spo2" defaultValue={initial?.spo2} inputMode="numeric" {...limits("spo2")} className={`${inputCls} w-16`} />
      </Field>
      <Field label="Weight (kg)">
        <input name="weight" defaultValue={initial?.weight} inputMode="decimal" {...limits("weight", "0.1")} className={`${inputCls} w-20`} />
      </Field>
      <Field label="Height (cm)">
        <input name="height" inputMode="decimal" {...limits("height", "0.1")} defaultValue={initial ? initial.height : (lastHeight ?? "")} className={`${inputCls} w-20`} />
      </Field>
      <Field label="Pain (0–10)">
        <input name="pain" defaultValue={initial?.pain} inputMode="numeric" {...limits("pain")} className={`${inputCls} w-16`} />
      </Field>
      <Field label="POC glucose">
        <div className="flex items-center gap-1">
          <input
            name="glucose"
            defaultValue={initial?.glucose}
            inputMode="decimal"
            type="number"
            min={gl.min}
            max={gl.max}
            step={glucoseUnit === "mmol" ? "0.1" : "1"}
            aria-label="POC glucose"
            className={`${inputCls} w-16`}
          />
          <input type="hidden" name="glucoseUnit" value={glucoseUnit} />
          <div className="flex overflow-hidden rounded border border-line text-[12px]" role="group" aria-label="Glucose unit">
            {(["mmol", "mg"] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={glucoseUnit === u}
                onClick={() => setGlucoseUnit(u)}
                className={`px-1.5 py-0.5 ${glucoseUnit === u ? "bg-chrome text-white" : "bg-panel text-ink-2 hover:bg-panel-muted"}`}
              >
                {u === "mmol" ? "mmol/L" : "mg/dL"}
              </button>
            ))}
          </div>
          <select name="glucoseTiming" defaultValue={initial?.glucoseTiming ?? "random"} aria-label="When the glucose was taken" className={`${inputCls} w-auto`}>
            {GLUCOSE_TIMINGS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </Field>
    </>
  );
}
