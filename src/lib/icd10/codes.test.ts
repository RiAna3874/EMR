import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkIcd10, searchIcd10 } from "./codes";
import { normalizeIcd10 } from "./format";
import { DIAGNOSES } from "@/lib/visits/diagnoses";

test("every code on the common list is complete and named by its official description", () => {
  for (const d of DIAGNOSES) {
    const c = checkIcd10(d.code);
    assert.equal(c.status, "ok", `${d.code} ${d.value}`);
    assert.equal(c.status === "ok" && c.title, d.value, d.code);
  }
});

test("codes in the demo chart and sample documents are complete ICD-10-CM codes", () => {
  const seed = readFileSync("prisma/seed.ts", "utf8");
  for (const [, code, display] of seed.matchAll(/code: "([A-Z][0-9][0-9A-Z.]+)", display: "([^"]+)"/g)) {
    const c = checkIcd10(code);
    assert.equal(c.status, "ok", code);
    assert.equal(c.status === "ok" && c.title, display, code);
  }
  for (const name of ["ct-chest-report", "discharge-summary", "dxa-report", "echo-report", "eye-consult-letter", "mri-lumbar-report", "ruq-ultrasound"]) {
    const doc = JSON.parse(readFileSync(`samples/synthetic-${name}.extraction.json`, "utf8")) as { diagnoses: { icd10: string | null }[] };
    for (const d of doc.diagnoses) if (d.icd10) assert.equal(checkIcd10(d.icd10).status, "ok", `${name} ${d.icd10}`);
  }
});

test("codes are tidied, checked and explained", () => {
  assert.equal(normalizeIcd10(" e119 "), "E11.9");
  assert.equal(normalizeIcd10("s93.409a"), "S93.409A");
  assert.deepEqual(checkIcd10("i10"), { status: "ok", code: "I10", title: "Essential (primary) hypertension" });
  assert.equal(checkIcd10("U07.1").status, "ok");
  // Categories with codes under them: CKD stage 3, a WHO-style asthma code, injury without its 7th character.
  const ckd = checkIcd10("N18.3");
  assert.equal(ckd.status, "partial");
  assert.deepEqual(ckd.status === "partial" && ckd.options.map((o) => o.code), ["N18.30", "N18.31", "N18.32"]);
  assert.equal(checkIcd10("J45.9").status, "partial");
  const injury = checkIcd10("T14.90");
  assert.deepEqual(injury.status === "partial" && injury.options[0], { code: "T14.90XA", title: "Injury, unspecified, initial encounter" });
  const typo = checkIcd10("E11.99");
  assert.equal(typo.status, "unknown");
  assert.ok(typo.options.some((o) => o.code === "E11.9"));
  assert.deepEqual(checkIcd10("HYPO"), { status: "unknown", code: "HYPO", options: [], more: 0 });
});

test("search finds complete codes by code or by words, common ones first", () => {
  assert.deepEqual(searchIcd10("E11.3", 3).map((h) => h.code), ["E11.311", "E11.319", "E11.3211"]);
  assert.equal(searchIcd10("i10")[0].code, "I10");
  assert.equal(searchIcd10("dengue")[0].code, "A90");
  assert.equal(searchIcd10("sugar")[0].code, "E11.9");
  assert.equal(searchIcd10("moderate nonproliferative retinopathy type 2 without macular bilateral")[0].code, "E11.3393");
  assert.ok(searchIcd10("chronic kidney disease stage 3a").some((h) => h.code === "N18.31"));
  assert.ok(searchIcd10("pneumonia").every((h) => checkIcd10(h.code).status === "ok"));
});
