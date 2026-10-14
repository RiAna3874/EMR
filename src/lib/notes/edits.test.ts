import { test } from "node:test";
import assert from "node:assert/strict";
import { canEditSigned, currentSignature } from "./edits";

const note = { status: "signed", authorId: "author", cosignerId: null as string | null, cosignedAt: null as Date | null };

test("the author can edit their own signed, addended or awaiting-cosign note", () => {
  for (const status of ["signed", "addended", "pending_cosign"]) assert.equal(canEditSigned({ ...note, status }, "author"), true);
});

test("pended notes are not edited this way, and others cannot edit", () => {
  assert.equal(canEditSigned({ ...note, status: "draft" }, "author"), false);
  assert.equal(canEditSigned(note, "someone-else"), false);
});

test("the cosigner can edit only after cosigning", () => {
  const routed = { ...note, status: "pending_cosign", cosignerId: "attending" };
  assert.equal(canEditSigned(routed, "attending"), false);
  assert.equal(canEditSigned({ ...routed, status: "signed", cosignedAt: new Date() }, "attending"), true);
});

test("the current signature is the last edit, else the original signing", () => {
  const signedAt = new Date("2026-10-01T09:00:00Z");
  const base = { authorId: "a", signedAt, createdAt: new Date("2026-10-01T08:00:00Z"), editedById: null, editedAt: null };
  assert.deepEqual(currentSignature(base), { signedById: "a", signedAt });
  const editedAt = new Date("2026-10-02T09:00:00Z");
  assert.deepEqual(currentSignature({ ...base, editedById: "b", editedAt }), { signedById: "b", signedAt: editedAt });
});
