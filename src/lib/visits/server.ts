import "server-only";
import type { Encounter } from "@prisma/client";
import { db } from "@/lib/db";
import { startOfDay } from "@/lib/scheduling/server";
import { OPEN_STATUSES } from "./close";

const DAY = 86_400_000;

// The visit the chart's Visit tab shows: the one asked for, else the patient's visit
// today (an open one first), else none.
export async function visitFor(patientId: string, encounterId?: string) {
  if (encounterId) return db.encounter.findFirst({ where: { id: encounterId, patientId } });
  const today = startOfDay(new Date());
  const visits = await db.encounter.findMany({
    where: { patientId, start: { gte: today, lt: new Date(today.getTime() + DAY) }, status: { notIn: ["cancelled", "no_show"] } },
    orderBy: { start: "asc" },
  });
  return visits.find((v) => OPEN_STATUSES.includes(v.status)) ?? visits.find((v) => v.status === "planned") ?? visits.at(-1) ?? null;
}

// Everything that happened at a visit. Orders and prescriptions aren't tied to an
// encounter, so they're the ones signed on the visit's day; notes are the ones linked
// to the visit, or the visit provider's notes for the patient that day without a visit.
export async function visitDetails(visit: Pick<Encounter, "id" | "patientId" | "start" | "providerId">) {
  const from = startOfDay(visit.start);
  const to = new Date(from.getTime() + DAY);
  const [diagnoses, notes, orders, meds, pendingOrders, vitals] = await Promise.all([
    db.encounterDiagnosis.findMany({ where: { encounterId: visit.id }, orderBy: { rank: "asc" } }),
    db.note.findMany({
      where: {
        patientId: visit.patientId,
        OR: [{ encounterId: visit.id }, ...(visit.providerId ? [{ encounterId: null, authorId: visit.providerId, serviceAt: { gte: from, lt: to } }] : [])],
      },
      orderBy: { serviceAt: "asc" },
      include: { author: true },
    }),
    db.serviceRequest.findMany({
      where: { patientId: visit.patientId, type: { not: "medication" }, status: { in: ["signed", "completed"] }, signedAt: { gte: from, lt: to } },
      orderBy: { signedAt: "asc" },
    }),
    db.medicationRequest.findMany({
      // Prescribed that day, or continued as it is that day (medication reconciliation).
      where: {
        patientId: visit.patientId,
        status: { in: ["active", "on_hold", "completed"] },
        OR: [{ rxClass: { not: "historical" }, authoredAt: { gte: from, lt: to } }, { continuedAt: { gte: from, lt: to } }],
      },
      orderBy: { authoredAt: "asc" },
    }),
    db.serviceRequest.count({ where: { patientId: visit.patientId, status: "pending" } }),
    db.observation.findMany({ where: { patientId: visit.patientId, category: "vital_signs", effectiveAt: { gte: from, lt: to } }, orderBy: { effectiveAt: "desc" } }),
  ]);
  // The latest reading of each vital that day.
  const latest = new Map<string, (typeof vitals)[number]>();
  for (const v of vitals) if (!latest.has(v.code)) latest.set(v.code, v);
  return { diagnoses, notes, orders, meds, pendingOrders, vitals: latest };
}
