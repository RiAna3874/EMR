import { test } from "node:test";
import assert from "node:assert/strict";
import { expand, findMarkers, findProblemPlan, nextMarker, resolvePick, signBlocker, unresolvedCount } from "./smarttext";
import { systemPhrases, templates } from "./library";

const ctx = {
  phrases: { rtc: { body: "Return in {Return:1 week|3 months}." }, loop: { body: "again .loop" }, vit: { body: "@VITALS@" } },
  links: { VITALS: "BP 120/80", NAME: "Jane Doe" },
};

test("expands phrases and chart links recursively, leaving unknown names alone", () => {
  assert.equal(expand("Seen today. .vit\n.rtc", ctx), "Seen today. BP 120/80\nReturn in {Return:1 week|3 months}.");
  assert.equal(expand("@NAME@ @UNKNOWN@ .nope", ctx), "Jane Doe @UNKNOWN@ .nope");
  // Mid-word dots ("Dr.", "e.g.") are not phrases.
  assert.equal(expand("Dr.vit e.g.rtc", ctx), "Dr.vit e.g.rtc");
  // A phrase that refers to itself stops after a few rounds.
  assert.ok(expand(".loop", ctx).startsWith("again again"));
});

test("finds blanks and pick lists in order, not blanks inside pick options", () => {
  const text = "A *** B {Edema:none|trace|*** mL} C {ROS::fever|chills} ***";
  const m = findMarkers(text);
  assert.deepEqual(
    m.map((x) => x.kind),
    ["blank", "pick", "pick", "blank"],
  );
  const pick = m[1];
  assert.ok(pick.kind === "pick" && pick.label === "Edema" && !pick.multi && pick.options.length === 3);
  assert.ok(m[2].kind === "pick" && m[2].multi);
  assert.equal(unresolvedCount("no markers {not a list} here"), 0);
});

test("next marker wraps around in both directions", () => {
  const text = "*** middle ***";
  assert.equal(nextMarker(text, 1)!.start, 11);
  assert.equal(nextMarker(text, 12)!.start, 0);
  assert.equal(nextMarker(text, 5, true)!.start, 0);
  assert.equal(nextMarker(text, 0, true)!.start, 11);
  assert.equal(nextMarker("done", 0), null);
});

test("pick lists resolve to readable text", () => {
  const [m] = findMarkers("{ROS::fever|chills|weight loss}");
  assert.ok(m.kind === "pick");
  assert.equal(resolvePick(m, [0]), "fever");
  assert.equal(resolvePick(m, [2, 0]), "fever and weight loss");
  assert.equal(resolvePick(m, [0, 1, 2]), "fever, chills and weight loss");
});

test("signing is blocked until every marker is resolved", () => {
  assert.equal(signBlocker("All done."), null);
  assert.equal(signBlocker("  "), "The note is empty.");
  assert.equal(signBlocker("*** and {A:x|y}"), "Finish 1 blank (***) and 1 pick list before signing.");
});

test("carries forward the plan written for a problem", () => {
  const body = "ASSESSMENT AND PLAN\n1. Type 2 diabetes mellitus (E11.9): A1c 7.4.\n   Increase metformin.\n2. Essential hypertension (I10): stable.\n\nRTC 3 months.";
  assert.equal(findProblemPlan(body, { display: "Type 2 diabetes mellitus", code: "E11.9" }), "Type 2 diabetes mellitus (E11.9): A1c 7.4.\n   Increase metformin.");
  assert.equal(findProblemPlan(body, { display: "Essential hypertension", code: "I10" }), "Essential hypertension (I10): stable.");
  assert.equal(findProblemPlan(body, { display: "Asthma", code: "J45.909" }), null);
});

test("every template and phrase expands with only known names left", () => {
  const phrases = Object.fromEntries(systemPhrases.map((p) => [p.name, p]));
  const links = new Proxy({} as Record<string, string>, { get: (_, k) => (typeof k === "string" ? `[${k}]` : undefined) });
  for (const t of [...templates, ...systemPhrases]) {
    const out = expand(t.body, { phrases, links });
    assert.doesNotMatch(out, /@[A-Z]+@/, t.name);
    assert.doesNotMatch(out, /(^|\s)\.[a-z]+(\s|$)/, t.name);
  }
  assert.equal(new Set(templates.map((t) => t.id)).size, templates.length);
  assert.equal(new Set(systemPhrases.map((p) => p.name)).size, systemPhrases.length);
});
