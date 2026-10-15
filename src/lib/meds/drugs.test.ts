import { test } from "node:test";
import assert from "node:assert/strict";
import { INGREDIENTS, ingredientsOf } from "./drugs";
import { medWarnings, type MedCheckContext } from "./checks";

const ctx = (over: Partial<MedCheckContext> = {}): MedCheckContext => ({ allergies: [], activeMeds: [], egfr: null, ...over });
const kinds = (drug: string, c: MedCheckContext, rx = null as Parameters<typeof medWarnings>[1]) => medWarnings(drug, rx, c).map((w) => `${w.level}:${w.kind}`);

test("each ingredient's own name finds only that ingredient", () => {
  assert.equal(new Set(INGREDIENTS.map((i) => i.id)).size, INGREDIENTS.length);
  // Names that contain another ingredient's name, where both matching is right.
  const together: Record<string, string[]> = { "fluticasone-salmeterol": ["fluticasone", "salmeterol"], "sulfamethoxazole-trimethoprim": ["sulfamethoxazole"] };
  // "calcium" only matches as calcium carbonate or citrate.
  for (const i of INGREDIENTS.filter((x) => x.id !== "calcium")) {
    const found = ingredientsOf(i.name).map((x) => x.id);
    assert.deepEqual(found, together[i.name] ?? [i.id], `${i.name} matched ${found.join(", ")}`);
  }
  // Look-alikes stay apart.
  assert.deepEqual(ingredientsOf("Levocetirizine 5 mg").map((i) => i.id), ["levocetirizine"]);
  assert.deepEqual(ingredientsOf("Escitalopram 10 mg").map((i) => i.id), ["escitalopram"]);
  assert.deepEqual(ingredientsOf("Valaciclovir 500 mg").map((i) => i.id), ["valacyclovir"]);
  assert.deepEqual(ingredientsOf("Desloratadine 5 mg").map((i) => i.id), ["desloratadine"]);
  assert.deepEqual(ingredientsOf("Methylprednisolone 4 mg").map((i) => i.id), ["methylprednisolone"]);
  assert.deepEqual(ingredientsOf("Levofloxacin 500 mg").map((i) => i.id), ["levofloxacin"]);
  assert.deepEqual(ingredientsOf("Ciprofloxacin 500 mg").map((i) => i.id), ["ciprofloxacin"]);
  assert.deepEqual(ingredientsOf("Ofloxacin 200 mg").map((i) => i.id), ["ofloxacin"]);
  // Spironolactone isn't iron.
  assert.deepEqual(ingredientsOf("Spironolactone 25 mg").map((i) => i.id), ["spironolactone"]);
  assert.deepEqual(ingredientsOf("Hydroxychloroquine 200 mg").map((i) => i.id), ["hydroxychloroquine"]);
});

test("common Bangladeshi generics get dose, kidney, age and interaction checks", () => {
  assert.ok(kinds("Diclofenac 50 mg tablet", ctx(), { dose: "100 mg", frequency: "twice daily" }).includes("stop:dose"));
  assert.ok(kinds("Clonazepam 0.5 mg", ctx({ activeMeds: ["Tramadol 50 mg tablet"] })).includes("stop:interaction"));
  assert.ok(kinds("Sildenafil 50 mg", ctx({ activeMeds: ["Isosorbide mononitrate 20 mg"] })).includes("stop:interaction"));
  assert.ok(kinds("Colchicine 0.5 mg", ctx({ activeMeds: ["Clarithromycin 500 mg tablet"] })).includes("stop:interaction"));
  assert.ok(kinds("Levofloxacin 500 mg", ctx({ activeMeds: ["Warfarin 5 mg tablet"] })).includes("caution:interaction"));
  assert.ok(kinds("Dabigatran 110 mg", ctx({ egfr: 25 })).includes("stop:kidney"));
  assert.ok(kinds("Telmisartan 40 mg", ctx({ activeMeds: ["Lisinopril 10 mg tablet"] })).includes("stop:interaction"));
  assert.ok(kinds("Glimepiride 2 mg", ctx({ activeMeds: ["Gliclazide 80 mg tablet"] })).includes("caution:duplicate"));
  assert.ok(kinds("Citalopram 20 mg", ctx({ ageYears: 70 }), { dose: "40 mg", frequency: "once daily" }).includes("stop:dose"));
  assert.ok(kinds("Amitriptyline 10 mg", ctx({ ageYears: 70 })).includes("caution:older adult"));
  assert.ok(kinds("Cefuroxime 500 mg", ctx({ allergies: [{ substance: "Ceftriaxone", severity: "hives" }] })).includes("stop:allergy"));
  assert.ok(kinds("Morphine 10 mg", ctx()).includes("caution:controlled"));
  assert.ok(!kinds("Folic acid 5 mg", ctx()).includes("caution:not checked"));
});
