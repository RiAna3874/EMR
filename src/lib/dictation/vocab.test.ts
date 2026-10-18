import { test } from "node:test";
import assert from "node:assert/strict";
import { CLINIC_TERMS, cleanTerm, keyTerms, MAX_TERMS, spokenDrug } from "./vocab";

test("patient terms come first, without duplicates, and the list is capped", () => {
  const terms = keyTerms(["Napa", "Tirzepatide", "Type 2 diabetes mellitus without complications"]);
  assert.equal(terms[0], "Napa");
  assert.equal(terms[1], "Tirzepatide");
  assert.equal(terms.filter((t) => t.toLowerCase() === "napa").length, 1);
  assert.equal(terms.filter((t) => t.toLowerCase() === "tirzepatide").length, 1);
  assert.ok(!terms.includes("Type 2 diabetes mellitus without complications"), "over 5 words is dropped");
  assert.equal(terms.length, MAX_TERMS);
});

test("every clinic term is acceptable to the engines", () => {
  for (const t of CLINIC_TERMS) assert.equal(cleanTerm(t), t, t);
});

test("brackets are removed from terms", () => {
  assert.equal(cleanTerm("Vitamin [D3]"), "Vitamin D3");
  assert.equal(cleanTerm("x"), null);
});

test("stored drug names become what's said aloud", () => {
  assert.equal(spokenDrug("Napa 500 mg tablet"), "Napa");
  assert.equal(spokenDrug("Metformin 500 MG Oral Tablet"), "Metformin");
  assert.equal(spokenDrug("Insulin glargine 100 unit/mL injection"), "Insulin glargine");
  assert.equal(spokenDrug("Seclo"), "Seclo");
});
