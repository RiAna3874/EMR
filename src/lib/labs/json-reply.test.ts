import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { parseJsonReply, schemaInstructions } from "./json-reply";

const Schema = z.object({
  title: z.string().nullable(),
  sections: z.array(z.object({ heading: z.string(), text: z.string(), box: z.object({ x0: z.number() }).nullable() })),
  notes: z.array(z.string()),
});

test("reads a JSON answer even with text or a code fence around it", () => {
  const r = parseJsonReply('Here it is:\n```json\n{"title":"MRI","sections":[{"heading":"Findings","text":"Normal.","box":null}],"notes":[]}\n```', Schema);
  assert.ok(r.ok);
  assert.equal(r.ok && r.data.sections[0].text, "Normal.");
});

test("left-out nullable fields become null and left-out lists become empty", () => {
  const r = parseJsonReply('{"sections":[{"heading":"","text":"Letter body"}]}', Schema);
  assert.ok(r.ok, !r.ok ? r.error : "");
  assert.deepEqual(r.ok && r.data, { title: null, sections: [{ heading: "", text: "Letter body", box: null }], notes: [] });
});

test("a wrong answer says what is wrong, so Claude can be asked to fix it", () => {
  const r = parseJsonReply('{"title":"MRI","sections":[{"heading":"Findings"}],"notes":[]}', Schema);
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.error : "", /sections\.0\.text/);
  assert.equal(parseJsonReply("I can't read this page.", Schema).ok, false);
});

test("the saved document transcriptions pass the real document schema", async () => {
  const { DocExtractionSchema } = await import("@/lib/documents/schema");
  for (const name of ["synthetic-echo-report", "synthetic-mri-lumbar-report", "synthetic-discharge-summary"]) {
    const r = parseJsonReply(readFileSync(`samples/${name}.extraction.json`, "utf8"), DocExtractionSchema);
    assert.ok(r.ok, `${name}: ${!r.ok ? r.error : ""}`);
  }
  assert.match(schemaInstructions(DocExtractionSchema), /"measurements"/);
});
