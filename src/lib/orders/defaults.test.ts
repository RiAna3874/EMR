import { test } from "node:test";
import assert from "node:assert/strict";
import { orderableByCode, orderSetById, searchOrderSets } from "./catalog";
import { orderDefaults, suggestProblem } from "./defaults";

const problems = [
  { id: "dm", display: "Type 2 diabetes mellitus without complications" },
  { id: "htn", display: "Essential (primary) hypertension" },
  { id: "hld", display: "Hyperlipidemia, unspecified" },
];
const get = (code: string) => orderableByCode.get(code)!;

test("labs and imaging are routine and due today; referrals have no date", () => {
  assert.deepEqual(orderDefaults(get("58410-2"), [], "2026-10-14"), { priority: "routine", expectedAt: "2026-10-14", conditionId: null });
  assert.equal(orderDefaults(get("CPT:71046"), [], "2026-10-14").expectedAt, "2026-10-14");
  assert.equal(orderDefaults(get("REF:cardiology"), [], "2026-10-14").expectedAt, null);
});

test("an order links to the one problem it is plainly for", () => {
  assert.equal(suggestProblem(get("4548-4"), problems)?.id, "dm");
  assert.equal(suggestProblem(get("57698-3"), problems)?.id, "hld");
  assert.equal(suggestProblem(get("CPT:71046"), problems), null);
});

test("an order matching two problems links to neither", () => {
  const both = [...problems, { id: "dm1", display: "Type 1 diabetes mellitus" }];
  assert.equal(suggestProblem(get("4548-4"), both), null);
});

test("an order set's problem wins over the order's own keywords", () => {
  const set = orderSetById.get("hypertension")!;
  assert.equal(suggestProblem(get("57698-3"), problems, set)?.id, "htn");
  // No hypertension on the list: fall back to the order's own match.
  assert.equal(suggestProblem(get("57698-3"), problems.filter((p) => p.id !== "htn"), set)?.id, "hld");
});

test("order sets are found by name, contents or the problem they are for", () => {
  assert.deepEqual(searchOrderSets("diabetes").map((s) => s.id), ["diabetes"]);
  assert.deepEqual(searchOrderSets("echo").map((s) => s.id), ["heart-failure"]);
  assert.ok(searchOrderSets("order set", 10).length >= 5);
});
