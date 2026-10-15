import { test } from "node:test";
import assert from "node:assert/strict";
import { genericNamesFor, labelSearch, pickLabel, toDrugLabel, parseLabels } from "./drug-label";
import { drugInfo, fetchLabel } from "./drug-label-server";

test("medication names become the generic names on US labels", () => {
  assert.deepEqual(genericNamesFor("Napa (Paracetamol 500 mg) tablet"), ["acetaminophen"]);
  assert.deepEqual(genericNamesFor("Napa"), ["acetaminophen"]);
  assert.deepEqual(genericNamesFor("Amoxicillin-clavulanate 875-125 mg tablet"), ["amoxicillin", "clavulanate"]);
  assert.deepEqual(genericNamesFor("Amlodipine 5 mg tablet"), ["amlodipine"]);
  assert.deepEqual(genericNamesFor("Salbutamol"), ["albuterol"]);
  assert.deepEqual(genericNamesFor("Glibenclamide 5 mg"), ["glyburide"]);
  assert.deepEqual(genericNamesFor("Co-trimoxazole DS tablet"), ["sulfamethoxazole", "trimethoprim"]);
  assert.deepEqual(genericNamesFor("Domperidone"), ["domperidone"]);
  assert.deepEqual(genericNamesFor("Losartan + Hydrochlorothiazide 50/12.5 mg"), ["losartan", "hydrochlorothiazide"]);
  assert.deepEqual(genericNamesFor("Tericin (Amphotericin B 50 mg) injection"), ["amphotericin b"]);
  assert.deepEqual(genericNamesFor("500 mg"), []);
  assert.equal(labelSearch(["amoxicillin", "clavulanate"]), 'openfda.generic_name:"amoxicillin" AND openfda.generic_name:"clavulanate"');
});

// Shaped like openFDA's /drug/label.json answer.
const label = (o: Record<string, unknown>) => ({
  set_id: "set-1",
  effective_time: "20240115",
  openfda: { generic_name: ["AMLODIPINE BESYLATE"], brand_name: ["NORVASC"], product_type: ["HUMAN PRESCRIPTION DRUG"], manufacturer_name: ["Pfizer"] },
  indications_and_usage: ["1 INDICATIONS AND USAGE Amlodipine is a calcium channel blocker for hypertension."],
  dosage_and_administration: [
    "2 DOSAGE AND ADMINISTRATION Adult starting dose: 5 mg once daily, maximum 10 mg once daily. No dose adjustment is needed in patients with renal impairment.",
  ],
  contraindications: ["4 CONTRAINDICATIONS Known sensitivity to amlodipine."],
  ...o,
});

test("the best label is a single-ingredient prescription label, newest first", () => {
  const combo = label({ set_id: "combo", openfda: { generic_name: ["AMLODIPINE AND BENAZEPRIL"], product_type: ["HUMAN PRESCRIPTION DRUG"] } });
  const old = label({ set_id: "old", effective_time: "20190101" });
  const otc = label({ set_id: "otc", effective_time: "20250101", openfda: { generic_name: ["AMLODIPINE"], product_type: ["HUMAN OTC DRUG"] } });
  const best = label({});
  assert.equal(pickLabel([combo, old, otc, best], ["amlodipine"])?.set_id, "set-1");
  assert.equal(pickLabel([combo], ["amlodipine", "benazepril"])?.set_id, "combo");

  const l = toDrugLabel(best);
  assert.equal(l.generic, "Amlodipine Besylate");
  assert.equal(l.title, "Norvasc");
  assert.equal(l.updated, "2024-01-15");
  assert.ok(l.prescription);
  assert.deepEqual(l.sections.map((s) => s.label), ["Indications", "Dose", "Contraindications"]);
  // The section's own heading is dropped.
  assert.match(l.sections[0].text, /^Amlodipine is/);
  assert.deepEqual(l.kidney, ["No dose adjustment is needed in patients with renal impairment."]);
  assert.throws(() => parseLabels({ error: {} }), /openFDA/);
});

type Row = { key: string; found: boolean; label: unknown; fetchedAt: Date };
function fakeDb(generic?: { name: string; otherNames: string }) {
  const rows = new Map<string, Row>();
  return {
    rows,
    db: {
      drugLabelCache: {
        findUnique: async ({ where }: { where: { key: string } }) => rows.get(where.key) ?? null,
        upsert: async ({ where, create }: { where: { key: string }; create: Row }) => void rows.set(where.key, { ...create, label: create.label ?? null }),
      },
      genericDrug: { findFirst: async () => generic ?? null },
    } as never,
  };
}

test("a lookup asks openFDA once, then answers from the cache", async () => {
  const asked: string[] = [];
  const fakeFetch = (async (url: string) => {
    const search = new URL(url).searchParams.get("search")!;
    asked.push(search);
    if (search.includes("acetaminophen")) return new Response(JSON.stringify({ results: [label({ openfda: { generic_name: ["ACETAMINOPHEN"], product_type: ["HUMAN OTC DRUG"] } })] }));
    return new Response(JSON.stringify({ error: { code: "NOT_FOUND" } }), { status: 404 });
  }) as unknown as typeof fetch;
  const { db, rows } = fakeDb();
  const first = await drugInfo(db, "Napa (Paracetamol 500 mg) tablet", fakeFetch);
  assert.equal(first.label?.generic, "Acetaminophen");
  const again = await drugInfo(db, "Ace 500 mg tablet", fakeFetch);
  assert.equal(again.label?.generic, "Acetaminophen");
  assert.equal(asked.length, 1);
  // Not found is remembered too.
  assert.equal((await drugInfo(db, "Domperidone 10 mg", fakeFetch)).label, null);
  assert.equal(rows.get("domperidone")?.found, false);
  assert.equal(asked.length, 2);
});

test("a generic the US calls something else is tried by its other names", async () => {
  const asked: string[] = [];
  const fakeFetch = (async (url: string) => {
    const search = new URL(url).searchParams.get("search")!;
    asked.push(search);
    if (search.includes("phytonadione")) return new Response(JSON.stringify({ results: [label({ openfda: { generic_name: ["PHYTONADIONE"], product_type: ["HUMAN PRESCRIPTION DRUG"] } })] }));
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  const { db } = fakeDb({ name: "Phytomenadione", otherNames: "phytonadione; vitamin K1" });
  const info = await drugInfo(db, "Phytomenadione 10 mg injection", fakeFetch);
  assert.equal(info.label?.generic, "Phytonadione");
  assert.equal(asked.length, 2);
});

test("openFDA down: an error to show, not 'no label'", async () => {
  const down = (async () => new Response("busy", { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(fetchLabel(["amlodipine"], down), /503/);
  const { db } = fakeDb();
  const info = await drugInfo(db, "Amlodipine", down);
  assert.equal(info.label, null);
  assert.match(info.error!, /503/);
});
