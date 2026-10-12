import { db } from "@/lib/db";

export function todayRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start.getTime() + 86_400_000);
  return { start, end };
}

export async function todaysSchedule() {
  const { start, end } = todayRange();
  return db.encounter.findMany({
    where: { start: { gte: start, lt: end }, status: { not: "cancelled" } },
    orderBy: { start: "asc" },
    include: { patient: true, provider: true },
  });
}

// Abnormal lab results filed in the last `days` days, newest first.
export async function recentAbnormalLabs(days = 30, patientId?: string) {
  return db.observation.findMany({
    where: {
      patientId,
      category: "laboratory",
      flag: { in: ["L", "H", "LL", "HH", "A"] },
      effectiveAt: { gte: new Date(Date.now() - days * 86_400_000) },
    },
    orderBy: [{ effectiveAt: "desc" }, { sortOrder: "asc" }],
    include: { patient: true, report: true },
  });
}
