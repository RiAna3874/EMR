import { Button, inputCls } from "@/components/form";

export const ERROR_REASONS = ["Wrong patient", "Duplicate", "Typing or transcription mistake", "Other"];

// Removing an allergy from the list (src/app/patients/[id]/actions.ts).
export const ALLERGY_REMOVAL_REASONS = ["Entered in error", "Wrong patient", "Not an allergy (side effect or intolerance)", "Tested and not allergic"];

// "Mark entered in error", folded away until opened. The record leaves the chart, Inbox
// and checks but stays in the database, with who marked it, when and why.
export function EnteredInError({ action, what }: { action: (form: FormData) => Promise<void>; what: string }) {
  return (
    <details className="text-[12px]">
      <summary className="cursor-pointer select-none text-ink-3 hover:text-crit">Mark entered in error</summary>
      <form action={action} className="mt-1.5 flex flex-wrap items-end gap-2 rounded border border-crit/30 bg-crit-soft/40 p-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] font-medium text-ink-3">Why</span>
          <select name="reason" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              Choose
            </option>
            {ERROR_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="flex min-w-48 flex-1 flex-col gap-0.5">
          <span className="text-[11px] font-medium text-ink-3">Note (e.g. which patient it belongs to)</span>
          <input name="note" className={inputCls} />
        </label>
        <Button type="submit" variant="danger" className="border-crit/40">
          Remove {what} from the chart
        </Button>
      </form>
    </details>
  );
}
