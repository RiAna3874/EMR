import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMediaDetails, suggestedTitle, takesBodySite } from "./categories";

const ok = { title: "Clinical photo, right hand", category: "clinical_photo", bodySite: "Right hand", description: "", takenOn: "2026-10-14" };

test("a named, dated clinical photo can be saved", () => {
  assert.deepEqual(checkMediaDetails(ok, "2026-10-14"), []);
});

test("media needs a name, a known kind and a date that isn't in the future", () => {
  assert.deepEqual(checkMediaDetails({ ...ok, title: "  " }, "2026-10-14"), ["Give it a name."]);
  assert.deepEqual(checkMediaDetails({ ...ok, category: "selfie" }, "2026-10-14"), ["Choose what it is."]);
  assert.deepEqual(checkMediaDetails({ ...ok, takenOn: "2026-10-15" }, "2026-10-14"), ["The date taken is in the future."]);
  assert.deepEqual(checkMediaDetails({ ...ok, takenOn: "" }, "2026-10-14"), ["Enter the date it was taken."]);
});

test("suggested names read naturally and only body photos take a site", () => {
  assert.equal(suggestedTitle("wound", "Left foot"), "Wound or ulcer, left foot");
  assert.equal(suggestedTitle("consent"), "Consent form");
  assert.equal(takesBodySite("skin"), true);
  assert.equal(takesBodySite("id_card"), false);
});
