"use client";

import { useState } from "react";
import { Button, Field, inputCls } from "@/components/form";
import { PickInput } from "@/components/pick-input";
import { DIAGNOSES } from "@/lib/visits/diagnoses";

// Add a visit diagnosis: search the common list (by name, code or a word like "sugar"),
// or type one with its ICD-10 code.
export function DiagnosisForm({ action }: { action: (form: FormData) => Promise<void> }) {
  const [display, setDisplay] = useState("");
  const [code, setCode] = useState("");
  return (
    <form
      action={async (form) => {
        await action(form);
        setDisplay("");
        setCode("");
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <Field label="Diagnosis" className="min-w-72 flex-1">
        <PickInput
          name="display"
          value={display}
          options={DIAGNOSES}
          showAllOnFocus={false}
          placeholder="Search: fever, I10, dengue, sugar…"
          ariaLabel="Diagnosis"
          required
          onChange={(v, picked) => {
            setDisplay(v);
            if (picked) setCode(picked.hint ?? "");
          }}
        />
      </Field>
      <Field label="ICD-10">
        <input name="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="optional" className={`${inputCls} w-24 font-mono`} />
      </Field>
      <label className="flex items-center gap-1.5 pb-1.5 text-[12.5px] text-ink-2">
        <input type="checkbox" name="addToProblems" /> Also add to problem list
      </label>
      <Button type="submit">Add</Button>
    </form>
  );
}
