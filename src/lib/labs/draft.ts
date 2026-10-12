// The review screen's working copy of an import, and the checks that run on it.
// Pure functions only: the same code runs in the browser while the clinician edits
// and on the server when they file, so what they see is what gets enforced.
import { z } from "zod";
import type { Flag, Sex } from "@prisma/client";
import { analyteByLoinc, findAnalyte, normKey, PANELS, type Analyte } from "./catalog";
import { conversionFor, normalizeUnit, roundConverted, type Conversion } from "./units";
import { unitLabel } from "@/lib/format";

export const BoxSchema = z.object({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() });
export type Box = z.infer<typeof BoxSchema>; // fractions of the page, 0–1

export const DraftRowSchema = z.object({
  id: z.string(),
  include: z.boolean(),
  section: z.string(), // section heading as printed
  file: z.number().int(), // index into the import's documents
  box: BoxSchema.nullable(),
  printedName: z.string(),
  loinc: z.string().nullable(),
  display: z.string(),
  value: z.string(),
  unit: z.string(),
  range: z.string(),
  printedFlag: z.string(),
  confidence: z.enum(["high", "medium", "low", "manual"]),
  note: z.string(),
});
export type DraftRow = z.infer<typeof DraftRowSchema>;

export const DraftSchema = z.object({
  labName: z.string(),
  reportTitle: z.string(),
  collectedDate: z.string(), // YYYY-MM-DD
  collectedTime: z.string(), // HH:MM or ""
  reportedDate: z.string(),
  reportedTime: z.string(),
  printedName: z.string(),
  printedDob: z.string(),
  printedAge: z.string(),
  printedSex: z.string(),
  printedId: z.string(),
  identityConfirmed: z.boolean(),
  notes: z.array(z.string()),
  rows: z.array(DraftRowSchema),
});
export type Draft = z.infer<typeof DraftSchema>;

export type PatientFacts = { firstName: string; lastName: string; dob: string; sex: Sex; mrn: string };

// Results already in the chart, per LOINC code, used for duplicate and unit checks.
export type History = Record<string, { date: string; value: string; unit: string | null }[]>;

// ---------- parsing ----------

const NUM = String.raw`[-+]?\d[\d,]*(?:\.\d+)?|[-+]?\.\d+`;

export function parseNumber(s: string): number | null {
  let t = s.trim().replace(/\s+/g, "");
  if (!new RegExp(`^(?:${NUM})$`).test(t)) return null;
  // "7,500" and "1,50,000" use commas as grouping; "4,5" is a decimal comma.
  if (/,\d{3}(?!\d)/.test(t) || /,\d{2},/.test(t)) t = t.replace(/,/g, "");
  else t = t.replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export type ParsedValue =
  | { kind: "number"; num: number }
  | { kind: "comparator"; text: string; num: number; op: "<" | ">" }
  | { kind: "text"; text: string }
  | { kind: "empty" };

export function parseValue(raw: string): ParsedValue {
  const s = raw.trim().replace(/\s*\*+$/, "");
  if (!s) return { kind: "empty" };
  const n = parseNumber(s);
  if (n !== null) return { kind: "number", num: n };
  const cmp = s.match(/^(<=?|>=?|≤|≥|less than|more than|greater than)\s*(.+)$/i);
  if (cmp) {
    const v = parseNumber(cmp[2]);
    if (v !== null) return { kind: "comparator", text: s, num: v, op: /^(<|≤|less)/i.test(cmp[1]) ? "<" : ">" };
  }
  return { kind: "text", text: s };
}

export type ParsedRange = { low: number | null; high: number | null; text: string | null };

// Picks the line meant for this patient's sex when a range is printed per sex.
function rangeForSex(text: string, sex: Sex) {
  const male = text.match(/\b(?:m|male|men)\b\s*[:=-]?\s*([^;\n]*?)(?=\s*\b(?:f|female|women)\b|$|[;\n])/i);
  const female = text.match(/\b(?:f|female|women)\b\s*[:=-]?\s*([^;\n]*?)(?=\s*\b(?:m|male|men)\b|$|[;\n])/i);
  if (male && female) return sex === "male" ? male[1] : sex === "female" ? female[1] : null;
  return text;
}

export function parseRange(raw: string, sex: Sex = "unknown"): ParsedRange {
  const original = raw.trim();
  if (!original) return { low: null, high: null, text: null };
  const picked = rangeForSex(original, sex);
  if (picked === null) return { low: null, high: null, text: original };
  const s = picked
    .replace(/[‐-―−]/g, "-")
    .replace(/[a-zµμ%/^*³]+[a-z0-9µμ%/^*.³]*\s*$/i, "") // trailing unit
    .trim();
  const between = s.match(new RegExp(`^(${NUM})\\s*(?:-|to)\\s*(${NUM})$`, "i"));
  if (between) {
    const low = parseNumber(between[1]);
    const high = parseNumber(between[2]);
    if (low !== null && high !== null) return { low, high, text: null };
  }
  const upper = s.match(new RegExp(`^(?:<=?|≤|up to|upto|less than|below)\\s*(${NUM})$`, "i"));
  if (upper) return { low: null, high: parseNumber(upper[1]), text: s };
  const lower = s.match(new RegExp(`^(?:>=?|≥|more than|greater than|above)\\s*(${NUM})$`, "i"));
  if (lower) return { low: parseNumber(lower[1]), high: null, text: s };
  return { low: null, high: null, text: original };
}

const FLAG_WORDS: [RegExp, Flag][] = [
  [/^(hh|h\*|\*h|ch|critical high|crit high|panic high|h!!)$/i, "HH"],
  [/^(ll|l\*|\*l|cl|critical low|crit low|panic low|l!!)$/i, "LL"],
  [/^(h|hi|high|↑|\+|above)$/i, "H"],
  [/^(l|lo|low|↓|-|below)$/i, "L"],
  [/^(a|abn|abnormal|\*|!)$/i, "A"],
  [/^(n|normal|wnl|nl)$/i, "N"],
];

export function parsePrintedFlag(raw: string): Flag | null {
  const s = raw.trim();
  if (!s) return null;
  for (const [re, f] of FLAG_WORDS) if (re.test(s)) return f;
  return null;
}

const NEGATIVE_WORDS = /^(negative|neg|nil|absent|none|none seen|not detected|non[- ]?reactive|normal|clear|not seen)$/i;

// ---------- assessment ----------

export type Severity = "error" | "warn" | "info";
export type Issue = { severity: Severity; field?: "value" | "unit" | "range" | "code" | "flag" | "display"; text: string };

export type RowAssessment = {
  analyte: Analyte | undefined;
  code: string; // what will be stored
  valueNum: number | null;
  valueText: string | null;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  flag: Flag | null;
  printedFlag: Flag | null;
  conversion: (Conversion & { value: number }) | null;
  issues: Issue[];
};

const direction = (f: Flag | null) => (f === "L" || f === "LL" ? -1 : f === "H" || f === "HH" ? 1 : f === "N" ? 0 : null);

export function slug(s: string) {
  return normKey(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "result";
}

export function computeFlag(
  v: ParsedValue,
  r: ParsedRange,
  analyte: Analyte | undefined,
  unit: string,
): Flag | null {
  if (v.kind === "number") {
    const crit = analyte && unit === analyte.unit;
    if (crit && analyte.critLow !== undefined && v.num < analyte.critLow) return "LL";
    if (crit && analyte.critHigh !== undefined && v.num > analyte.critHigh) return "HH";
    if (r.low === null && r.high === null) return null;
    // "<200" style ranges are exclusive at the printed limit.
    const upperExclusive = r.text !== null && /^(<(?!=)|less than|below)/i.test(r.text.trim());
    if (r.low !== null && v.num < r.low) return "L";
    if (r.high !== null && (upperExclusive ? v.num >= r.high : v.num > r.high)) return "H";
    return "N";
  }
  if (v.kind === "comparator") {
    if (v.op === "<" && r.low !== null && v.num <= r.low) return "L";
    if (v.op === ">" && r.high !== null && v.num >= r.high) return "H";
    if (r.low !== null || r.high !== null) return "N";
    return null;
  }
  if (v.kind === "text") {
    if (!r.text) return null;
    if (normKey(v.text) === normKey(r.text)) return "N";
    if (NEGATIVE_WORDS.test(v.text.trim()) && NEGATIVE_WORDS.test(r.text.trim())) return "N";
    return "A";
  }
  return null;
}

export function assessRow(row: DraftRow, ctx: { sex: Sex; collectedDate: string; history: History }): RowAssessment {
  const issues: Issue[] = [];
  const analyte = row.loinc ? analyteByLoinc.get(row.loinc) : undefined;
  const code = row.loinc?.trim() || `local:${slug(row.display || row.printedName)}`;
  const unit = normalizeUnit(row.unit);
  const v = parseValue(row.value);
  const r = parseRange(row.range, ctx.sex);
  const printedFlag = parsePrintedFlag(row.printedFlag);

  if (!row.display.trim()) issues.push({ severity: "error", field: "display", text: "Test name is required." });
  if (v.kind === "empty") issues.push({ severity: "error", field: "value", text: "No value. Enter one or leave this row out." });
  if (row.printedFlag.trim() && !printedFlag) issues.push({ severity: "info", field: "flag", text: `Printed flag "${row.printedFlag}" isn't one we recognize.` });

  let flag = computeFlag(v, r, analyte, unit);
  if (flag === null && printedFlag) flag = printedFlag;
  if (flag && printedFlag && direction(flag) !== null && direction(printedFlag) !== null && direction(flag) !== direction(printedFlag)) {
    issues.push({
      severity: "warn",
      field: "flag",
      text: `The lab printed ${printedFlag === "N" ? "no abnormal flag" : `"${row.printedFlag}"`}, but the value and range give ${flagWord(flag)}. Check the value and range.`,
    });
  }
  if (row.range.trim() && r.low === null && r.high === null && r.text === row.range.trim() && v.kind === "number") {
    issues.push({ severity: "info", field: "range", text: "Couldn't read a numeric range; the flag comes from the lab's printed flag." });
  }

  if (row.confidence === "low") issues.push({ severity: "warn", text: "Claude wasn't confident reading this row. Compare it with the image." });
  if (row.note.trim()) issues.push({ severity: "info", text: row.note.trim() });

  let conversion: RowAssessment["conversion"] = null;
  if (analyte) {
    const c = conversionFor(analyte, unit);
    if (c && v.kind === "number") {
      conversion = { ...c, value: roundConverted(v.num * c.factor) };
      issues.push({ severity: "warn", field: "unit", text: `Reported in ${unitLabel(unit)}; the chart keeps ${analyte.display} in ${unitLabel(analyte.unit)}. Convert to ${conversion.value} ${unitLabel(analyte.unit)} so trends line up.` });
    } else if (unit && unit !== analyte.unit) {
      issues.push({ severity: "warn", field: "unit", text: `Unit ${unitLabel(unit)} differs from the usual ${unitLabel(analyte.unit)} for ${analyte.display}. Trends may not be comparable.` });
    } else if (v.kind === "number" && unit === analyte.unit && (v.num < analyte.plausible[0] || v.num > analyte.plausible[1])) {
      issues.push({ severity: "warn", field: "value", text: `${v.num} ${unitLabel(unit)} is outside what's physiologically plausible for ${analyte.display}. Likely a misread.` });
    }
    if (!unit && v.kind === "number") issues.push({ severity: "warn", field: "unit", text: "No unit." });
  } else if (row.loinc && !analyte) {
    issues.push({ severity: "info", field: "code", text: "LOINC code suggested by Claude and not in our reference list. Confirm it." });
  } else {
    issues.push({ severity: "info", field: "code", text: "Not matched to a LOINC code; it will be filed under a local code." });
  }

  if (row.loinc && ctx.collectedDate) {
    const same = (ctx.history[row.loinc] ?? []).find((h) => h.date === ctx.collectedDate);
    if (same) issues.push({ severity: "warn", text: `Already on file for this date: ${same.value}${same.unit ? ` ${unitLabel(same.unit)}` : ""}.` });
  }

  return {
    analyte,
    code,
    valueNum: v.kind === "number" ? v.num : null,
    valueText: v.kind === "comparator" || v.kind === "text" ? v.text : null,
    unit: unit || null,
    refLow: r.low,
    refHigh: r.high,
    refText: r.text,
    flag,
    printedFlag,
    conversion,
    issues,
  };
}

const flagWord = (f: Flag) => ({ N: "normal", L: "low", H: "high", LL: "critical low", HH: "critical high", A: "abnormal" })[f];

// ---------- identity ----------

export type IdentityCheck = { status: "match" | "mismatch" | "unknown"; details: string[] };

const nameTokens = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((t) => t.length > 0 && !["mr", "mrs", "ms", "miss", "dr", "md", "baby", "of"].includes(t));

export function checkIdentity(d: Pick<Draft, "printedName" | "printedDob" | "printedAge" | "printedSex" | "collectedDate">, p: PatientFacts): IdentityCheck {
  const details: string[] = [];
  let mismatch = false;
  let matched = 0;

  if (d.printedName.trim()) {
    const printed = nameTokens(d.printedName);
    const first = nameTokens(p.firstName);
    const last = nameTokens(p.lastName);
    const has = (ts: string[]) => ts.length > 0 && ts.every((t) => printed.includes(t));
    const initial = printed.some((t) => t.length === 1 && t === first[0]?.[0]);
    if (has(last) && (has(first) || initial)) matched++;
    else {
      mismatch = true;
      details.push(`Name on report "${d.printedName}" doesn't match ${p.firstName} ${p.lastName}.`);
    }
  }
  if (d.printedDob.trim()) {
    if (d.printedDob.trim() === p.dob) matched++;
    else {
      mismatch = true;
      details.push(`Date of birth on report ${d.printedDob} doesn't match chart ${p.dob}.`);
    }
  } else if (d.printedAge.trim()) {
    const years = parseInt(d.printedAge, 10);
    const at = d.collectedDate ? new Date(`${d.collectedDate}T12:00:00Z`) : new Date();
    const dob = new Date(`${p.dob}T12:00:00Z`);
    let age = at.getUTCFullYear() - dob.getUTCFullYear();
    if (at.getUTCMonth() < dob.getUTCMonth() || (at.getUTCMonth() === dob.getUTCMonth() && at.getUTCDate() < dob.getUTCDate())) age--;
    if (Number.isFinite(years) && Math.abs(years - age) > 1) {
      mismatch = true;
      details.push(`Age on report (${d.printedAge}) doesn't fit the chart's date of birth (${age} at collection).`);
    }
  }
  if (d.printedSex.trim()) {
    const s = d.printedSex.trim().toLowerCase()[0];
    const chart = p.sex === "male" ? "m" : p.sex === "female" ? "f" : null;
    if (chart && (s === "m" || s === "f") && s !== chart) {
      mismatch = true;
      details.push(`Sex on report (${d.printedSex}) doesn't match chart (${p.sex}).`);
    }
  }
  if (mismatch) return { status: "mismatch", details };
  if (matched === 0) return { status: "unknown", details: ["The report doesn't show a name or date of birth to check against."] };
  return { status: "match", details: [] };
}

// ---------- whole-draft checks ----------

export type DraftAssessment = {
  identity: IdentityCheck;
  rows: Map<string, RowAssessment>;
  blockers: string[];
};

export function assessDraft(draft: Draft, patient: PatientFacts, history: History): DraftAssessment {
  const identity = checkIdentity(draft, patient);
  const rows = new Map(draft.rows.map((r) => [r.id, assessRow(r, { sex: patient.sex, collectedDate: draft.collectedDate, history })]));
  const blockers: string[] = [];
  const included = draft.rows.filter((r) => r.include);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.collectedDate)) blockers.push("Enter the collection date.");
  else if (draft.collectedDate > new Date().toISOString().slice(0, 10)) blockers.push("Collection date is in the future.");
  if (draft.collectedTime && !/^\d{2}:\d{2}$/.test(draft.collectedTime)) blockers.push("Collection time should look like 08:30.");
  if (identity.status === "mismatch" && !draft.identityConfirmed) blockers.push("Confirm this report belongs to this patient.");
  if (included.length === 0) blockers.push("Include at least one result.");
  const errs = included.filter((r) => rows.get(r.id)!.issues.some((i) => i.severity === "error")).length;
  if (errs) blockers.push(`${errs} included ${errs === 1 ? "row needs" : "rows need"} fixing.`);
  return { identity, rows, blockers };
}

// Where a row is filed: catalog tests go to their home panel so they trend with
// orders placed here; anything else is grouped under the section the lab printed.
export function panelFor(row: DraftRow, a: RowAssessment): { code: string; display: string } {
  if (a.analyte) return PANELS[a.analyte.panel];
  const section = row.section.trim() || "Other results";
  return { code: `local:${slug(section)}`, display: section };
}

// ---------- building a draft from Claude's output ----------

export type ExtractedReport = {
  lab_name: string | null;
  report_title: string | null;
  patient_name: string | null;
  patient_dob: string | null;
  patient_age: string | null;
  patient_sex: string | null;
  patient_id: string | null;
  collected_date: string | null;
  collected_time: string | null;
  reported_date: string | null;
  reported_time: string | null;
  notes: string[];
  sections: {
    name: string;
    results: {
      name: string;
      value: string;
      unit: string | null;
      reference_range: string | null;
      flag: string | null;
      loinc: string | null;
      file: number;
      box: { x0: number; y0: number; x1: number; y1: number } | null;
      confidence: "high" | "medium" | "low";
      note: string | null;
    }[];
  }[];
};

export type PageSize = { width: number | null; height: number | null };

export function draftFromExtraction(x: ExtractedReport, pages: PageSize[]): Draft {
  let n = 0;
  const rows: DraftRow[] = [];
  for (const section of x.sections) {
    for (const r of section.results) {
      const fileIdx = Math.min(Math.max(r.file - 1, 0), Math.max(pages.length - 1, 0));
      const page = pages[fileIdx];
      const analyte = findAnalyte(r.name) ?? (r.loinc ? analyteByLoinc.get(r.loinc) : undefined);
      rows.push({
        id: `r${++n}`,
        include: true,
        section: section.name,
        file: fileIdx,
        box: toFractionBox(r.box, page),
        printedName: r.name,
        loinc: analyte?.loinc ?? (r.loinc && /^\d{1,7}-\d$/.test(r.loinc) ? r.loinc : null),
        display: analyte?.display ?? r.name,
        value: r.value,
        unit: r.unit ? unitLabel(normalizeUnit(r.unit)) : "",
        range: r.reference_range ?? "",
        printedFlag: r.flag ?? "",
        confidence: r.confidence,
        note: r.note ?? "",
      });
    }
  }
  return {
    labName: x.lab_name ?? "",
    reportTitle: x.report_title ?? "",
    collectedDate: isoDate(x.collected_date),
    collectedTime: isoTime(x.collected_time),
    reportedDate: isoDate(x.reported_date),
    reportedTime: isoTime(x.reported_time),
    printedName: x.patient_name ?? "",
    printedDob: isoDate(x.patient_dob),
    printedAge: x.patient_age ?? "",
    printedSex: x.patient_sex ?? "",
    printedId: x.patient_id ?? "",
    identityConfirmed: false,
    notes: x.notes,
    rows,
  };
}

export function emptyDraft(): Draft {
  return {
    labName: "",
    reportTitle: "",
    collectedDate: "",
    collectedTime: "",
    reportedDate: "",
    reportedTime: "",
    printedName: "",
    printedDob: "",
    printedAge: "",
    printedSex: "",
    printedId: "",
    identityConfirmed: false,
    notes: [],
    rows: [],
  };
}

export function blankRow(id: string, file = 0): DraftRow {
  return { id, include: true, section: "", file, box: null, printedName: "", loinc: null, display: "", value: "", unit: "", range: "", printedFlag: "", confidence: "manual", note: "" };
}

const isoDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : "");
const isoTime = (s: string | null) => {
  const m = s?.trim().match(/^(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : "";
};

function toFractionBox(b: ExtractedReport["sections"][number]["results"][number]["box"], page: PageSize | undefined): Box | null {
  if (!b || !page?.width || !page?.height) return null;
  const f = { x0: b.x0 / page.width, y0: b.y0 / page.height, x1: b.x1 / page.width, y1: b.y1 / page.height };
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const box = { x0: clamp(Math.min(f.x0, f.x1)), y0: clamp(Math.min(f.y0, f.y1)), x1: clamp(Math.max(f.x0, f.x1)), y1: clamp(Math.max(f.y0, f.y1)) };
  return box.x1 - box.x0 > 0.005 && box.y1 - box.y0 > 0.002 ? box : null;
}
