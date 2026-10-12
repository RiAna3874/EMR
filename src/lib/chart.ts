import type { Observation } from "@prisma/client";
import { db } from "@/lib/db";

// Vitals from the most recent encounter that has any.
export async function latestVitals(patientId: string) {
  const last = await db.observation.findFirst({
    where: { patientId, category: "vital_signs" },
    orderBy: { effectiveAt: "desc" },
    select: { effectiveAt: true },
  });
  if (!last) return [];
  return db.observation.findMany({
    where: { patientId, category: "vital_signs", effectiveAt: last.effectiveAt },
    orderBy: { sortOrder: "asc" },
  });
}

export type Series = {
  code: string;
  display: string;
  unit: string | null;
  refLow: number | null;
  refHigh: number | null;
  refText: string | null;
  byTime: Map<number, Observation>;
  values: number[]; // oldest first
};

// Pivot observations into one row per code (in first-seen order) keyed by timestamp.
export function pivot(observations: Observation[]) {
  const times = [...new Set(observations.map((o) => o.effectiveAt.getTime()))].sort((a, b) => b - a);
  const rows = new Map<string, Series>();
  const sorted = [...observations].sort((a, b) => a.sortOrder - b.sortOrder || a.effectiveAt.getTime() - b.effectiveAt.getTime());
  for (const o of sorted) {
    let row = rows.get(o.code);
    if (!row) {
      row = { code: o.code, display: o.display, unit: o.unit, refLow: o.refLow, refHigh: o.refHigh, refText: o.refText, byTime: new Map(), values: [] };
      rows.set(o.code, row);
    }
    row.byTime.set(o.effectiveAt.getTime(), o);
  }
  for (const row of rows.values()) {
    row.values = [...row.byTime.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, o]) => o.valueNum)
      .filter((v): v is number => v !== null);
    const latest = [...row.byTime.entries()].sort((a, b) => b[0] - a[0])[0]?.[1];
    if (latest) Object.assign(row, { refLow: latest.refLow, refHigh: latest.refHigh, refText: latest.refText, unit: latest.unit });
  }
  return { times, rows: [...rows.values()] };
}
