import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProblem } from "./link";

const problems = [
  { id: "a", display: "Type 2 diabetes mellitus without complications" },
  { id: "b", display: "Essential (primary) hypertension" },
  { id: "c", display: "Type 1 diabetes mellitus" },
];

test("links an indication to the problem it names, and nothing when unsure", () => {
  assert.equal(matchProblem("essential (primary) hypertension", problems)?.id, "b");
  assert.equal(matchProblem("Type 2 diabetes", problems)?.id, "a");
  assert.equal(matchProblem("hypertension", problems)?.id, "b");
  assert.equal(matchProblem("diabetes", problems), null);
  assert.equal(matchProblem("Rate control", problems), null);
  assert.equal(matchProblem("", problems), null);
  assert.equal(matchProblem("ty", problems), null);
});
