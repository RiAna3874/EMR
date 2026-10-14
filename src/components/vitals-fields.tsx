"use client";

import { useState } from "react";
import { Field, inputCls } from "@/components/form";
import { VITAL_LIMITS } from "@/lib/vitals";

const limits = (k: keyof typeof VITAL_LIMITS, step = "1") => ({ type: "number", min: VITAL_LIMITS[k].min, max: VITAL_LIMITS[k].max, step });

// Vitals inputs, read by vitalObservations (src/lib/vitals.ts). Used on the
// Vitals tab and when rooming a patient. The browser refuses impossible values
// before the form is sent; the server checks them again.
export function VitalsFields({ lastHeight }: { lastHeight?: number | null }) {
  const [tempUnit, setTempUnit] = useState<"F" | "C">("F");
  return (
    <>
      <Field label="BP (mmHg)">
        <div className="flex items-center gap-1">
          <input name="sbp" inputMode="numeric" placeholder="120" {...limits("sbp")} className={`${inputCls} w-16`} />
          <span className="text-ink-3">/</span>
          <input name="dbp" inputMode="numeric" placeholder="80" {...limits("dbp")} className={`${inputCls} w-16`} />
        </div>
      </Field>
      <Field label="HR (/min)">
        <input name="hr" inputMode="numeric" {...limits("hr")} className={`${inputCls} w-16`} />
      </Field>
      <Field label="RR (/min)">
        <input name="rr" inputMode="numeric" {...limits("rr")} className={`${inputCls} w-16`} />
      </Field>
      <Field label="Temp">
        <div className="flex items-center gap-1">
          <input name="temp" inputMode="decimal" {...limits(tempUnit === "F" ? "tempF" : "tempC", "0.1")} className={`${inputCls} w-16`} />
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
        <input name="spo2" inputMode="numeric" {...limits("spo2")} className={`${inputCls} w-16`} />
      </Field>
      <Field label="Weight (kg)">
        <input name="weight" inputMode="decimal" {...limits("weight", "0.1")} className={`${inputCls} w-20`} />
      </Field>
      <Field label="Height (cm)">
        <input name="height" inputMode="decimal" {...limits("height", "0.1")} defaultValue={lastHeight ?? ""} className={`${inputCls} w-20`} />
      </Field>
      <Field label="Pain (0–10)">
        <input name="pain" inputMode="numeric" {...limits("pain")} className={`${inputCls} w-16`} />
      </Field>
    </>
  );
}
