"use client";

import { useMemo, useState } from "react";
import { Button, Field, inputCls } from "@/components/form";
import { ProblemPicker, type ProblemOption } from "@/components/problem-picker";
import { PickInput } from "@/components/pick-input";
import { DoseInput, FrequencyInput, RouteInput } from "./dose-fields";
import { MED_CHOICES, doseSuggestions, medChoiceByName, type PickOption } from "@/lib/meds/dosing";
import { productFor } from "@/lib/meds/formulary";
import { usualFrequency, usualRoute } from "@/lib/meds/drugs";
import { useDrugSearch } from "./use-drug-search";
import { DrugInfo } from "./drug-info";

const MED_OPTIONS: PickOption[] = MED_CHOICES.map((m) => ({
  value: m.display,
  hint: m.formulary ? `${m.dose} ${m.frequency}` : `outside · ${m.dose} ${m.frequency}`,
  keywords: m.keywords,
}));

// Documents a medication the patient takes that this clinic didn't prescribe.
// Picking a known medication fills in its usual dose, route and frequency; all
// of them stay editable, and anything can be typed. Brands registered with the
// DGDA and generic names from anywhere are offered after the clinic's list.
export function OutsideMedForm({ action, problems }: { action: (form: FormData) => void | Promise<void>; problems: ProblemOption[] }) {
  const [drug, setDrug] = useState("");
  const [dose, setDose] = useState("");
  const [route, setRoute] = useState("oral");
  const [frequency, setFrequency] = useState("");
  // The code of the DGDA brand or generic picked, while its name is unchanged.
  const [code, setCode] = useState("");
  const found = useDrugSearch(drug);
  const options = useMemo(() => {
    const known = new Set(MED_OPTIONS.map((o) => o.value.toLowerCase()));
    const extra = found
      .filter((h) => !known.has(h.display.toLowerCase()) && (known.add(h.display.toLowerCase()), true))
      .map((h) => ({ value: h.display, hint: [h.detail, h.kind === "dgda" ? "DGDA" : "generic"].filter(Boolean).join(" · "), keywords: [h.code] }));
    return extra.length ? [...MED_OPTIONS, ...extra] : MED_OPTIONS;
  }, [found]);
  const product = code ? productFor({ code }) : undefined;
  const suggestions = useMemo(() => doseSuggestions(drug, product), [drug, product]);

  return (
    <form
      action={async (form) => {
        await action(form);
        setDrug("");
        setDose("");
        setRoute("oral");
        setFrequency("");
        setCode("");
      }}
      className="rounded-md border border-line bg-panel p-3"
    >
      <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Add an outside or over-the-counter medication</h2>
      <p className="mb-2 text-[12px] text-ink-3">For medications the patient takes but this clinic didn&apos;t prescribe. Nothing is sent to a pharmacy.</p>
      {code && <input type="hidden" name="code" value={code} />}
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Medication" className="min-w-64 flex-1">
          <PickInput
            name="drug"
            required
            value={drug}
            options={options}
            showAllOnFocus={false}
            placeholder="Search or type, e.g. fish oil, paracetamol, cetirizine"
            onChange={(v, picked) => {
              setDrug(v);
              const fromList = picked?.keywords?.find((k) => k.startsWith("RX:DGDA:") || k.startsWith("RX:GENERIC:"));
              const p = fromList ? productFor({ code: fromList }) : undefined;
              setCode(p?.display === v ? fromList! : "");
              const m = picked && medChoiceByName.get(v.toLowerCase());
              if (p && p.display === v) {
                setDose(p.dose);
                setRoute(p.route);
                setFrequency("");
              } else if (m) {
                setDose(m.dose);
                setRoute(m.route);
                setFrequency(m.frequency);
              } else {
                // Typed by name: injections such as insulin or tirzepatide aren't oral.
                const r = usualRoute(v);
                if (r && route === "oral") setRoute(r);
                if (!frequency) setFrequency(usualFrequency(v));
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
      {drug.trim().length >= 3 && <DrugInfo drug={drug.trim()} className="mt-2" />}
    </form>
  );
}
