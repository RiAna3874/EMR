import type { Flag, Sex } from "@prisma/client";

export function age(dob: Date, at = new Date()) {
  let years = at.getFullYear() - dob.getUTCFullYear();
  const m = at.getMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && at.getDate() < dob.getUTCDate())) years--;
  return years;
}

export const sexShort = (s: Sex) => ({ male: "M", female: "F", other: "X", unknown: "U" })[s];

export const fullName = (p: { firstName: string; lastName: string }) => `${p.lastName}, ${p.firstName}`;

// Date-only columns are stored at UTC midnight; format them in UTC so they never shift a day.
export const fmtDob = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric", timeZone: "UTC" });

export const fmtDateOnly = (d: Date | null | undefined) =>
  d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";

export const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const fmtShortDate = (d: Date) => d.toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" });

export const fmtTime = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

export const fmtDateTime = (d: Date) => `${fmtDate(d)} ${fmtTime(d)}`;

export function relativeDays(d: Date, now = new Date()) {
  const days = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 60) return `${days} days ago`;
  if (days < 730) return `${Math.round(days / 30)} months ago`;
  return `${Math.round(days / 365)} years ago`;
}

export const isAbnormal = (f: Flag | null | undefined) => !!f && f !== "N";
export const isCritical = (f: Flag | null | undefined) => f === "LL" || f === "HH";

export function fmtValue(v: { valueNum: number | null; valueText: string | null }) {
  if (v.valueText) return v.valueText;
  if (v.valueNum === null) return "";
  return String(v.valueNum);
}

export function fmtRange(o: { refLow: number | null; refHigh: number | null; refText: string | null }) {
  if (o.refText) return o.refText;
  if (o.refLow !== null && o.refHigh !== null) return `${o.refLow}–${o.refHigh}`;
  if (o.refLow !== null) return `>${o.refLow}`;
  if (o.refHigh !== null) return `<${o.refHigh}`;
  return "";
}

// UCUM codes are precise but not friendly; show common ones the way clinicians write them.
const unitLabels: Record<string, string> = {
  "10*3/uL": "K/µL",
  "mm[Hg]": "mmHg",
  "/min": "/min",
  Cel: "°C",
  "m[IU]/L": "mIU/L",
  "{score}": "/10",
  "mL/min/1.73m2": "mL/min/1.73m²",
  "kg/m2": "kg/m²",
};
export const unitLabel = (u: string | null) => (u ? (unitLabels[u] ?? u) : "");

export function toUrlDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
