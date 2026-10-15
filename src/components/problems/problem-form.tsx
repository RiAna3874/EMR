"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Field, inputCls } from "@/components/form";
import { DiagnosisPicker } from "@/components/icd10";

// Add a problem, or correct one's name and code: the same search as visit diagnoses,
// over the common list and the whole ICD-10-CM table.
export function ProblemForm({
  action,
  initial,
  cancelHref,
}: {
  action: (form: FormData) => Promise<void>;
  initial?: { display: string; code: string; comment: string };
  cancelHref?: string;
}) {
  const [display, setDisplay] = useState(initial?.display ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const editing = !!initial;
  return (
    <form
      action={async (form) => {
        await action(form);
        if (!editing) {
          setDisplay("");
          setCode("");
        }
      }}
      className="flex flex-wrap items-end gap-2"
    >
      <DiagnosisPicker
        label="Problem"
        placeholder="Search: hypertension, E11.9, asthma…"
        codePlaceholder="R69 if blank"
        display={display}
        code={code}
        onChange={(d, c) => {
          setDisplay(d);
          setCode(c);
        }}
      >
        {(blocked) => (
          <>
            {!editing && (
              <Field label="Onset">
                <input name="onset" type="date" className={inputCls} />
              </Field>
            )}
            <Field label="Comment">
              <input name="comment" defaultValue={initial?.comment} className={`${inputCls} w-56`} />
            </Field>
            <Button type="submit" disabled={blocked} className="disabled:cursor-not-allowed disabled:opacity-50">
              {editing ? "Save" : "Add"}
            </Button>
            {cancelHref && (
              <Link href={cancelHref} className="pb-1 text-[12.5px] text-ink-3 hover:underline">
                Cancel
              </Link>
            )}
          </>
        )}
      </DiagnosisPicker>
    </form>
  );
}
