import "server-only";
import type { EncounterStatus, Prisma } from "@prisma/client";
import { db, type Tx } from "@/lib/db";
import type { SessionUser } from "@/lib/roles";
import { ACTIVE_STATUSES, canTransition, TRANSITIONS, type WorkflowAction } from "./workflow";
import { fitsSchedule, openSlots, type Busy } from "./slots";
import { standardSessions } from "@/lib/clinic";

const DAY = 86_400_000;

export const startOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

// Physicians and residents keep a clinic schedule, plus anyone else given
// sessions. Someone with no weekly sessions of their own works the clinic's
// standard hours (src/lib/clinic.ts), so a new clinic has open times from day one.
export async function scheduledProviders() {
  const providers = await db.practitioner.findMany({
    where: { active: true, OR: [{ role: { in: ["physician", "resident"] } }, { scheduleSessions: { some: {} } }] },
    orderBy: { name: "asc" },
    include: { scheduleSessions: true },
  });
  return providers.map(withHours);
}

function withHours<P extends { id: string; scheduleSessions: { weekday: number; startMin: number; endMin: number; slotMinutes: number }[] }>(p: P) {
  const standardHours = p.scheduleSessions.length === 0;
  return { ...p, standardHours, scheduleSessions: standardHours ? standardSessions(p.id) : p.scheduleSessions };
}

// Booked appointments and blocked time for these providers between from and to.
async function busyTimes(providerIds: string[], from: Date, to: Date, ignoreId?: string) {
  const [appts, blocks] = await Promise.all([
    db.encounter.findMany({
      where: { providerId: { in: providerIds }, status: { in: ACTIVE_STATUSES }, start: { lt: to }, id: ignoreId ? { not: ignoreId } : undefined },
      select: { providerId: true, start: true, end: true },
    }),
    db.scheduleBlock.findMany({ where: { practitionerId: { in: providerIds }, start: { lt: to }, end: { gt: from } } }),
  ]);
  const busy = new Map<string, Busy[]>(providerIds.map((id) => [id, []]));
  for (const a of appts) {
    const end = a.end ?? new Date(a.start.getTime() + 20 * 60_000);
    if (end > from) busy.get(a.providerId!)?.push({ start: a.start, end });
  }
  for (const b of blocks) busy.get(b.practitionerId)?.push({ start: b.start, end: b.end });
  return busy;
}

// Open slots for a visit of `minutes`, across `days` days from `from`, per provider.
export async function findSlots({ providerIds, minutes, from, days }: { providerIds: string[]; minutes: number; from: Date; days: number }) {
  const providers = (await db.practitioner.findMany({ where: { id: { in: providerIds } }, include: { scheduleSessions: true } })).map(withHours);
  const first = startOfDay(from);
  const busy = await busyTimes(providerIds, first, new Date(first.getTime() + (days + 1) * DAY));
  const now = new Date();
  const out: { day: Date; slots: { start: Date; providerId: string }[] }[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(first);
    day.setDate(first.getDate() + i);
    const slots = providers.flatMap((p) =>
      openSlots({ day, minutes, sessions: p.scheduleSessions, busy: busy.get(p.id) ?? [], notBefore: now }).map((start) => ({ start, providerId: p.id })),
    );
    slots.sort((a, b) => a.start.getTime() - b.start.getTime());
    out.push({ day, slots });
  }
  return out;
}

// Whether [start, end) is open on the provider's schedule; otherwise booking it is an overbook.
export async function isOpen(providerId: string, start: Date, end: Date, ignoreId?: string) {
  const [sessions, busy] = await Promise.all([
    db.scheduleSession.findMany({ where: { practitionerId: providerId } }).then((s) => (s.length ? s : standardSessions(providerId))),
    busyTimes([providerId], startOfDay(start), new Date(startOfDay(start).getTime() + DAY), ignoreId),
  ]);
  return fitsSchedule({ start, end }, sessions, busy.get(providerId) ?? []);
}

// Moves an appointment along the clinic workflow, if the user's role allows it and
// it is still in a status the step starts from (so two people clicking at once can't
// both succeed). `data` carries what the step records, such as the room.
export async function advance(
  encounterId: string,
  action: WorkflowAction,
  user: SessionUser,
  { data, detail, tx }: { data?: Prisma.EncounterUpdateManyMutationInput; detail?: string; tx?: Tx } = {},
) {
  const t = TRANSITIONS[action];
  const client = tx ?? db;
  const enc = await client.encounter.findUnique({ where: { id: encounterId }, select: { status: true } });
  if (!enc || !canTransition(action, enc.status, user.role)) return false;
  const now = new Date();
  const extra: Prisma.EncounterUpdateManyMutationInput = {};
  if (action === "arrive") extra.arrivedAt = now;
  if (action === "undoArrival") Object.assign(extra, { arrivedAt: null, copayCents: null, copayMethod: null });
  const { count } = await client.encounter.updateMany({
    where: { id: encounterId, status: { in: t.from as EncounterStatus[] } },
    data: { status: t.to, statusAt: now, ...extra, ...data },
  });
  if (!count) return false;
  await client.encounterEvent.create({ data: { encounterId, action, detail, byId: user.id, at: now } });
  return true;
}
