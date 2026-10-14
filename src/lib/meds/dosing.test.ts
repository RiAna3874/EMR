import { test } from "node:test";
import assert from "node:assert/strict";
import { DOSE_UNITS, FREQUENCIES, MED_CHOICES, doseSuggestions, joinDose, matchesPick, resolveUnit, splitDose } from "./dosing";
import { productFor } from "./formulary";
import { timesPerDay } from "./sig";

test("doses split into amount and unit, and anything else stays whole", () => {
  assert.deepEqual(splitDose("1000 mg"), { amount: "1000", unit: "mg" });
  assert.deepEqual(splitDose("0.05 mg"), { amount: "0.05", unit: "mg" });
  assert.deepEqual(splitDose("1 tablet"), { amount: "1", unit: "tablets" });
  assert.deepEqual(splitDose("2 puffs"), { amount: "2", unit: "puffs" });
  assert.deepEqual(splitDose("10 units"), { amount: "10", unit: "units" });
  assert.deepEqual(splitDose("1-2 tabs"), { amount: "1-2", unit: "tablets" });
  assert.deepEqual(splitDose("0.025%"), { amount: "0.025", unit: "%" });
  assert.deepEqual(splitDose("500 mg day 1, then 250 mg"), { amount: "500 mg day 1, then 250 mg", unit: "" });
  assert.deepEqual(splitDose("thin layer"), { amount: "thin layer", unit: "" });
  assert.deepEqual(splitDose(""), { amount: "", unit: "" });
});

test("joining a dose round-trips and writes one tablet singular", () => {
  assert.equal(joinDose("1", "tablets"), "1 tablet");
  assert.equal(joinDose("2", "tablets"), "2 tablets");
  assert.equal(joinDose("1", "mg"), "1 mg");
  assert.equal(joinDose("0.1", "%"), "0.1%");
  assert.equal(joinDose("", "mg"), "");
  assert.equal(joinDose("thin layer", ""), "thin layer");
  for (const d of ["1000 mg", "1 tablet", "2 puffs", "10 units", "50000 IU", "5 mL", "1 drop"]) {
    const { amount, unit } = splitDose(d);
    assert.equal(joinDose(amount, unit), d);
  }
  assert.equal(resolveUnit("Tab"), "tablets");
  assert.equal(resolveUnit("ML"), "mL");
  assert.equal(resolveUnit("zz"), null);
  assert.equal(new Set(DOSE_UNITS.map((u) => u.value)).size, DOSE_UNITS.length);
});

test("frequencies are found by their abbreviations and the sig maths reads them", () => {
  const find = (q: string) => FREQUENCIES.filter((f) => matchesPick(f, q)).map((f) => f.value);
  assert.equal(find("bid")[0], "twice daily");
  assert.equal(find("tid")[0], "three times daily");
  assert.ok(find("q8 prn").includes("every 8 hours as needed"));
  assert.ok(find("qhs").includes("nightly"));
  const perDay: Record<string, number | null> = {
    "once daily": 1, "twice daily": 2, "three times daily": 3, "four times daily": 4, nightly: 1, "every 8 hours": 3,
    "once weekly": 1 / 7, "every other day": 1 / 2, "once monthly": 1 / 30, "as needed": null,
  };
  for (const [f, n] of Object.entries(perDay)) assert.equal(timesPerDay(f), n, f);
});

test("dose suggestions start from the usual dose for the medication", () => {
  assert.deepEqual(doseSuggestions("Metformin 500 mg tablet").slice(0, 3), ["500 mg", "850 mg", "1000 mg"]);
  assert.ok(doseSuggestions("Metformin 500 mg tablet").includes("2 tablets"));
  assert.equal(doseSuggestions("Fish oil 1000 mg capsule")[0], "1000 mg");
  assert.ok(doseSuggestions("Insulin glargine 100 unit/mL pen", productFor({ drug: "Insulin glargine 100 unit/mL pen" })).includes("10 units"));
  assert.deepEqual(doseSuggestions("something unknown"), []);
  // Every outside medication's default dose is one the unit picker understands.
  for (const m of MED_CHOICES) if (!/then|layer|two-pack/.test(m.dose)) assert.ok(splitDose(m.dose).unit, `${m.display}: ${m.dose}`);
  assert.equal(new Set(MED_CHOICES.map((m) => m.display.toLowerCase())).size, MED_CHOICES.length);
});
