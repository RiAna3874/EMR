import { test } from "node:test";
import assert from "node:assert/strict";
import { isShown, movableOrder, moved, readPrefs, shownIn, withAreaReset, withHidden, withOrder, withWide, DEFAULT_PREFS } from "./view-prefs";

test("everything is shown and hover is on by default", () => {
  assert.deepEqual(readPrefs({}), DEFAULT_PREFS);
  assert.deepEqual(readPrefs(null), DEFAULT_PREFS);
  assert.equal(isShown(DEFAULT_PREFS, "summary:meds"), true);
});

test("saved prefs are cleaned of unknown and locked keys", () => {
  const p = readPrefs({ hidden: ["summary:meds", "nope", "rail:allergies", 3, "summary:meds"], hover: false });
  assert.deepEqual(p, { ...DEFAULT_PREFS, hidden: ["summary:meds"], hover: false });
});

test("allergies and code status can't be hidden", () => {
  const p = withHidden(DEFAULT_PREFS, ["rail:allergies", "rail:code", "rail:chat"], true);
  assert.deepEqual(p.hidden, ["rail:chat"]);
  assert.equal(isShown({ ...DEFAULT_PREFS, hidden: ["rail:allergies"] }, "rail:allergies"), true);
});

test("hiding and showing again", () => {
  let p = withHidden(DEFAULT_PREFS, ["tab:texts", "tab:media"], true);
  const show = shownIn(p, "tab");
  assert.equal(show("texts"), false);
  assert.equal(show("meds"), true);
  p = withHidden(p, ["tab:texts"], false);
  assert.deepEqual(p.hidden, ["tab:media"]);
});

test("a saved order is cleaned and new items keep their usual place", () => {
  const p = readPrefs({ order: { tab: ["tab:meds", "tab:visit", "tab:nope", "tab:meds", "rail:chat"], rail: ["rail:allergies", "rail:chat"] } });
  assert.deepEqual(p.order, { tab: ["tab:meds", "tab:visit"], rail: ["rail:chat"] });
  // Tabs the saved order leaves out stay after the tab they normally follow.
  const tabs = movableOrder(p, "tab");
  assert.deepEqual(tabs.slice(0, 4), ["tab:summary", "tab:meds", "tab:problems", "tab:allergies"]);
  assert.equal(tabs[tabs.indexOf("tab:visit") + 1], "tab:results");
  assert.equal(tabs.length, 15);
});

test("pinned items can't be moved, and the standard order is stored as none", () => {
  let p = withOrder(DEFAULT_PREFS, "rail", ["rail:chat", "rail:allergies", "rail:problems"]);
  assert.deepEqual(p.order.rail, ["rail:chat", "rail:problems"]);
  assert.equal(movableOrder(p, "rail")[0], "rail:chat");
  p = withOrder(p, "rail", ["rail:problems", "rail:vitals", "rail:next", "rail:chat"]);
  assert.equal(p.order.rail, undefined);
  assert.deepEqual(withOrder(DEFAULT_PREFS, "results", ["results:units", "results:range"]).order, {});
});

test("moving one item up and down", () => {
  assert.deepEqual(moved(["a", "b", "c"], "c", -1), ["a", "c", "b"]);
  assert.deepEqual(moved(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  assert.deepEqual(moved(["a", "b", "c"], "a", 2), ["b", "c", "a"]);
});

test("top bar links can be moved but never hidden", () => {
  assert.deepEqual(withHidden(DEFAULT_PREFS, ["nav:inbox"], true).hidden, []);
  assert.deepEqual(readPrefs({ hidden: ["nav:inbox"] }).hidden, []);
});

test("layout settings are checked when read", () => {
  const p = readPrefs({ drag: false, textSize: 300, startTab: "visit", wide: ["summary:meds", "tab:meds"] });
  assert.equal(p.drag, false);
  assert.equal(p.textSize, 100);
  assert.equal(p.startTab, "visit");
  assert.deepEqual(p.wide, ["summary:meds"]);
  assert.equal(readPrefs({ startTab: "../admin" }).startTab, "");
  assert.equal(readPrefs({ textSize: 125 }).textSize, 125);
});

test("resetting one area leaves the others alone", () => {
  let p = withOrder(withHidden(DEFAULT_PREFS, ["summary:notes", "tab:texts"], true), "summary", ["summary:notes", "summary:problems"]);
  p = withWide(p, "summary:meds", true);
  p = withAreaReset(p, "summary");
  assert.deepEqual(p.hidden, ["tab:texts"]);
  assert.deepEqual(p.order, {});
  assert.deepEqual(p.wide, []);
});
