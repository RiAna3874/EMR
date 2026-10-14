import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtDob, parseTypedDob } from "./format";

test("dates of birth are shown and searched day first", () => {
  const d = new Date(Date.UTC(1980, 3, 3));
  assert.equal(fmtDob(d), "03/04/1980");
  assert.equal(parseTypedDob("03/04/1980")?.getTime(), d.getTime());
  assert.equal(parseTypedDob("3-4-1980")?.getTime(), d.getTime());
  assert.equal(parseTypedDob("31/02/1980"), null);
  assert.equal(parseTypedDob("Karim"), null);
});
