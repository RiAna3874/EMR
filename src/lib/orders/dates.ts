// Start and end dates on orders and prescriptions, the way Epic offers them: a date
// field with one-click picks (Today, Tomorrow, 1 week, ...). Dates are YYYY-MM-DD
// strings in the clinic's local calendar; a course "for 5 days" starting today ends
// on the fifth day, counting today.

export type DatePick = { label: string; days?: number; months?: number };

const DAY = 86_400_000;
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export const isYmd = (s: string | null | undefined): s is string => {
  if (!s || !YMD.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
};

const toUtc = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);

export const addDays = (ymd: string, n: number) => fromUtc(toUtc(ymd) + n * DAY);

// Calendar months, kept within the month (Jan 31 + 1 month is Feb 28/29).
export function addMonths(ymd: string, n: number) {
  const [y, m, d] = ymd.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return fromUtc(target.getTime());
}

export const applyPick = (from: string, p: DatePick) => (p.months ? addMonths(from, p.months) : addDays(from, p.days ?? 0));

// Whole days from a to b (b - a).
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / DAY);

// The last day of a course of `days` days that starts on `start`, and back again.
export const courseEnd = (start: string, days: number) => addDays(start, Math.max(1, days) - 1);
export const courseDays = (start: string, end: string) => daysBetween(start, end) + 1;

// Picks for when an order or prescription starts, counted from today.
export const START_PICKS: DatePick[] = [
  { label: "Today", days: 0 },
  { label: "Tomorrow", days: 1 },
  { label: "1 week", days: 7 },
  { label: "2 weeks", days: 14 },
  { label: "1 month", months: 1 },
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
];

// Picks for when a lab, imaging, referral or procedure order expires, counted from its start.
export const ORDER_END_PICKS: DatePick[] = [
  { label: "1 week", days: 7 },
  { label: "1 month", months: 1 },
  { label: "3 months", months: 3 },
  { label: "6 months", months: 6 },
  { label: "1 year", months: 12 },
];

// Picks for how long a prescription runs, counted from its start (a course of N days).
export const RX_END_PICKS: { label: string; days: number }[] = [
  { label: "3 days", days: 3 },
  { label: "5 days", days: 5 },
  { label: "7 days", days: 7 },
  { label: "10 days", days: 10 },
  { label: "14 days", days: 14 },
  { label: "1 month", days: 30 },
  { label: "3 months", days: 90 },
];

// "Today", "Tomorrow", "Yesterday", or the date in words.
export function relativeDayLabel(ymd: string, today: string) {
  const n = daysBetween(today, ymd);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return new Date(toUtc(ymd)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

// An order's end date must not come before its start; a bad one is dropped.
export function checkedEnd(start: string | null, end: string | null): string | null {
  if (!isYmd(end)) return null;
  return start && isYmd(start) && end < start ? null : end;
}

// Shorter lists for the order basket's narrow column.
const keep = <T extends { label: string }>(picks: T[], labels: string[]) => picks.filter((p) => labels.includes(p.label));
export const BASKET_START_PICKS = keep(START_PICKS, ["Today", "Tomorrow", "1 week", "1 month"]);
export const BASKET_ORDER_END_PICKS = keep(ORDER_END_PICKS, ["1 month", "3 months", "1 year"]);
export const BASKET_RX_END_PICKS = keep(RX_END_PICKS, ["5 days", "7 days", "1 month"]);
