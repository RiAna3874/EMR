import { test } from "node:test";
import assert from "node:assert/strict";
import { canCorrectResult, correctionDefaults, correctResult, type StoredResult } from "./correction";

// Hemoglobin filed as 1.32 when the report said 13.2.
const hgb: StoredResult & { code: string; display: string } = {
  code: "718-7",
  display: "Hemoglobin",
  valueNum: 1.32,
  valueText: null,
  unit: "g/dL",
  refLow: 12,
  refHigh: 16,
  refText: null,
  flag: "LL",
};

test("a corrected value gets a fresh flag", () => {
  const { next, error } = correctResult(hgb, { ...correctionDefaults(hgb), value: "13.2" }, "female");
  assert.equal(error, null);
  assert.equal(next.valueNum, 13.2);
  assert.equal(next.flag, "N");
  assert.equal(next.refLow, 12);
  assert.equal(next.refHigh, 16);
});

test("the form's starting values round-trip to what is on file", () => {
  const wbc = { code: "6690-2", display: "WBC", valueNum: 7.2, valueText: null, unit: "10*3/uL", refLow: 4, refHigh: 11, refText: null, flag: "N" as const };
  const { next, error } = correctResult(wbc, correctionDefaults(wbc), "male");
  assert.deepEqual(next, { valueNum: 7.2, valueText: null, unit: "10*3/uL", refLow: 4, refHigh: 11, refText: null, flag: "N" });
  assert.match(error ?? "", /Nothing changed/);
});

test("a wrong range can be fixed too, and the flag follows it", () => {
  const ldl = { code: "13457-7", display: "LDL", valueNum: 150, valueText: null, unit: "mg/dL", refLow: null, refHigh: 200, refText: "<200", flag: "N" as const };
  const { next, error } = correctResult(ldl, { ...correctionDefaults(ldl), range: "<100" }, "male");
  assert.equal(error, null);
  assert.equal(next.refHigh, 100);
  assert.equal(next.flag, "H");
});

test("a blank value is refused, and an implausible one is warned about", () => {
  assert.match(correctResult(hgb, { ...correctionDefaults(hgb), value: " " }, "female").error ?? "", /No value/);
  const { issues, error } = correctResult(hgb, { ...correctionDefaults(hgb), value: "132" }, "female");
  assert.equal(error, null);
  assert.ok(issues.some((i) => /plausible/.test(i.text)));
});

test("text results keep the lab's flag when there's no range", () => {
  const culture = { code: "local:urine-culture", display: "Urine culture", valueNum: null, valueText: "Positive", unit: null, refLow: null, refHigh: null, refText: null, flag: "A" as const };
  const { next } = correctResult(culture, { ...correctionDefaults(culture), value: "No growth", flag: "N" }, "female");
  assert.equal(next.valueText, "No growth");
  assert.equal(next.flag, "N");
});

test("prescribers correct any result; nurses only reports they imported", () => {
  assert.equal(canCorrectResult({ id: "a", role: "physician" }, { importJob: null }), true);
  assert.equal(canCorrectResult({ id: "r", role: "resident" }, { importJob: { createdById: "n" } }), true);
  assert.equal(canCorrectResult({ id: "n", role: "nurse" }, { importJob: { createdById: "n" } }), true);
  assert.equal(canCorrectResult({ id: "n", role: "nurse" }, { importJob: { createdById: "x" } }), false);
  assert.equal(canCorrectResult({ id: "n", role: "nurse" }, { importJob: null }), false);
  assert.equal(canCorrectResult({ id: "f", role: "front_desk" }, { importJob: null }), false);
});
