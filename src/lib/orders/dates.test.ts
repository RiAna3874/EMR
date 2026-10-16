import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, addMonths, applyPick, checkedEnd, courseDays, courseEnd, isYmd, relativeDayLabel, START_PICKS } from "./dates";

test("quick picks count from the given day", () => {
  const today = "2026-10-15";
  assert.deepEqual(
    START_PICKS.map((p) => applyPick(today, p)),
    ["2026-10-15", "2026-10-16", "2026-10-22", "2026-10-29", "2026-11-15", "2027-01-15", "2027-04-15"],
  );
});

test("months stay inside the month", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
  assert.equal(addMonths("2026-12-15", 1), "2027-01-15");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("a course counts its first day", () => {
  assert.equal(courseEnd("2026-10-15", 5), "2026-10-19");
  assert.equal(courseDays("2026-10-15", "2026-10-19"), 5);
  assert.equal(courseEnd("2026-10-15", 1), "2026-10-15");
});

test("end dates before the start are dropped", () => {
  assert.equal(checkedEnd("2026-10-15", "2026-10-14"), null);
  assert.equal(checkedEnd("2026-10-15", "2026-10-15"), "2026-10-15");
  assert.equal(checkedEnd(null, "2026-10-01"), "2026-10-01");
  assert.equal(checkedEnd("2026-10-15", "nope"), null);
  assert.equal(isYmd("2026-02-30"), false);
});

test("near days read as words", () => {
  assert.equal(relativeDayLabel("2026-10-15", "2026-10-15"), "Today");
  assert.equal(relativeDayLabel("2026-10-16", "2026-10-15"), "Tomorrow");
  assert.equal(relativeDayLabel("2026-10-20", "2026-10-15"), "20 Oct 2026");
});
