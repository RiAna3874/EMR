import { test } from "node:test";
import assert from "node:assert/strict";
import { closeBlockers, closeWarnings } from "./close";

test("a visit closes only with a diagnosis and a signed note", () => {
  const base = { diagnoses: 1, notes: [{ status: "signed" as const }], pendingOrders: 0, status: "in_progress" as const };
  assert.deepEqual(closeBlockers(base), []);
  assert.deepEqual(closeBlockers({ ...base, status: "roomed" }), []);
  assert.deepEqual(closeBlockers({ ...base, notes: [{ status: "pending_cosign" }] }), []);
  assert.deepEqual(closeBlockers({ ...base, diagnoses: 0 }), ["Add at least one diagnosis for this visit."]);
  assert.deepEqual(closeBlockers({ ...base, notes: [] }), ["Write a note for this visit."]);
  assert.deepEqual(closeBlockers({ ...base, notes: [{ status: "draft" }] }), ["Sign the visit note."]);
  assert.deepEqual(closeBlockers({ ...base, status: "finished" }), ["This visit isn't open."]);
  assert.deepEqual(closeBlockers({ ...base, status: "planned" }), ["The patient hasn't been checked in."]);
  assert.deepEqual(closeWarnings(base), []);
  assert.equal(closeWarnings({ ...base, pendingOrders: 2 }).length, 1);
});
