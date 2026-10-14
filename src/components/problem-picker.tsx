"use client";

import { useState } from "react";
import { Field, inputCls } from "@/components/form";

export type ProblemOption = { id: string; display: string };

// Links a new medication or order to one of the patient's active problems, so it
// shows under that problem in the problem list and a note's assessment and plan.
// "Other" takes a typed indication that isn't on the problem list.
export function ProblemPicker({
  problems,
  label = "For problem",
  defaultConditionId,
  defaultIndication,
}: {
  problems: ProblemOption[];
  label?: string;
  defaultConditionId?: string | null;
  defaultIndication?: string | null;
}) {
  const [choice, setChoice] = useState(
    defaultConditionId && problems.some((p) => p.id === defaultConditionId) ? defaultConditionId : defaultIndication ? "other" : "",
  );
  return (
    <>
      <Field label={label}>
        <select name="conditionId" value={choice} onChange={(e) => setChoice(e.target.value)} className={`${inputCls} w-64`}>
          <option value="">{problems.length ? "Not linked to a problem" : "No active problems"}</option>
          {problems.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display}
            </option>
          ))}
          <option value="other">Other (type an indication)</option>
        </select>
      </Field>
      {choice === "other" && (
        <Field label="Indication">
          <input name="indication" defaultValue={defaultIndication ?? ""} className={`${inputCls} w-56`} autoFocus />
        </Field>
      )}
    </>
  );
}
