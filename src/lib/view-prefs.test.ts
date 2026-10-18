import { test } from "node:test";
import assert from "node:assert/strict";
import { isShown, readPrefs, shownIn, withHidden, DEFAULT_PREFS } from "./view-prefs";

test("everything is shown and hover is on by default", () => {
  assert.deepEqual(readPrefs({}), DEFAULT_PREFS);
  assert.deepEqual(readPrefs(null), DEFAULT_PREFS);
  assert.equal(isShown(DEFAULT_PREFS, "summary:meds"), true);
});

test("saved prefs are cleaned of unknown and locked keys", () => {
  const p = readPrefs({ hidden: ["summary:meds", "nope", "rail:allergies", 3, "summary:meds"], hover: false });
  assert.deepEqual(p, { hidden: ["summary:meds"], hover: false });
});

test("allergies and code status can't be hidden", () => {
  const p = withHidden(DEFAULT_PREFS, ["rail:allergies", "rail:code", "rail:chat"], true);
  assert.deepEqual(p.hidden, ["rail:chat"]);
  assert.equal(isShown({ hidden: ["rail:allergies"], hover: true }, "rail:allergies"), true);
});

test("hiding and showing again", () => {
  let p = withHidden(DEFAULT_PREFS, ["tab:texts", "tab:media"], true);
  const show = shownIn(p, "tab");
  assert.equal(show("texts"), false);
  assert.equal(show("meds"), true);
  p = withHidden(p, ["tab:texts"], false);
  assert.deepEqual(p.hidden, ["tab:media"]);
});
