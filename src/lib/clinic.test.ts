import { test } from "node:test";
import assert from "node:assert/strict";
import { parseClinicHours } from "./clinic";

test("clinic hours default to a Sunday to Thursday, 9 to 5 week", () => {
  assert.deepEqual(parseClinicHours(), { weekdays: [0, 1, 2, 3, 4], startMin: 540, endMin: 1020, slotMinutes: 20 });
});

test("clinic hours can be overridden", () => {
  const h = parseClinicHours("Sat, Sun, Mon, Tue, Wed, Thu", "08:30-14:00");
  assert.deepEqual(h.weekdays, [6, 0, 1, 2, 3, 4]);
  assert.equal(h.startMin, 510);
  assert.equal(h.endMin, 840);
});

test("bad clinic hours fall back to the default", () => {
  assert.deepEqual(parseClinicHours("Funday", "17:00-09:00").weekdays, [0, 1, 2, 3, 4]);
  assert.equal(parseClinicHours("Mon", "17:00-09:00").startMin, 540);
});
