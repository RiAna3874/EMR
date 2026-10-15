"use client";

import { useState } from "react";
import { Button } from "@/components/form";
import { DiagnosisPicker } from "@/components/icd10";

// Add a visit diagnosis: search the common list and the whole ICD-10-CM table (by name,
// code or a word like "sugar"), or type one with its code.
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
      <DiagnosisPicker
        display={display}
        code={code}
        onChange={(d, c) => {
          setDisplay(d);
          setCode(c);
        }}
      >
        {(blocked) => (
          <>
            <label className="flex items-center gap-1.5 pb-1.5 text-[12.5px] text-ink-2">
              <input type="checkbox" name="addToProblems" /> Also add to problem list
            </label>
            <Button type="submit" disabled={blocked} className="disabled:cursor-not-allowed disabled:opacity-50">
              Add
            </Button>
          </>
        )}
      </DiagnosisPicker>
    </form>
  );
}
