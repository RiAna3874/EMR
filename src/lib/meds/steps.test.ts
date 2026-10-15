import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTaper, currentStep, parseSteps, stepsFrequency, stepsProblem, stepsQuantity, stepsText, totalDays, type DoseStep } from "./steps";
import { FORMULARY } from "./formulary";
import { sigText } from "./sig";
import { rxFromForm, rxSummary } from "./rx";
import { doseSchedules } from "./schedule";
import { medWarnings } from "./checks";
import { refillDetails } from "./refill";

const product = (name: string) => FORMULARY.find((p) => p.display.startsWith(name))!;
const taper: DoseStep[] = [
  { dose: "40 mg", frequency: "once daily", days: 5 },
  { dose: "30 mg", frequency: "once daily", days: 5 },
  { dose: "20 mg", frequency: "once daily", days: 5 },
  { dose: "10 mg", frequency: "once daily", days: 5 },
];

test("steps parse from stored JSON or the form, and only whole ones count", () => {
  assert.deepEqual(parseSteps(JSON.stringify(taper)), taper);
  assert.deepEqual(parseSteps(taper), taper);
  assert.equal(parseSteps(null), null);
  assert.equal(parseSteps([taper[0]]), null, "one step is just a dose");
  assert.equal(parseSteps([{ ...taper[0], days: null }, taper[1]]), null, "only the last step can go on");
  assert.equal(parseSteps([taper[0], { dose: "", frequency: "daily", days: 2 }]), null);
  assert.deepEqual(parseSteps([taper[0], { dose: "10 mg", frequency: "once daily", days: "" }])?.[1].days, null);
  assert.equal(stepsProblem([taper[0], { dose: "", frequency: "daily", days: null }]), "Step 2 needs a dose and a frequency.");
  assert.equal(stepsProblem([{ ...taper[0], days: null }, taper[1]]), "Step 1 needs a number of days, since another step follows it.");
  assert.equal(stepsProblem(taper), null);
});

test("a taper reads as one sig with then between steps", () => {
  assert.equal(totalDays(taper), 20);
  assert.equal(stepsFrequency(taper), "once daily for 5 days, then 30 mg once daily for 5 days, then 20 mg once daily for 5 days, then 10 mg once daily for 5 days, then stop");
  assert.equal(
    sigText({ dose: "40 mg", route: "oral", frequency: "once daily", steps: taper }),
    "40 mg oral, once daily for 5 days, then 30 mg once daily for 5 days, then 20 mg once daily for 5 days, then 10 mg once daily for 5 days, then stop",
  );
  const followedBy: DoseStep[] = [
    { dose: "1000 mg", frequency: "twice daily", days: 2 },
    { dose: "500 mg", frequency: "twice daily", days: null },
  ];
  assert.equal(totalDays(followedBy), null);
  assert.equal(stepsText(followedBy), "1000 mg twice daily for 2 days, then 500 mg twice daily");
});

test("the quantity covers every step", () => {
  const pred = product("Prednisone 20");
  // 2 + 1.5 + 1 + 0.5 tablets a day, 5 days each.
  assert.equal(stepsQuantity(pred, taper, 30), "25 tablets");
  const azithro = product("Azithromycin 250");
  assert.equal(stepsQuantity(azithro, azithro.steps!, 30), "6 tablets");
  // An open last step is supplied for the given days.
  assert.equal(stepsQuantity(product("Metformin 500"), [{ dose: "500 mg", frequency: "once daily", days: 7 }, { dose: "500 mg", frequency: "twice daily", days: null }], 30), "67 tablets");
});

test("the taper calculator makes Epic-style steps down or up", () => {
  assert.deepEqual(buildTaper({ from: "40", to: "10", by: "10", unit: "mg", frequency: "once daily", every: 5 }), taper);
  // Down to zero means stop after the last real dose.
  assert.deepEqual(
    buildTaper({ from: "40", to: "0", by: "10", unit: "mg", frequency: "once daily", every: 5 })?.map((s) => s.dose),
    ["40 mg", "30 mg", "20 mg", "10 mg"],
  );
  // An uneven change still ends on the final dose.
  assert.deepEqual(buildTaper({ from: "30", to: "5", by: "10", unit: "mg", frequency: "once daily", every: 3 })?.map((s) => s.dose), ["30 mg", "20 mg", "10 mg", "5 mg"]);
  // A ramp up stays on its last dose.
  const ramp = buildTaper({ from: "25", to: "100", by: "25", unit: "mg", frequency: "once daily", every: 7 })!;
  assert.deepEqual(ramp.map((s) => [s.dose, s.days]), [["25 mg", 7], ["50 mg", 7], ["75 mg", 7], ["100 mg", null]]);
  assert.equal(buildTaper({ from: "40", to: "40", by: "10", unit: "mg", frequency: "daily", every: 5 }), null);
  assert.equal(buildTaper({ from: "40", to: "0", by: "0", unit: "mg", frequency: "daily", every: 5 }), null);
});

test("today's step counts from the day it was written", () => {
  const written = new Date(2026, 9, 1, 15);
  assert.deepEqual(currentStep(taper, written, new Date(2026, 9, 1, 9)), { index: 0, day: 1, from: 1, to: 5 });
  assert.deepEqual(currentStep(taper, written, new Date(2026, 9, 7)), { index: 1, day: 7, from: 6, to: 10 });
  assert.deepEqual(currentStep(taper, written, new Date(2026, 9, 21)), { done: true, day: 21 });
});

test("the composer's steps become the prescription, and refill and dose checks keep them", () => {
  const pred = product("Prednisone 20");
  const f = new FormData();
  f.set("steps", JSON.stringify(taper));
  f.set("dose", "ignored");
  const d = rxFromForm(f, pred);
  assert.deepEqual(d.steps, taper);
  assert.equal(d.dose, "40 mg");
  assert.equal(d.quantity, "25 tablets");
  assert.equal(d.daysSupply, 20);
  assert.match(rxSummary(d), /^40 mg oral, once daily for 5 days, then 30 mg.*then stop\. Dispense 25 tablets \(20-day supply\), 0 refills\.$/);

  const r = refillDetails(
    { id: "m1", drug: pred.display, rxnorm: pred.rxnorm, rxClass: "print", dose: "40 mg", route: "oral", frequency: stepsFrequency(taper), steps: taper, prn: false, prnReason: null, quantity: "25 tablets", refills: 0, daw: false, patientInstructions: null, pharmacyId: null },
    pred,
  );
  assert.deepEqual(r.steps, taper);
  assert.equal(r.frequency, "once daily");
  assert.equal(r.daysSupply, 20);

  // Every step's dose is checked: a later step over the limit still stops.
  const ctx = { allergies: [], activeMeds: [], egfr: null };
  const tooHigh = [{ dose: "500 mg", frequency: "twice daily", days: 2 }, { dose: "1500 mg", frequency: "three times daily", days: null }];
  assert.ok(medWarnings("Metformin 500 mg tablet", { dose: "500 mg", frequency: "twice daily", steps: tooHigh }, ctx).some((w) => w.kind === "dose"));
  assert.ok(!medWarnings("Metformin 500 mg tablet", { dose: "500 mg", frequency: "twice daily" }, ctx).some((w) => w.kind === "dose"));
});

test("the Bangla prescription writes one 1+0+1 line per step, then stop", () => {
  const pred = product("Prednisone 20");
  const bn = doseSchedules({ drug: pred.display, dose: "40 mg", frequency: stepsFrequency(taper), steps: taper, prn: false }, "bn", pred);
  assert.deepEqual(
    bn.steps.map((s) => [s.pattern, s.duration]),
    [
      ["২+০+০", "৫ দিন"],
      ["১½+০+০", "৫ দিন"],
      ["১+০+০", "৫ দিন"],
      ["½+০+০", "৫ দিন"],
    ],
  );
  assert.equal(bn.stop, true);
  const en = doseSchedules({ drug: "Metformin 500 mg tablet", dose: "500 mg", frequency: "x", steps: [{ dose: "500 mg", frequency: "once daily", days: 7 }, { dose: "500 mg", frequency: "twice daily", days: null }], prn: false }, "en", product("Metformin 500"));
  assert.deepEqual(en.steps.map((s) => [s.pattern, s.duration]), [["1+0+0", "7 days"], ["1+0+1", "continue"]]);
  assert.equal(en.stop, false);
  // Without steps it is the same single schedule as before.
  assert.equal(doseSchedules({ drug: "X", dose: "1 tablet", frequency: "nightly", prn: false }, "en").steps.length, 1);
});
