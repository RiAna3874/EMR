"use client";

import { useMemo, useState } from "react";
import { Button, Field, inputCls } from "@/components/form";
import { ProblemPicker, type ProblemOption } from "@/components/problem-picker";
import { PickInput } from "@/components/pick-input";
import { DoseInput, FrequencyInput, RouteInput } from "./dose-fields";
import { MED_CHOICES, doseSuggestions, medChoiceByName, type PickOption } from "@/lib/meds/dosing";

const MED_OPTIONS: PickOption[] = MED_CHOICES.map((m) => ({
  value: m.display,
  hint: m.formulary ? `${m.dose} ${m.frequency}` : `outside · ${m.dose} ${m.frequency}`,
  keywords: m.keywords,
}));

// Documents a medication the patient takes that this clinic didn't prescribe.
// Picking a known medication fills in its usual dose, route and frequency; all
// of them stay editable, and anything can be typed.
export function OutsideMedForm({ action, problems }: { action: (form: FormData) => void | Promise<void>; problems: ProblemOption[] }) {
  const [drug, setDrug] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("oral");
  const [frequency, setFrequency] = useState("");
  const suggestions = useMemo(() => doseSuggestions(drug), [drug]);

  return (
    <form
      action={async (form) => {
        await action(form);
        setDrug("");
        setDose("");
        setRoute("oral");
        setFrequency("");
      }}
      className="rounded-md border border-line bg-panel p-3"
    >
      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Add an outside or over-the-counter medication</h2>
      <p className="mb-2 text-[12px] text-ink-3">For medications the patient takes but this clinic didn&apos;t prescribe. Nothing is sent to a pharmacy.</p>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Medication" className="min-w-64 flex-1">
          <PickInput
            name="drug"
            required
            value={drug}
            options={MED_OPTIONS}
            showAllOnFocus={false}
            placeholder="Search or type, e.g. fish oil, paracetamol, cetirizine"
            onChange={(v, picked) => {
              setDrug(v);
              const m = picked && medChoiceByName.get(v.toLowerCase());
              if (m) {
                setDose(m.dose);
                setRoute(m.route);
                setFrequency(m.frequency);
              }
            }}
          />
        </Field>
        <Field label="Dose">
          <DoseInput value={dose} onChange={setDose} suggestions={suggestions} />
        </Field>
        <Field label="Route">
          <RouteInput value={route} onChange={setRoute} />
        </Field>
        <Field label="Frequency">
          <FrequencyInput value={frequency} onChange={setFrequency} />
        </Field>
        <Field label="Prescribed by / source">
          <input name="source" placeholder="Over the counter" className={`${inputCls} w-44`} />
        </Field>
        <ProblemPicker problems={problems} />
        <Button type="submit" variant="secondary">
          Add
        </Button>
      </div>
    </form>
  );
}
