"use client";

import { useState } from "react";
import { Button, Field, inputCls } from "@/components/form";
import { PickInput } from "@/components/pick-input";
import { DOSE_UNITS, splitDose } from "@/lib/meds/dosing";
import { buildTaper, totalDays, type DoseStep } from "@/lib/meds/steps";
import { DoseInput, FrequencyInput } from "./dose-fields";

// The steps of a taper or "followed by" prescription, one row each with "then" between
// them, as in Epic's multi-step sig. A last step left without days goes on until stopped.
export function StepsEditor({ steps, onChange, suggestions }: { steps: DoseStep[]; onChange: (steps: DoseStep[]) => void; suggestions: string[] }) {
  const [calc, setCalc] = useState(false);
  const set = (i: number, patch: Partial<DoseStep>) => onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const remove = (i: number) => onChange(steps.filter((_, j) => j !== i));
  const add = () => {
    const last = steps[steps.length - 1];
    // The step being followed now needs an end.
    onChange([...steps.slice(0, -1), { ...last, days: last.days ?? 7 }, { dose: "", frequency: last.frequency, days: null }]);
  };
  const total = totalDays(steps);

  return (
    <div className="space-y-1.5 rounded border border-line bg-panel p-2">
      <div className="flex gap-2 pl-16 text-[11px] font-medium text-ink-3" aria-hidden>
        <span className="w-[228px]">Dose</span>
        <span className="w-48">Frequency</span>
        <span>For (days)</span>
      </div>
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={i} className="flex flex-wrap items-start gap-2">
            <span className="w-14 pt-1.5 text-right text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{i === 0 ? "Step 1" : "then"}</span>
            <DoseInput name={`step${i}Dose`} value={s.dose} onChange={(dose) => set(i, { dose })} suggestions={suggestions} />
            <FrequencyInput name={`step${i}Frequency`} value={s.frequency} onChange={(frequency) => set(i, { frequency })} className="w-48" />
            <input
              type="number"
              min={1}
              max={365}
              value={s.days ?? ""}
              onChange={(e) => set(i, { days: e.target.value ? Math.max(1, Math.min(365, Math.round(Number(e.target.value)) || 1)) : null })}
              placeholder={i === steps.length - 1 ? "ongoing" : "days"}
              className={`${inputCls} w-24`}
              aria-label={`Step ${i + 1} days`}
            />
            {steps.length > 2 && (
              <button type="button" className="px-1 pt-1 text-[15px] leading-none text-ink-3 hover:text-crit" onClick={() => remove(i)} aria-label={`Remove step ${i + 1}`} title="Remove this step">
                ×
              </button>
            )}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2 pl-16 text-[12px]">
        {steps.length < 12 && (
          <Button type="button" variant="secondary" onClick={add}>
            + Then (add step)
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={() => setCalc((c) => !c)} aria-expanded={calc}>
          Taper calculator
        </Button>
        <span className="text-ink-3">
          {total ? `${total} days in all, then stop.` : "The last step goes on until it is changed or stopped. Give it days to end the course."}
        </span>
      </div>
      {calc && (
        <TaperCalculator
          start={steps[0]}
          onBuild={(built) => {
            onChange(built);
            setCalc(false);
          }}
        />
      )}
    </div>
  );
}

// Epic's taper/ramp calculator: start, final dose, change and interval make the steps.
function TaperCalculator({ start, onBuild }: { start: DoseStep; onBuild: (steps: DoseStep[]) => void }) {
  const first = splitDose(start.dose);
  const [from, setFrom] = useState(first.amount);
  const [to, setTo] = useState("");
  const [by, setBy] = useState("");
  const [unit, setUnit] = useState(first.unit || "mg");
  const [every, setEvery] = useState("5");
  const [frequency, setFrequency] = useState(start.frequency || "once daily");
  const [hold, setHold] = useState(false);
  const steps = buildTaper({
    from,
    to,
    by,
    unit,
    frequency,
    every: Number(every),
    hold: Number(to) > Number(from) ? true : hold,
  });
  const up = Number(to) > Number(from);

  return (
    <div className="ml-16 space-y-2 rounded border border-dashed border-line bg-panel-muted/50 p-2">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Start at">
          <input value={from} onChange={(e) => setFrom(e.target.value)} inputMode="decimal" className={`${inputCls} w-20`} aria-label="Starting dose" />
        </Field>
        <Field label="Unit">
          <PickInput value={unit} onChange={(u) => setUnit(u)} options={DOSE_UNITS} ariaLabel="Taper unit" className="w-24" />
        </Field>
        <Field label="Change by">
          <input
            value={by}
            onChange={(e) => setBy(e.target.value)}
            inputMode="decimal"
            className={`${inputCls} w-20`}
            aria-label="Change by"
            placeholder="e.g. 5"
          />
        </Field>
        <Field label="Every (days)">
          <input
            type="number"
            min={1}
            max={90}
            value={every}
            onChange={(e) => setEvery(e.target.value)}
            className={`${inputCls} w-20`}
            aria-label="Days at each dose"
          />
        </Field>
        <Field label={up ? "Up to" : "Down to"}>
          <input
            value={to}
            onChange={(e) => setTo(e.target.value)}
            inputMode="decimal"
            className={`${inputCls} w-20`}
            aria-label="Final dose"
            placeholder={up ? "" : "0 = stop"}
          />
        </Field>
        <Field label="Frequency">
          <FrequencyInput name="taperFrequency" value={frequency} onChange={setFrequency} className="w-48" />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        {!up && (
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={hold} onChange={(e) => setHold(e.target.checked)} />
            Stay on the last dose (don&apos;t stop)
          </label>
        )}
        <Button type="button" disabled={!steps} onClick={() => steps && onBuild(steps)}>
          {steps ? `Make ${steps.length} steps` : "Make steps"}
        </Button>
        <span className="text-ink-3">
          {steps
            ? steps.map((s) => s.dose).join(" → ") + (steps[steps.length - 1].days ? " → stop" : " (ongoing)")
            : "Give a start, a change and a final dose, e.g. 40 mg down by 10 mg every 5 days to 10 mg."}
        </span>
      </div>
    </div>
  );
}
