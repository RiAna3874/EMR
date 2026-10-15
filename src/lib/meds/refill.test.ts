import { test } from "node:test";
import assert from "node:assert/strict";
import { refillBlocker, refillDetails, refillProduct } from "./refill";

const med = (over: Partial<Parameters<typeof refillDetails>[0]> = {}): Parameters<typeof refillDetails>[0] => ({
  id: "m1",
  drug: "Lisinopril 20 mg tablet",
  rxnorm: "314077",
  rxClass: "print",
  dose: "20 mg",
  route: "oral",
  frequency: "once daily",
  prn: false,
  prnReason: null,
  quantity: "90 tablets",
  refills: 3,
  daw: false,
  patientInstructions: "Take in the morning",
  pharmacyId: null,
  ...over,
});

test("a refill is the same prescription again, replacing the current one", () => {
  const m = med();
  const d = refillDetails(m, refillProduct(m)!);
  assert.equal(d.dose, "20 mg");
  assert.equal(d.frequency, "once daily");
  assert.equal(d.quantity, "90 tablets");
  assert.equal(d.refills, 3);
  assert.equal(d.daysSupply, 90);
  assert.equal(d.replacesId, "m1");
  assert.equal(d.refill, true);
  assert.equal(d.rxClass, "print");
  assert.equal(d.patientInstructions, "Take in the morning");
});

test("a course is refilled as the same course, and answers an open pharmacy request", () => {
  const m = med({ frequency: "twice daily for 7 days" });
  const d = refillDetails(m, refillProduct(m)!, "rr1");
  assert.equal(d.frequency, "twice daily");
  assert.equal(d.durationDays, 7);
  assert.equal(d.refillRequestId, "rr1");
});

test("an outside medicine is refilled as this clinic's printed prescription, for a month", () => {
  const m = med({ rxClass: "historical", quantity: null, refills: 2 });
  const d = refillDetails(m, refillProduct(m)!);
  assert.equal(d.rxClass, "print");
  assert.equal(d.refills, 0);
  // No quantity on record: the list's usual quantity for the drug.
  assert.equal(d.quantity, refillProduct(m)!.quantity);
  assert.ok(d.quantity);
  assert.equal(refillBlocker(m), null);
});

test("a medicine not on the list is refilled by name with a month's supply", () => {
  const m = med({ drug: "Mystery herbal tonic", rxnorm: null, rxClass: "historical", quantity: null, dose: "10 mL", frequency: "twice daily" });
  const p = refillProduct(m)!;
  assert.equal(p.offList, true);
  assert.equal(refillBlocker(m), null);
  const d = refillDetails(m, p);
  assert.equal(d.quantity, "30 days' supply");
  assert.equal(d.daysSupply, 30);
});

test("a medicine with no dose or frequency goes through Modify", () => {
  assert.match(refillBlocker(med({ dose: "" }))!, /Modify/);
  assert.match(refillBlocker(med({ frequency: " " }))!, /Modify/);
});
