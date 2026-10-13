import { test } from "node:test";
import assert from "node:assert/strict";
import { passwordError, temporaryPassword, usernameError } from "./accounts";

test("usernames are short lowercase handles", () => {
  assert.equal(usernameError("dchen"), null);
  assert.equal(usernameError("a.lopez-2"), null);
  assert.ok(usernameError("ab"));
  assert.ok(usernameError("Dana"));
  assert.ok(usernameError("2fast"));
  assert.ok(usernameError("dana chen"));
});

test("passwords must be long and not the demo password or the username", () => {
  assert.equal(passwordError("correct horse battery", "dchen"), null);
  assert.ok(passwordError("short", "dchen"));
  assert.ok(passwordError("meridian-meridian", "dchen"));
  assert.ok(passwordError("dchen-is-my-password", "dchen"));
  assert.ok(passwordError("aaaaaaaaaaaaaaaa", "dchen"));
});

test("temporary passwords pass the password rules and differ each time", () => {
  const a = temporaryPassword();
  assert.match(a, /^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
  assert.equal(passwordError(a, "dchen"), null);
  assert.notEqual(a, temporaryPassword());
});
