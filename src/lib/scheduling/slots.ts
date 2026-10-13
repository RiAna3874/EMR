// Open-slot search. Pure functions over a provider's sessions, blocked time and
// booked appointments, so they can be tested without a database. Times are the
// server's local time, as everywhere else in the app.

export type Session = { weekday: number; startMin: number; endMin: number; slotMinutes: number };
export type Busy = { start: Date; end: Date };

const MIN = 60_000;

const at = (day: Date, minutes: number) => {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  return new Date(d.getTime() + minutes * MIN);
};

export const overlaps = (a: Busy, b: Busy) => a.start < b.end && b.start < a.end;

// Session time ranges on one day.
export function sessionsOn(day: Date, sessions: Session[]) {
  return sessions
    .filter((s) => s.weekday === day.getDay())
    .sort((a, b) => a.startMin - b.startMin)
    .map((s) => ({ start: at(day, s.startMin), end: at(day, s.endMin), slotMinutes: s.slotMinutes }));
}

// Start times on `day` where a visit of `minutes` fits inside one session without
// touching blocked time or another appointment, stepping by the session's slot length.
export function openSlots({
  day,
  minutes,
  sessions,
  busy,
  notBefore,
}: {
  day: Date;
  minutes: number;
  sessions: Session[];
  busy: Busy[];
  notBefore?: Date;
}): Date[] {
  const out: Date[] = [];
  for (const s of sessionsOn(day, sessions)) {
    for (let t = s.start.getTime(); t + minutes * MIN <= s.end.getTime(); t += s.slotMinutes * MIN) {
      const slot = { start: new Date(t), end: new Date(t + minutes * MIN) };
      if (notBefore && slot.start < notBefore) continue;
      if (busy.some((b) => overlaps(slot, b))) continue;
      out.push(slot.start);
    }
  }
  return out;
}

// Whether a booking at [start, end) sits inside a session and clear of everything
// else; anything else is an overbook, which needs to be asked for explicitly.
export function fitsSchedule(slot: Busy, sessions: Session[], busy: Busy[]) {
  const inSession = sessionsOn(slot.start, sessions).some((s) => slot.start >= s.start && slot.end <= s.end);
  return inSession && !busy.some((b) => overlaps(slot, b));
}
