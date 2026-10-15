import { test } from "node:test";
import assert from "node:assert/strict";
import { vitalObservations } from "./vitals";

const form = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, x] of Object.entries(v)) f.set(k, x);
  return f;
};
const at = new Date("2026-10-14T10:00:00");
const file = (v: Record<string, string>, dob?: Date) => vitalObservations(form(v), { patientId: "p", at, dob });
const row = (r: ReturnType<typeof file>, code: string) => r.data.find((d) => d.code === code);

test("temperature typed in °F is kept in °C", () => {
  const r = file({ temp: "101", tempUnit: "F" });
  assert.equal(r.error, null);
  assert.equal(row(r, "8310-5")?.valueNum, 38.3);
  assert.equal(row(r, "8310-5")?.flag, "H");
  assert.equal(row(file({ temp: "37", tempUnit: "C" }), "8310-5")?.valueNum, 37);
});

test("impossible values are refused, and nothing is filed", () => {
  assert.match(file({ temp: "101", tempUnit: "C" }).error ?? "", /°F or °C/);
  assert.match(file({ hr: "720" }).error ?? "", /Heart rate/);
  assert.match(file({ sbp: "80", dbp: "120" }).error ?? "", /lower than systolic/);
  assert.match(file({ sbp: "120" }).error ?? "", /both numbers/);
  assert.match(file({ spo2: "abc" }).error ?? "", /must be a number/);
  assert.equal(file({ hr: "720", rr: "16" }).data.length, 0);
});

test("heart and breathing rates are flagged for the child's age", () => {
  const toddler = new Date("2025-01-01");
  assert.equal(row(file({ hr: "130", rr: "30" }, toddler), "8867-4")?.flag, "N");
  assert.equal(row(file({ hr: "130", rr: "30" }, toddler), "9279-1")?.flag, "N");
  assert.equal(row(file({ hr: "130" }, new Date("1980-01-01")), "8867-4")?.flag, "H");
  // Children's blood pressure isn't flagged against adult limits.
  assert.equal(row(file({ sbp: "95", dbp: "55" }, toddler), "8480-6")?.flag, null);
});

test("POC glucose is kept in mmol/L under its timing, and flagged for that timing", () => {
  const fasting = row(file({ glucose: "6.2", glucoseTiming: "fasting" }), "poc-glucose-fasting");
  assert.equal(fasting?.valueNum, 6.2);
  assert.equal(fasting?.unit, "mmol/L");
  assert.equal(fasting?.flag, "H");
  // The same number 2 hours after a meal is normal.
  assert.equal(row(file({ glucose: "6.2", glucoseTiming: "post_meal" }), "poc-glucose-post-meal")?.flag, "N");
  // mg/dL is converted; random is the default timing.
  const mg = file({ glucose: "180", glucoseUnit: "mg" });
  assert.equal(row(mg, "poc-glucose-random")?.valueNum, 10);
  assert.equal(mg.data.filter((d) => d.code.startsWith("poc-glucose")).length, 1);
  assert.equal(row(file({ glucose: "2.5" }), "poc-glucose-random")?.flag, "LL");
  assert.equal(row(file({ glucose: "22" }), "poc-glucose-random")?.flag, "HH");
});

test("a glucose in the wrong unit is refused", () => {
  assert.match(file({ glucose: "180" }).error ?? "", /mmol\/L or mg\/dL/);
  assert.match(file({ glucose: "5", glucoseUnit: "mg" }).error ?? "", /mmol\/L or mg\/dL/);
});
