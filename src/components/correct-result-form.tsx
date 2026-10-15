"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { Sex } from "@prisma/client";
import { Button, Field, inputCls } from "@/components/form";
import { FlagBadge, flagText, flagTitle } from "@/components/flag";
import { correctionDefaults, correctResult, CORRECTION_REASONS, type StoredResult } from "@/lib/labs/correction";
import type { CorrectionState } from "@/app/patients/[id]/results/actions";
import { fmtRange, fmtValue, unitLabel } from "@/lib/format";

const FLAGS = ["N", "L", "H", "LL", "HH", "A"] as const;

// Correcting one lab value. The new flag and any warnings (an implausible number, a unit the
// chart doesn't trend in) show as you type, worked out the same way the server will.
export function CorrectResultForm({
  result,
  sex,
  action,
  cancelHref,
}: {
  result: StoredResult & { code: string; display: string };
  sex: Sex;
  action: (state: CorrectionState, form: FormData) => Promise<CorrectionState>;
  cancelHref: string;
}) {
  const [input, setInput] = useState(() => correctionDefaults(result));
  const [state, formAction, pending] = useActionState(action, undefined);
  const { next, issues, error } = correctResult(result, input, sex);
  const set = (k: keyof typeof input) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setInput({ ...input, [k]: e.target.value });

  return (
    <form action={formAction} className="space-y-2 border-l-[3px] border-accent bg-accent-soft/40 px-4 py-3">
      <div className="text-[12.5px] font-semibold">Correct {result.display}</div>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Value">
          <input name="value" value={input.value} onChange={set("value")} autoFocus className={`${inputCls} tabular w-28`} />
        </Field>
        <Field label="Unit">
          <input name="unit" value={input.unit} onChange={set("unit")} className={`${inputCls} w-24`} />
        </Field>
        <Field label="Reference range">
          <input name="range" value={input.range} onChange={set("range")} className={`${inputCls} tabular w-32`} />
        </Field>
        <Field label="Flag if no numeric range">
          <select name="flag" value={input.flag} onChange={set("flag")} className={inputCls}>
            <option value="">None</option>
            {FLAGS.map((f) => (
              <option key={f} value={f}>
                {flagTitle(f)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Why">
          <select name="reason" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              Choose
            </option>
            {CORRECTION_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="Note (optional)" className="min-w-40 flex-1">
          <input name="note" maxLength={300} className={inputCls} />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
        <span className="text-ink-3">
          On file: <span className="tabular text-ink-2">{fmtValue(result)} {unitLabel(result.unit)}</span>
          <FlagBadge flag={result.flag} />
        </span>
        <span className="text-ink-3">
          Will file:{" "}
          <span className={`tabular font-semibold ${flagText(next.flag)}`}>
            {fmtValue(next) || "—"} {unitLabel(next.unit)}
          </span>
          <FlagBadge flag={next.flag} />
          {fmtRange(next) && <span className="tabular ml-1.5">(range {fmtRange(next)})</span>}
          {next.flag === "N" && <span className="ml-1.5">Normal</span>}
        </span>
      </div>
      {issues.length > 0 && (
        <ul className="space-y-0.5 text-[12px]">
          {issues.map((i) => (
            <li key={i.text} className={i.severity === "error" ? "text-crit" : i.severity === "warn" ? "text-warn" : "text-ink-3"}>
              {i.text}
            </li>
          ))}
        </ul>
      )}
      {state?.error && <p className="text-[12px] font-medium text-crit">{state.error}</p>}
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!!error || pending}>
          {pending ? "Saving…" : "Save correction"}
        </Button>
        <Link href={cancelHref} className="text-[12.5px] text-ink-2 hover:underline">
          Cancel
        </Link>
        {error && !issues.some((i) => i.text === error) && <span className="text-[12px] text-ink-3">{error}</span>}
        <span className="ml-auto text-[11.5px] text-ink-3">The earlier value stays in the result&apos;s history with your name and the time.</span>
      </div>
    </form>
  );
}
