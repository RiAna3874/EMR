import { test } from "node:test";
import assert from "node:assert/strict";
import { can, needsCosign } from "./roles";

test("front desk can't touch clinical data", () => {
  for (const p of ["viewClinical", "writeNotes", "pendOrders", "signOrders", "recordVitals", "useInbox"] as const) {
    assert.equal(can("front_desk", p), false, p);
  }
});

test("nurses pend orders and prepare imports but don't sign or file them", () => {
  assert.equal(can("nurse", "pendOrders"), true);
  assert.equal(can("nurse", "signOrders"), false);
  assert.equal(can("nurse", "importReports"), true);
  assert.equal(can("nurse", "fileImports"), false);
  assert.equal(can("nurse", "writeNotes"), true);
  assert.equal(can("nurse", "editMeds"), false);
});

test("only attendings cosign, and only residents need it", () => {
  assert.equal(can("physician", "cosignNotes"), true);
  assert.equal(can("resident", "cosignNotes"), false);
  assert.equal(needsCosign("resident"), true);
  assert.equal(needsCosign("physician"), false);
  assert.equal(needsCosign("nurse"), false);
});

test("residents otherwise act as prescribers", () => {
  for (const p of ["signOrders", "editMeds", "editProblems", "fileImports", "reviewResults"] as const) {
    assert.equal(can("resident", p), true, p);
  }
});

test("medications: nurses review and pend, prescribers sign, attendings cosign residents", () => {
  assert.equal(can("nurse", "reviewMeds"), true);
  assert.equal(can("nurse", "pendRefills"), true);
  assert.equal(can("nurse", "approveRefills"), false);
  assert.equal(can("resident", "approveRefills"), true);
  assert.equal(can("resident", "cosignOrders"), false);
  assert.equal(can("physician", "cosignOrders"), true);
  for (const p of ["reviewMeds", "pendRefills", "approveRefills"] as const) assert.equal(can("front_desk", p), false, p);
});

test("the clinic day splits by role", () => {
  for (const r of ["physician", "resident", "nurse", "front_desk"] as const) assert.equal(can(r, "bookAppointments"), true, r);
  assert.equal(can("front_desk", "checkIn"), true);
  assert.equal(can("front_desk", "roomPatients"), false);
  assert.equal(can("nurse", "roomPatients"), true);
  assert.equal(can("nurse", "seePatients"), false);
  assert.equal(can("physician", "checkIn"), false);
});

test("every role can register a new patient", () => {
  assert.equal(can("front_desk", "registerPatients"), true);
  assert.equal(can("nurse", "registerPatients"), true);
  assert.equal(can("physician", "registerPatients"), true);
  assert.equal(can("resident", "registerPatients"), true);
});
