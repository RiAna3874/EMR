// Builds the Results trend table: results sorted into specialty sections and panel
// sub-sections (see groups.ts), each section with its own date columns, and every
// blood sugar merged into one dated row.

import type { Flag } from "@prisma/client";
import { pivot } from "../chart";
import { ANALYTES } from "./catalog";
import { GLUCOSE_TIMINGS, glucoseFlag } from "../glucose";
import { groupLabel, groupOrder, LAB_GROUPS, placeResult, subLabel, subOrder, sugarReading, type GroupKey, type SugarReading } from "./groups";

type Obs = Parameters<typeof pivot>[0][number];
export type TrendInput<O extends Obs = Obs> = { obs: O; panel?: string | null; reportId?: string | null; imported?: boolean };

export type TrendRow<O extends Obs = Obs> = Omit<ReturnType<typeof pivot>["rows"][number], "byTime"> & { byTime: Map<number, O> };
export type SugarCell<O extends Obs = Obs> = SugarReading & { obs: O; flag: Flag | null; reportId?: string | null; imported?: boolean };
export type SugarRow<O extends Obs = Obs> = { byTime: Map<number, SugarCell<O>[]>; cells: SugarCell<O>[]; codes: string[] };

export type TrendSub<O extends Obs = Obs> = { key: string; label: string; rows: TrendRow<O>[]; sugar?: SugarRow<O> };
export type TrendSection<O extends Obs = Obs> = {
  key: GroupKey;
  label: string;
  subs: TrendSub<O>[];
  times: number[]; // every result time in this section, newest first
  reportAt: Map<number, string>; // a report to open from each date column
  imported: Set<number>;
  abnormal: number; // tests whose latest value is flagged
  latestAt: number;
};

const ANALYTE_ORDER = new Map(ANALYTES.map((a, i) => [a.loinc, i]));
const latestOf = <T,>(m: Map<number, T>) => [...m.entries()].sort((a, b) => b[0] - a[0])[0]?.[1];
const flagged = (f: Flag | null | undefined) => !!f && f !== "N";

export function buildTrend<O extends Obs>(inputs: TrendInput<O>[]): TrendSection<O>[] {
  const panelOf = new Map<string, string | null | undefined>();
  const meta = new Map<O, TrendInput<O>>();
  const sugar: SugarCell<O>[] = [];
  const rest: O[] = [];
  for (const i of inputs) {
    meta.set(i.obs, i);
    if (!panelOf.has(i.obs.code)) panelOf.set(i.obs.code, i.panel);
    const reading = sugarReading(i.obs, i.panel);
    if (reading) {
      // Fingerstick values carry their own flag; a lab glucose keeps the lab's flag.
      const flag = reading.source === "fingerstick" ? i.obs.flag ?? glucoseFlag(reading.mmol, GLUCOSE_TIMINGS.find((t) => t.key === reading.timing)!.range) : i.obs.flag;
      sugar.push({ ...reading, obs: i.obs, flag, reportId: i.reportId, imported: i.imported });
    } else if (i.obs.category !== "vital_signs") rest.push(i.obs);
  }

  const sections = new Map<GroupKey, TrendSection<O>>();
  const section = (key: GroupKey) => {
    let s = sections.get(key);
    if (!s) {
      s = { key, label: groupLabel(key), subs: [], times: [], reportAt: new Map(), imported: new Set(), abnormal: 0, latestAt: 0 };
      sections.set(key, s);
    }
    return s;
  };
  const sub = (s: TrendSection<O>, key: string) => {
    let x = s.subs.find((y) => y.key === key);
    if (!x) {
      x = { key, label: subLabel(s.key, key), rows: [] };
      s.subs.push(x);
    }
    return x;
  };
  const addTime = (s: TrendSection<O>, o: O) => {
    const t = o.effectiveAt.getTime();
    s.times.push(t);
    const m = meta.get(o);
    if (m?.reportId && !s.reportAt.has(t)) s.reportAt.set(t, m.reportId);
    if (m?.imported) s.imported.add(t);
  };

  const { rows } = pivot(rest);
  for (const row of rows as unknown as TrendRow<O>[]) {
    const place = placeResult(row.code, row.display, panelOf.get(row.code));
    const s = section(place.group);
    sub(s, place.sub).rows.push(row);
    for (const o of row.byTime.values()) addTime(s, o);
    if (flagged(latestOf(row.byTime)?.flag)) s.abnormal++;
  }

  if (sugar.length) {
    const s = section("diabetes");
    const byTime = new Map<number, SugarCell<O>[]>();
    for (const c of sugar.sort((a, b) => a.obs.effectiveAt.getTime() - b.obs.effectiveAt.getTime())) {
      const t = c.obs.effectiveAt.getTime();
      byTime.set(t, [...(byTime.get(t) ?? []), c]);
      addTime(s, c.obs);
    }
    if (flagged(sugar.at(-1)?.flag)) s.abnormal++;
    sub(s, "sugar").sugar = { byTime, cells: sugar, codes: [...new Set(sugar.map((c) => c.obs.code))] };
  }

  const out = [...sections.values()].sort((a, b) => groupOrder(a.key) - groupOrder(b.key));
  for (const s of out) {
    s.times = [...new Set(s.times)].sort((a, b) => b - a);
    s.latestAt = s.times[0] ?? 0;
    s.subs.sort((a, b) => subOrder(s.key, a.key) - subOrder(s.key, b.key));
    for (const x of s.subs) {
      const at = (r: TrendRow<O>) => ANALYTE_ORDER.get(r.code) ?? 1000;
      x.rows = x.rows.map((r, i) => ({ r, i })).sort((a, b) => at(a.r) - at(b.r) || a.i - b.i).map(({ r }) => r);
    }
  }
  return out;
}

export const GROUP_KEYS = LAB_GROUPS.map((g) => g.key) as readonly GroupKey[];
