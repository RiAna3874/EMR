import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition, nextStep } from "./workflow";

test("each role takes its own step through an office visit", () => {
  assert.equal(nextStep("planned", "office", "front_desk"), "arrive");
  assert.equal(nextStep("arrived", "office", "nurse"), "room");
  assert.equal(nextStep("roomed", "office", "physician"), "start");
  assert.equal(nextStep("in_progress", "office", "resident"), "complete");
  assert.equal(nextStep("finished", "office", "front_desk"), "checkOut");
});

test("roles can't take steps that aren't theirs", () => {
  assert.equal(nextStep("arrived", "office", "front_desk"), null);
  assert.equal(nextStep("roomed", "office", "nurse"), null);
  assert.equal(canTransition("start", "roomed", "nurse"), false);
  assert.equal(canTransition("room", "arrived", "front_desk"), false);
  assert.equal(canTransition("arrive", "planned", "physician"), false);
});

test("a provider can start a checked-in visit without waiting for rooming", () => {
  assert.equal(nextStep("arrived", "office", "physician"), "start");
});

test("video visits skip rooming", () => {
  assert.equal(nextStep("arrived", "telehealth", "physician"), "start");
  assert.equal(nextStep("arrived", "telehealth", "nurse"), null);
});

test("only scheduled visits can be cancelled or marked no-show", () => {
  assert.equal(canTransition("cancel", "planned", "front_desk"), true);
  assert.equal(canTransition("cancel", "arrived", "front_desk"), false);
  assert.equal(canTransition("noShow", "roomed", "front_desk"), false);
  assert.equal(canTransition("undoNoShow", "no_show", "front_desk"), true);
});
