import { test } from "node:test";
import assert from "node:assert/strict";
import { changedFields, parentOf, patientOf, UNLOGGED_MODELS, writeAction } from "./labels";

test("Prisma operations map to added, changed and removed; reads aren't logged as writes", () => {
  assert.equal(writeAction("create"), "create");
  assert.equal(writeAction("createMany"), "create");
  assert.equal(writeAction("upsert"), "update");
  assert.equal(writeAction("updateMany"), "update");
  assert.equal(writeAction("deleteMany"), "delete");
  assert.equal(writeAction("findMany"), null);
  assert.equal(writeAction("count"), null);
});

test("only field names are kept, never values", () => {
  assert.equal(changedFields({ status: "final", text: "secret history", updatedAt: new Date() }), "status, text");
  assert.equal(changedFields({}), null);
  assert.equal(changedFields([{ a: 1 }]), null);
});

test("finds the patient from the result, the data, a connect, or the filter", () => {
  assert.equal(patientOf("Patient", { where: { id: "p1" } }, { id: "p1" }), "p1");
  assert.equal(patientOf("Note", {}, { id: "n1", patientId: "p2" }), "p2");
  assert.equal(patientOf("Observation", { data: { patientId: "p3" } }, { count: 4 }), "p3");
  assert.equal(patientOf("Condition", { data: { patient: { connect: { id: "p4" } } } }, null), "p4");
  assert.equal(patientOf("Observation", { where: { patientId: "p5" }, data: {} }, { count: 2 }), "p5");
  assert.equal(patientOf("SmartPhrase", { data: { name: "x" } }, { id: "s1" }), null);
});

test("addenda, visit events and chat messages reach the patient through their parent", () => {
  assert.deepEqual(parentOf("NoteAddendum", { data: { noteId: "n1" } }, null), { model: "Note", id: "n1" });
  assert.deepEqual(parentOf("NoteVersion", { data: { noteId: "n2" } }, null), { model: "Note", id: "n2" });
  assert.deepEqual(parentOf("EncounterEvent", {}, { encounterId: "e1" }), { model: "Encounter", id: "e1" });
  assert.deepEqual(parentOf("ChatMessage", {}, { conversationId: "c1" }), { model: "Conversation", id: "c1" });
  assert.equal(parentOf("Note", {}, { patientId: "p" }), null);
});

test("sessions and the log itself are never logged as chart changes", () => {
  for (const m of ["Session", "AuditEvent", "SignInChallenge"]) assert.ok(UNLOGGED_MODELS.has(m));
  assert.ok(!UNLOGGED_MODELS.has("Note"));
});
