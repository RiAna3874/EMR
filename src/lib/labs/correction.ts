// Correcting a filed lab value that was typed or read wrong. The new value goes through the
// same checks as an import (src/lib/labs/draft.ts), so the flag, critical limits and unit
// warnings are worked out the same way. Pure: the correction form runs it as you type and
// the server action runs it again before saving.
import type { Flag, Role, Sex } from "@prisma/client";
import { assessRow, type Issue } from "./draft";
import { can } from "@/lib/roles";
import { fmtRange, fmtValue, unitLabel } from "@/lib/format";

export const CORRECTION_REASONS = [
  "Typing mistake",
  "Misread from the report",
  "Wrong unit",
  "Wrong reference range",
  "Lab sent a corrected report",
  "Other",
];

export type CorrectionInput = { value: string; unit: string; range: string; flag: string };

export type StoredResult = {
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  flag: Flag | null;
};

// Prescribers can correct any lab value. A nurse can correct values on a report they
// imported themselves, since they typed or checked those numbers.
export function canCorrectResult(user: { id: string; role: Role }, report: { importJob: { createdById: string } | null }) {
  if (can(user.role, "correctResults")) return true;
  return user.role === "nurse" && report.importJob?.createdById === user.id;
}

// What the form starts with: the value as it is on file.
export function correctionDefaults(o: StoredResult): CorrectionInput {
  // The flag only counts when there's no numeric range (a text result), so only then is it carried over.
  const numericRange = o.refLow !== null || o.refHigh !== null;
  return { value: fmtValue(o), unit: o.unit ? unitLabel(o.unit) : "", range: fmtRange(o), flag: numericRange ? "" : (o.flag ?? "") };
}

const same = (a: StoredResult, b: StoredResult) =>
  a.valueNum === b.valueNum &&
  (a.valueText ?? null) === (b.valueText ?? null) &&
  (a.unit ?? null) === (b.unit ?? null) &&
  a.refLow === b.refLow &&
  a.refHigh === b.refHigh &&
  (a.refText ?? null) === (b.refText ?? null) &&
  a.flag === b.flag;

export function correctResult(
  current: StoredResult & { code: string; display: string },
  input: CorrectionInput,
  sex: Sex,
): { next: StoredResult; issues: Issue[]; error: string | null } {
  const a = assessRow(
    {
      id: "correction",
      include: true,
      section: "",
      file: 0,
      box: null,
      printedName: current.display,
      loinc: current.code.startsWith("local:") ? null : current.code,
      display: current.display,
      value: input.value,
      unit: input.unit,
      range: input.range,
      printedFlag: input.flag,
      confidence: "manual",
      note: "",
    },
    { sex, collectedDate: "", history: {} },
  );
  const next: StoredResult = { valueNum: a.valueNum, valueText: a.valueText, unit: a.unit, refLow: a.refLow, refHigh: a.refHigh, refText: a.refText, flag: a.flag };
  // Matching the test's code and comparing with a printed flag are the import's concerns;
  // here the code doesn't change and the flag picker is only a fallback.
  const issues = a.issues.filter((i) => i.field !== "code" && i.field !== "flag");
  const error = issues.find((i) => i.severity === "error")?.text ?? (same(next, current) ? "Nothing changed. Edit the value, unit or range." : null);
  return { next, issues, error };
}
