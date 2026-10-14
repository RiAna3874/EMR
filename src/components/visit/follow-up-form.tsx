"use client";

import { useState } from "react";
import { Button, Field, inputCls } from "@/components/form";
import { FOLLOW_UPS } from "@/lib/visits/follow-up";

// When the patient should come back. The front desk books it at check-out.
export function FollowUpForm({
  action,
  initial,
}: {
  action: (form: FormData) => Promise<void>;
  initial: { interval: string | null; date: string | null; note: string | null };
}) {
  const [choice, setChoice] = useState(initial.interval ?? "");
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 p-3">
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Return in">
        {[...FOLLOW_UPS, { id: "date", label: "Pick a date" }, { id: "", label: "None" }].map((f) => (
          <label
            key={f.id}
            className={`cursor-pointer rounded border px-2 py-1 text-[12.5px] ${choice === f.id ? "border-accent bg-accent text-white" : "border-line bg-panel hover:border-accent"}`}
          >
            <input type="radio" name="followUp" value={f.id} checked={choice === f.id} onChange={() => setChoice(f.id)} className="sr-only" />
            {f.label}
          </label>
        ))}
      </div>
      {choice === "date" && (
        <Field label="Date">
          <input type="date" name="followUpDate" defaultValue={initial.date ?? ""} required className={inputCls} />
        </Field>
      )}
      {choice && (
        <Field label="With (optional)" className="min-w-56 flex-1">
          <input name="followUpNote" defaultValue={initial.note ?? ""} placeholder="e.g. with CBC and fasting sugar reports" className={inputCls} />
        </Field>
      )}
      <Button type="submit">Save</Button>
    </form>
  );
}
