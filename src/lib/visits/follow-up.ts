// When the patient should come back, picked on the visit screen and printed on the
// visit prescription. The front desk books it at check-out.

export type FollowUp = { id: string; label: string; bn: string; days?: number; months?: number };

export const FOLLOW_UPS: FollowUp[] = [
  { id: "3d", label: "3 days", bn: "৩ দিন পর", days: 3 },
  { id: "1w", label: "1 week", bn: "১ সপ্তাহ পর", days: 7 },
  { id: "2w", label: "2 weeks", bn: "২ সপ্তাহ পর", days: 14 },
  { id: "1m", label: "1 month", bn: "১ মাস পর", months: 1 },
  { id: "2m", label: "2 months", bn: "২ মাস পর", months: 2 },
  { id: "3m", label: "3 months", bn: "৩ মাস পর", months: 3 },
  { id: "6m", label: "6 months", bn: "৬ মাস পর", months: 6 },
  { id: "1y", label: "1 year", bn: "১ বছর পর", months: 12 },
  { id: "prn", label: "As needed", bn: "প্রয়োজন হলে" },
];

const byId = new Map(FOLLOW_UPS.map((f) => [f.id, f]));
export const followUpOption = (id: string | null | undefined) => (id ? byId.get(id) : undefined);

// The return date for an interval counted from the visit day, or null for "as needed".
// A month later from the 31st lands on the month's last day, not in the month after.
export function followUpDateFor(id: string, from: Date): Date | null {
  const f = byId.get(id);
  if (!f || (!f.days && !f.months)) return null;
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (f.days) d.setDate(d.getDate() + f.days);
  if (f.months) {
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + f.months);
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
  }
  return d;
}

// followUpDate is a date-only column: stored as midnight UTC of the clinic's calendar day.
export const toDbDate = (d: Date) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
export const fromDbDate = (d: Date) => new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

// "2 weeks (28 Oct 2026)", or the date alone when one was picked.
export function followUpText(v: { followUpInterval: string | null; followUpDate: Date | null }, fmt: (d: Date) => string) {
  const f = followUpOption(v.followUpInterval);
  if (f && !v.followUpDate) return f.label;
  if (!v.followUpDate) return null;
  const date = fmt(fromDbDate(v.followUpDate));
  return f ? `${f.label} (${date})` : date;
}
