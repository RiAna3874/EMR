import { test } from "node:test";
import assert from "node:assert/strict";
import { rankRegistered, registeredCode, registeredDisplay, registeredFromCode, registryRow, type OclConcept } from "./dgda";
import { downloadRegistry, saveRegistry } from "./dgda-server";
import { productFor } from "./formulary";
import { medWarnings } from "./checks";
import { orderableFor } from "@/lib/orders/catalog";
import { suggestQuantity } from "./sig";

// Shaped like the DGHS terminology server's answer (verbose=true, includeMappings=true).
const concept = (id: string, trade: string, form: string, generic: string, company = "Beximco Pharmaceuticals Ltd.", ingredient?: string): OclConcept => ({
  id,
  display_name: trade,
  concept_class: "Drug",
  retired: false,
  extras: { company, dar_number: id.split("--")[0], trade_name: trade, dosage_form: form, generic_content_raw: generic },
  mappings: ingredient ? [{ map_type: "Has-active-ingredient", to_concept_name: ingredient }] : [],
});

const tricalm = concept("005-1076-025--tricalm-5", "Tricalm 5", "Tablet", "Trihexyphenidyl Hydrochloride 5 mg", "Advanced Chemical Industries PLC.", "Trihexyphenidyl");
const napa = concept("006-0001-001--napa", "Napa", "Tablet", "Paracetamol 500 mg", undefined, "Paracetamol");
const axet = concept("030-0217-023--axet", "Axet", "IV/IM Injection", "Cefuroxime 250 mg/vial", "Orion Pharma Ltd.");

test("a registry concept becomes a searchable row", () => {
  const r = registryRow(tricalm)!;
  assert.equal(r.darNumber, "005-1076-025");
  assert.equal(r.company, "Advanced Chemical Industries PLC.");
  assert.equal(r.ingredients, "Trihexyphenidyl");
  assert.ok(r.search.includes("tricalm 5") && r.search.includes("advanced chemical"));
  assert.equal(registeredDisplay(r), "Tricalm 5 (Trihexyphenidyl Hydrochloride 5 mg) tablet");
  // Retired concepts, ingredients and rows without a generic are skipped.
  assert.equal(registryRow({ ...tricalm, retired: true }), null);
  assert.equal(registryRow({ ...tricalm, concept_class: "Ingredient" }), null);
  assert.equal(registryRow({ ...tricalm, extras: { ...tricalm.extras, generic_content_raw: " " } }), null);
});

test("a registered brand's code reads back as a product with its strength and form", () => {
  const code = registeredCode(registryRow(napa)!);
  assert.equal(code, "RX:DGDA:006-0001-001:Napa (Paracetamol 500 mg) tablet");
  const p = productFor({ code })!;
  assert.equal(p.display, "Napa (Paracetamol 500 mg) tablet");
  assert.equal(p.dar, "006-0001-001");
  assert.equal(p.unit, "tablets");
  assert.equal(p.unitMg, 500);
  assert.equal(p.dose, "500 mg");
  assert.equal(p.frequency, "");
  // Stored on a medication as rxnorm without the "RX:", it still reads back.
  assert.equal(productFor({ rxnorm: p.rxnorm, drug: p.display })?.dar, "006-0001-001");
  assert.equal(suggestQuantity(p, { dose: "1000 mg", frequency: "three times daily" }, 5), "30 tablets");
  assert.equal(orderableFor(code)?.display, p.display);
  assert.equal(registeredFromCode("RX:DGDA::Napa"), undefined);
});

test("injections, liquids and combinations have no tablet strength", () => {
  const inj = registeredFromCode(registeredCode(registryRow(axet)!))!;
  assert.equal(inj.countable, false);
  assert.equal(inj.route, "intravenous or intramuscular");
  assert.equal(inj.unitMg, undefined);
  assert.equal(inj.dose, "");
  const combo = registeredFromCode("RX:DGDA:1:Napa Extra (Paracetamol 500 mg + Caffeine 65 mg) tablet")!;
  assert.equal(combo.unitMg, undefined);
  assert.equal(registeredFromCode("RX:DGDA:1:Eye drop (Moxifloxacin 0.5%) eye drops")!.route, "ophthalmic");
  assert.equal(registeredFromCode("RX:DGDA:1:Levo (Levothyroxine 50 mcg) tablet")!.unitMg, 0.05);
});

test("registered brands are checked as their generic", () => {
  const p = productFor({ code: registeredCode(registryRow(napa)!) })!;
  const w = medWarnings(p.display, { dose: "2000 mg", frequency: "every 6 hours" }, { allergies: [], activeMeds: [], egfr: null });
  assert.ok(w.some((x) => x.level === "stop" && x.kind === "dose"));
  const cef3 = registeredDisplay(registryRow(concept("1--cef-3", "Cef-3", "Capsule", "Cefixime Trihydrate 200 mg", "Square Pharmaceuticals PLC.", "Cefixime"))!);
  const w2 = medWarnings(cef3, null, { allergies: [{ substance: "Ceftriaxone", severity: "moderate" }], activeMeds: [], egfr: null });
  assert.ok(w2.some((x) => x.level === "stop" && x.kind === "allergy"));
  // A generic the clinic's check list doesn't know yet says so.
  const axetW = medWarnings(registeredDisplay(registryRow(axet)!), null, { allergies: [], activeMeds: [], egfr: null });
  assert.deepEqual(axetW.map((x) => x.kind), ["not checked"]);
});

test("search puts brands starting with the typed word first", () => {
  const rows = [axet, tricalm, napa, concept("1--anapa", "Anapa", "Tablet", "Paracetamol 500 mg"), concept("2--napa-extend", "Napa Extend", "Tablet", "Paracetamol 665 mg")].map((c) => registryRow(c)!);
  assert.deepEqual(rankRegistered(rows, "napa").map((r) => r.tradeName), ["Napa", "Napa Extend", "Anapa"]);
  assert.deepEqual(rankRegistered(rows, "paracetamol 665").map((r) => r.tradeName), ["Napa Extend"]);
  assert.deepEqual(rankRegistered(rows, "orion").map((r) => r.tradeName), ["Axet"]);
});

test("the download pages through the registry until a short page", async () => {
  const calls: string[] = [];
  const fakeFetch = (async (url: URL) => {
    calls.push(url.searchParams.get("page")!);
    const page = Number(url.searchParams.get("page"));
    const size = Number(url.searchParams.get("limit"));
    const n = page === 1 ? size : 3;
    const body = Array.from({ length: n }, (_, i) => concept(`${page}-${i}--x${i}`, `X${page}-${i}`, "Tablet", "Paracetamol 500 mg"));
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
  const rows = await downloadRegistry(undefined, fakeFetch);
  assert.deepEqual(calls, ["1", "2"]);
  assert.equal(rows.length, 503);
});

test("a nearly empty answer never replaces the list", async () => {
  await assert.rejects(saveRegistry({} as never, [registryRow(napa)!]), /only 1 products/);
});
