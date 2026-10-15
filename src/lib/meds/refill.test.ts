import { test } from "node:test";
import assert from "node:assert/strict";
import { productFor } from "./formulary";
import { refillBlocker, refillDetails } from "./refill";

const med = (over: Partial<Parameters<typeof refillDetails>[0]> = {}): Parameters<typeof refillDetails>[0] => ({
  id: "m1",
  drug: "Lisinopril 20 mg tablet",
  status: "active",
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
  const d = refillDetails(m, productFor(m)!);
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
  const d = refillDetails(m, productFor(m)!, "rr1");
  assert.equal(d.frequency, "twice daily");
  assert.equal(d.durationDays, 7);
  assert.equal(d.refillRequestId, "rr1");
});

test("outside, stopped or incomplete medications can't be refilled in one click", () => {
  const m = med();
  const p = productFor(m);
  assert.equal(refillBlocker(m, p), null);
  assert.equal(refillBlocker(med({ status: "on_hold" }), p), null);
  assert.match(refillBlocker(med({ rxClass: "historical" }), p)!, /Prescribe/);
  assert.match(refillBlocker(med({ status: "discontinued" }), p)!, /isn't a current/);
  assert.match(refillBlocker(med({ drug: "Mystery pill" }), undefined)!, /Modify/);
  assert.match(refillBlocker(med({ quantity: null }), { ...p!, quantity: "" })!, /Modify/);
});
