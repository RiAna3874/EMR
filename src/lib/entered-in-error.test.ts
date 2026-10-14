import { test } from "node:test";
import assert from "node:assert/strict";
import { withoutEnteredInError } from "./entered-in-error";

test("lists and counts of results leave out what was entered in error", () => {
  assert.deepEqual(withoutEnteredInError("Observation", "findMany", { where: { patientId: "p" } }), { where: { patientId: "p", enteredInErrorAt: null } });
  assert.deepEqual(withoutEnteredInError("DiagnosticReport", "count", undefined), { where: { enteredInErrorAt: null } });
  // Asking about it explicitly, a lookup by id, a write, or another model: left alone.
  const explicit = { where: { enteredInErrorAt: { not: null } } };
  assert.equal(withoutEnteredInError("ClinicalDocument", "findMany", explicit), explicit);
  const byId = { where: { id: "r" } };
  assert.equal(withoutEnteredInError("DiagnosticReport", "findUnique", byId), byId);
  assert.equal(withoutEnteredInError("Observation", "updateMany", byId), byId);
  assert.equal(withoutEnteredInError("Note", "findMany", byId), byId);
});

test("patient lists and searches leave out charts merged into another", () => {
  assert.deepEqual(withoutEnteredInError("Patient", "findMany", { where: { mrn: "M1" } }), { where: { mrn: "M1", mergedIntoId: null } });
  const merged = { where: { mrn: "M1", mergedIntoId: { not: null } } };
  assert.equal(withoutEnteredInError("Patient", "findFirst", merged), merged);
  const byId = { where: { id: "p" } };
  assert.equal(withoutEnteredInError("Patient", "findUnique", byId), byId);
});
