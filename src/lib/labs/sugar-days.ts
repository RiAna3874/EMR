// The Blood sugar tab's daily table: one row per day with that day's fasting sugar and the
// sugar 2 hours after breakfast side by side, and the day's note. Lab glucose and the
// fingerstick readings recorded in Vitals both count. A day's first fasting and first
// 2-hour readings fill the row; random readings, and any repeat on the same day, are kept
// in a separate "Other readings" list so nothing is lost.

import { toLocalDate } from "../format";
import type { SugarCell } from "./trends";

type Cell = Pick<SugarCell, "timing" | "mmol"> & { obs: { id: string; effectiveAt: Date } };
export type SugarNoteLike = { day: string; text: string };

export type SugarDay<C extends Cell, N extends SugarNoteLike> = {
  day: string; // YYYY-MM-DD, clinic time
  fasting?: C;
  afterBreakfast?: C;
  rise?: number; // 2-hour minus fasting, mmol/L, when both were taken
  note?: N;
};

export function sugarDays<C extends Cell, N extends SugarNoteLike>(cells: C[], notes: N[] = []): { days: SugarDay<C, N>[]; others: C[] } {
  const byDay = new Map<string, SugarDay<C, N>>();
  const others: C[] = [];
  const dayOf = (d: string) => byDay.get(d) ?? byDay.set(d, { day: d }).get(d)!;
  for (const c of [...cells].sort((a, b) => a.obs.effectiveAt.getTime() - b.obs.effectiveAt.getTime())) {
    if (c.timing === "random") {
      others.push(c);
      continue;
    }
    const d = dayOf(toLocalDate(c.obs.effectiveAt));
    const slot = c.timing === "fasting" ? "fasting" : "afterBreakfast";
    if (d[slot]) others.push(c);
    else d[slot] = c;
  }
  for (const n of notes) if (n.text.trim()) dayOf(n.day).note = n;
  for (const d of byDay.values()) if (d.fasting && d.afterBreakfast) d.rise = Math.round((d.afterBreakfast.mmol - d.fasting.mmol) * 10) / 10;
  return {
    days: [...byDay.values()].sort((a, b) => b.day.localeCompare(a.day)),
    others: others.reverse(),
  };
}

export const SUGAR_NOTE_MAX = 500;
export const isSugarDay = (s: string) => {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return !!m && toLocalDate(new Date(+m[1], +m[2] - 1, +m[3])) === s;
};
