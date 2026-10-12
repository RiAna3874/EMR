import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "./password";

test("a hashed password verifies, a wrong one doesn't", async () => {
  const stored = await hashPassword("meridian");
  assert.match(stored, /^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  assert.equal(await verifyPassword("meridian", stored), true);
  assert.equal(await verifyPassword("Meridian", stored), false);
});

test("the same password hashes differently each time", async () => {
  assert.notEqual(await hashPassword("x"), await hashPassword("x"));
});

test("missing or malformed hashes never verify", async () => {
  assert.equal(await verifyPassword("meridian", null), false);
  assert.equal(await verifyPassword("meridian", ""), false);
  assert.equal(await verifyPassword("meridian", "plain$text"), false);
});
