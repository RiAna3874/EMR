import { test } from "node:test";
import assert from "node:assert/strict";
import { fitsSchedule, openSlots, type Session } from "./slots";

// Monday 2026-10-12, local time.
const monday = new Date(2026, 9, 12);
const t = (h: number, m = 0) => new Date(2026, 9, 12, h, m);
const hm = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
const morning: Session[] = [{ weekday: 1, startMin: 8 * 60, endMin: 10 * 60, slotMinutes: 20 }];

test("steps through the session by slot length", () => {
  const slots = openSlots({ day: monday, minutes: 20, sessions: morning, busy: [] });
  assert.deepEqual(slots.map(hm), ["8:00", "8:20", "8:40", "9:00", "9:20", "9:40"]);
});

test("a longer visit must fit before the session ends", () => {
  const slots = openSlots({ day: monday, minutes: 40, sessions: morning, busy: [] });
  assert.deepEqual(slots.map(hm), ["8:00", "8:20", "8:40", "9:00", "9:20"]);
});

test("skips booked appointments and blocked time", () => {
  const busy = [
    { start: t(8, 20), end: t(8, 40) },
    { start: t(9, 0), end: t(10, 0) }, // meeting
  ];
  const slots = openSlots({ day: monday, minutes: 20, sessions: morning, busy });
  assert.deepEqual(slots.map(hm), ["8:00", "8:40"]);
  assert.deepEqual(openSlots({ day: monday, minutes: 40, sessions: morning, busy }).map(hm), []);
});

test("no sessions on other weekdays, and nothing in the past", () => {
  assert.deepEqual(openSlots({ day: new Date(2026, 9, 13), minutes: 20, sessions: morning, busy: [] }), []);
  const slots = openSlots({ day: monday, minutes: 20, sessions: morning, busy: [], notBefore: t(9, 5) });
  assert.deepEqual(slots.map(hm), ["9:20", "9:40"]);
});

test("a booking outside a session or over another one is an overbook", () => {
  assert.equal(fitsSchedule({ start: t(8, 0), end: t(8, 20) }, morning, []), true);
  assert.equal(fitsSchedule({ start: t(9, 50), end: t(10, 10) }, morning, []), false);
  assert.equal(fitsSchedule({ start: t(12, 0), end: t(12, 20) }, morning, []), false);
  assert.equal(fitsSchedule({ start: t(8, 0), end: t(8, 20) }, morning, [{ start: t(8, 10), end: t(8, 30) }]), false);
});
