"use client";

import { useMemo, useState } from "react";
import { PickInput } from "@/components/pick-input";
import { DOSE_UNITS, FREQUENCIES, ROUTES, joinDose, resolveUnit, splitDose, type PickOption } from "@/lib/meds/dosing";

// A dose as an amount with a searchable unit, and the common doses for the
// medication one click away. The value is still one string ("500 mg"); one that
// doesn't split (a taper, "thin layer") stays whole in the amount box.
export function DoseInput({
  value,
  onChange,
  suggestions,
  name = "dose",
  autoFocus,
}: {
  value: string;
  onChange: (dose: string) => void;
  suggestions: string[];
  name?: string;
  autoFocus?: boolean;
}) {
  const [parts, setParts] = useState(() => splitDose(value));
  const [unitText, setUnitText] = useState(parts.unit);
  // The dose was changed from outside (a medication was picked): start over from it.
  if (joinDose(parts.amount, parts.unit) !== value) {
    const next = splitDose(value);
    setParts(next);
    setUnitText(next.unit);
  }
  const doseOptions = useMemo<PickOption[]>(() => suggestions.map((s) => ({ value: s, hint: "common dose" })), [suggestions]);

  const set = (amount: string, unit: string) => {
    setParts({ amount, unit });
    setUnitText(unit);
    onChange(joinDose(amount, unit));
  };

  return (
    <div className="flex items-start gap-1">
      <input type="hidden" name={name} value={value} />
      <PickInput
        value={parts.amount}
        options={doseOptions}
        ariaLabel="Dose amount"
        placeholder="Amount"
        className="w-28"
        autoFocus={autoFocus}
        onChange={(v, picked) => {
          if (picked) {
            const p = splitDose(v);
            set(p.amount, p.unit);
          } else set(v, parts.unit);
        }}
      />
      <PickInput
        value={unitText}
        options={DOSE_UNITS}
        ariaLabel="Dose unit"
        placeholder="Unit"
        className="w-28"
        onChange={(u, picked) => {
          setUnitText(u);
          // Only a unit we know goes into the dose; a half-typed one waits.
          const unit = picked ? u : resolveUnit(u);
          if (unit && unit === u) set(parts.amount, unit);
          else if (!u) set(parts.amount, "");
        }}
        onBlur={() => {
          const unit = resolveUnit(unitText);
          if (unit) set(parts.amount, unit);
          else setUnitText(parts.unit);
        }}
      />
    </div>
  );
}

export function FrequencyInput({ value, onChange, className = "w-60", name = "frequency" }: { value: string; onChange: (v: string) => void; className?: string; name?: string }) {
  return <PickInput name={name} value={value} onChange={(v) => onChange(v)} options={FREQUENCIES} placeholder="Search: daily, BID, q8h, PRN…" ariaLabel="Frequency" className={className} />;
}

const ROUTE_OPTIONS: PickOption[] = ROUTES.map((r) => ({ value: r }));

export function RouteInput({ value, onChange, className = "w-36", name = "route" }: { value: string; onChange: (v: string) => void; className?: string; name?: string }) {
  return <PickInput name={name} value={value} onChange={(v) => onChange(v)} options={ROUTE_OPTIONS} ariaLabel="Route" className={className} />;
}
