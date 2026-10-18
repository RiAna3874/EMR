import { test } from "node:test";
import assert from "node:assert/strict";
import { isSugarDay, sugarDays } from "./sugar-days";

let n = 0;
const cell = (at: string, timing: "fasting" | "random" | "post_meal", mmol: number) => ({ timing, mmol, obs: { id: String(++n), effectiveAt: new Date(at) } });

test("fasting and 2 hours after breakfast share one row per day, newest day first", () => {
  const { days, others } = sugarDays([
    cell("2026-10-16T07:30:00", "fasting", 6.1),
    cell("2026-10-16T10:00:00", "post_meal", 9.4),
    cell("2026-10-17T07:15:00", "fasting", 5.8),
  ]);
  assert.deepEqual(days.map((d) => d.day), ["2026-10-17", "2026-10-16"]);
  assert.equal(days[1].fasting?.mmol, 6.1);
  assert.equal(days[1].afterBreakfast?.mmol, 9.4);
  assert.equal(days[1].rise, 3.3);
  assert.equal(days[0].afterBreakfast, undefined);
  assert.equal(days[0].rise, undefined);
  assert.equal(others.length, 0);
});

test("random readings and same-day repeats go to the other readings list", () => {
  const { days, others } = sugarDays([
    cell("2026-10-16T07:30:00", "fasting", 6.1),
    cell("2026-10-16T08:00:00", "fasting", 6.4),
    cell("2026-10-16T16:00:00", "random", 11.2),
  ]);
  assert.equal(days.length, 1);
  assert.equal(days[0].fasting?.mmol, 6.1);
  assert.deepEqual(others.map((c) => c.mmol), [11.2, 6.4]);
});

test("a day with only random readings has no row; a note alone makes one", () => {
  const { days } = sugarDays([cell("2026-10-16T16:00:00", "random", 8)], [{ day: "2026-10-15", text: "Missed breakfast" }, { day: "2026-10-14", text: "  " }]);
  assert.deepEqual(days.map((d) => d.day), ["2026-10-15"]);
  assert.equal(days[0].note?.text, "Missed breakfast");
});

test("day keys", () => {
  assert.ok(isSugarDay("2026-10-16"));
  assert.ok(!isSugarDay("16/10/2026"));
});

test("impossible dates are not days", () => {
  assert.ok(!isSugarDay("2026-02-30"));
});
