import { test } from "node:test";
import assert from "node:assert/strict";
import { blocksOf, placeResult, sugarReading } from "./groups";

test("known tests go to their specialty and panel", () => {
  assert.deepEqual(placeResult("718-7", "Hemoglobin"), { group: "hematology", sub: "cbc" });
  assert.deepEqual(placeResult("770-8", "Neutrophils %"), { group: "hematology", sub: "diff" });
  assert.deepEqual(placeResult("2160-0", "Creatinine"), { group: "chemistry", sub: "kidney" });
  assert.deepEqual(placeResult("1742-6", "ALT"), { group: "chemistry", sub: "liver" });
  assert.deepEqual(placeResult("13457-7", "LDL cholesterol"), { group: "cardiology", sub: "lipid" });
  assert.deepEqual(placeResult("30934-4", "BNP"), { group: "cardiology", sub: "cardiac" });
  assert.deepEqual(placeResult("1988-5", "CRP"), { group: "rheumatology", sub: "inflammation" });
  assert.deepEqual(placeResult("4548-4", "Hemoglobin A1c"), { group: "diabetes", sub: "a1c" });
  assert.deepEqual(placeResult("poc-glucose-fasting", "POC glucose, fasting"), { group: "diabetes", sub: "sugar" });
});

test("outside results are placed by name", () => {
  assert.equal(placeResult("local:dengue-ns1-antigen", "Dengue NS1 antigen").group, "infectious");
  assert.equal(placeResult("local:hbsag", "HBsAg").sub, "hepatitis");
  assert.equal(placeResult("local:widal-test", "Widal test (TO)").sub, "typhoid");
  assert.equal(placeResult("local:troponin-i", "Troponin I").sub, "cardiac");
  assert.equal(placeResult("local:ra-factor", "RA factor").sub, "autoimmune");
  assert.equal(placeResult("local:anti-ccp", "Anti-CCP").sub, "autoimmune");
  assert.equal(placeResult("local:s-tsh", "S. TSH (3rd gen)").sub, "thyroid");
  assert.equal(placeResult("local:vitamin-k", "Vitamin K").sub, "vitamins");
  assert.equal(placeResult("local:psa", "PSA").group, "tumor");
  assert.equal(placeResult("local:2-hours-after-breakfast", "Blood sugar 2 hours after breakfast").sub, "sugar");
});

test("urine tests stay urine tests, even when named like blood tests", () => {
  assert.equal(placeResult("local:urine-glucose", "Urine glucose").group, "urine");
  assert.equal(placeResult("local:sugar", "Sugar", "Urine R/E").group, "urine");
  assert.equal(placeResult("local:albumin-creatinine-ratio", "Albumin/creatinine ratio").sub, "albumin");
});

test("the lab's section is the fallback, then Other", () => {
  assert.equal(placeResult("local:xyz", "XYZ index", "Haematology").group, "hematology");
  assert.equal(placeResult("local:xyz", "XYZ index", "Biochemistry").group, "chemistry");
  assert.equal(placeResult("local:xyz", "XYZ index").group, "other");
});

test("every blood sugar becomes mmol/L with its timing", () => {
  assert.deepEqual(sugarReading({ code: "2345-7", display: "Glucose", valueNum: 126, unit: "mg/dL" }), { timing: "random", source: "lab", mmol: 7 });
  assert.deepEqual(sugarReading({ code: "1558-6", display: "Glucose, fasting", valueNum: 99, unit: "mg/dL" }), { timing: "fasting", source: "lab", mmol: 5.5 });
  assert.deepEqual(sugarReading({ code: "local:2habf", display: "2HABF", valueNum: 9.4, unit: "mmol/L" }), { timing: "post_meal", source: "lab", mmol: 9.4 });
  assert.deepEqual(sugarReading({ code: "poc-glucose-random", display: "POC glucose", valueNum: 6.1, unit: "mmol/L", category: "vital_signs" }), {
    timing: "random",
    source: "fingerstick",
    mmol: 6.1,
  });
  assert.equal(sugarReading({ code: "4548-4", display: "Hemoglobin A1c", valueNum: 7.1, unit: "%" }), null);
  assert.equal(sugarReading({ code: "local:urine-glucose", display: "Urine glucose", valueNum: 1, unit: "mg/dL" }), null);
  assert.equal(sugarReading({ code: "8867-4", display: "Heart rate", valueNum: 80, unit: "/min", category: "vital_signs" }), null);
});

test("panels drawn together share a table; blood sugar and panels from other days get their own", () => {
  const d = (...days: number[]) => days.map((n) => n * 86_400_000).sort((a, b) => b - a);
  const keys = (subs: { key: string; times: number[] }[]) => blocksOf(subs).map((b) => b.subs.map((x) => x.key).join("+"));
  assert.deepEqual(keys([{ key: "sugar", times: d(1, 2, 3, 9) }, { key: "a1c", times: d(9) }]), ["sugar", "a1c"]);
  assert.deepEqual(keys([{ key: "cbc", times: d(1, 5, 9) }, { key: "diff", times: d(1, 5) }, { key: "esr", times: d(5) }]), ["cbc+diff+esr"]);
  assert.deepEqual(keys([{ key: "lipid", times: d(1, 5, 9) }, { key: "cardiac", times: d(3) }]), ["lipid", "cardiac"]);
});
