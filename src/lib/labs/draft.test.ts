import { test } from "node:test";
import assert from "node:assert/strict";
import { findAnalyte } from "./catalog";
import { conversionFor, normalizeUnit } from "./units";
import {
  assessDraft,
  assessRow,
  blankRow,
  checkIdentity,
  computeFlag,
  draftFromExtraction,
  emptyDraft,
  panelFor,
  parseNumber,
  parsePrintedFlag,
  parseRange,
  parseValue,
  type DraftRow,
  type ExtractedReport,
  type PatientFacts,
} from "./draft";

const patient: PatientFacts = { firstName: "Aiyana", lastName: "Brightwater", dob: "1968-03-14", sex: "female", mrn: "100234" };
const row = (p: Partial<DraftRow>): DraftRow => ({ ...blankRow("x"), confidence: "high", ...p });
const ctx = { sex: "female" as const, collectedDate: "2026-10-01", history: {} };

test("numbers: grouping commas, decimal commas, junk", () => {
  assert.equal(parseNumber("13.2"), 13.2);
  assert.equal(parseNumber("7,500"), 7500);
  assert.equal(parseNumber("1,50,000"), 150000);
  assert.equal(parseNumber("4,5"), 4.5);
  assert.equal(parseNumber(".8"), 0.8);
  assert.equal(parseNumber("12.3 H"), null);
});

test("values: numeric, comparator, qualitative", () => {
  assert.deepEqual(parseValue("13.2"), { kind: "number", num: 13.2 });
  assert.deepEqual(parseValue("12.1*"), { kind: "number", num: 12.1 });
  assert.deepEqual(parseValue("<0.5"), { kind: "comparator", text: "<0.5", num: 0.5, op: "<" });
  assert.deepEqual(parseValue("> 90"), { kind: "comparator", text: "> 90", num: 90, op: ">" });
  assert.deepEqual(parseValue("Negative"), { kind: "text", text: "Negative" });
  assert.deepEqual(parseValue("  "), { kind: "empty" });
});

test("ranges: dashes, words, one-sided, trailing units, per-sex lines", () => {
  assert.deepEqual(parseRange("13.5 – 17.5"), { low: 13.5, high: 17.5, text: null });
  assert.deepEqual(parseRange("4.0 to 11.0 K/uL"), { low: 4, high: 11, text: null });
  assert.deepEqual(parseRange("1,50,000 - 4,50,000 /cumm"), { low: 150000, high: 450000, text: null });
  assert.deepEqual(parseRange("<200"), { low: null, high: 200, text: "<200" });
  assert.deepEqual(parseRange("Up to 40 U/L"), { low: null, high: 40, text: "Up to 40" });
  assert.deepEqual(parseRange(">60"), { low: 60, high: null, text: ">60" });
  assert.deepEqual(parseRange("Negative"), { low: null, high: null, text: "Negative" });
  assert.deepEqual(parseRange("M: 13.5-17.5; F: 12.0-15.5", "female"), { low: 12, high: 15.5, text: null });
  assert.deepEqual(parseRange("Male 13.5-17.5 Female 12.0-15.5", "male"), { low: 13.5, high: 17.5, text: null });
});

test("printed flags", () => {
  assert.equal(parsePrintedFlag("H"), "H");
  assert.equal(parsePrintedFlag("HIGH"), "H");
  assert.equal(parsePrintedFlag("↓"), "L");
  assert.equal(parsePrintedFlag("H*"), "HH");
  assert.equal(parsePrintedFlag("CL"), "LL");
  assert.equal(parsePrintedFlag(""), null);
  assert.equal(parsePrintedFlag("see note"), null);
});

test("flags from value and range, with critical limits", () => {
  const k = findAnalyte("Potassium");
  assert.equal(computeFlag(parseValue("5.4"), parseRange("3.5-5.1"), k, "mmol/L"), "H");
  assert.equal(computeFlag(parseValue("6.8"), parseRange("3.5-5.1"), k, "mmol/L"), "HH");
  // Critical limits only apply in the unit they're defined in.
  assert.equal(computeFlag(parseValue("6.8"), parseRange("3.5-5.1"), k, "mg/dL"), "H");
  assert.equal(computeFlag(parseValue("200"), parseRange("<200"), undefined, "mg/dL"), "H");
  assert.equal(computeFlag(parseValue("199"), parseRange("<200"), undefined, "mg/dL"), "N");
  assert.equal(computeFlag(parseValue("40"), parseRange("Up to 40"), undefined, "U/L"), "N");
  assert.equal(computeFlag(parseValue("Positive"), parseRange("Negative"), undefined, ""), "A");
  assert.equal(computeFlag(parseValue("Nil"), parseRange("Negative"), undefined, ""), "N");
  assert.equal(computeFlag(parseValue("12"), parseRange(""), undefined, ""), null);
});

test("catalog matching tolerates lab naming", () => {
  assert.equal(findAnalyte("Haemoglobin")?.loinc, "718-7");
  assert.equal(findAnalyte("SGPT (ALT)")?.loinc, "1742-6");
  assert.equal(findAnalyte("S. Creatinine")?.loinc, "2160-0");
  assert.equal(findAnalyte("Creatinine (Jaffe)")?.loinc, "2160-0");
  assert.equal(findAnalyte("Total WBC Count")?.loinc, "6690-2");
  assert.equal(findAnalyte("HbA1c")?.loinc, "4548-4");
  assert.equal(findAnalyte("Mystery enzyme"), undefined);
});

test("units normalize and convert only when exact", () => {
  assert.equal(normalizeUnit("x10^3/µL"), "10*3/uL");
  assert.equal(normalizeUnit("/cumm"), "/uL");
  assert.equal(normalizeUnit("mg/dl"), "mg/dL");
  assert.equal(normalizeUnit("µIU/mL"), "m[IU]/L");
  const wbc = findAnalyte("WBC")!;
  assert.deepEqual(conversionFor(wbc, "/uL"), { toUnit: "10*3/uL", factor: 0.001 });
  assert.equal(conversionFor(wbc, "10*3/uL"), null);
  const glucose = findAnalyte("Glucose")!;
  assert.deepEqual(conversionFor(glucose, "mmol/L"), { toUnit: "mg/dL", factor: 18.016 });
  assert.equal(conversionFor(glucose, "g/L"), null);
});

test("row assessment: conversion, implausible values, flag disagreement, duplicates", () => {
  const wbc = assessRow(row({ loinc: "6690-2", display: "WBC", value: "7,500", unit: "/cumm", range: "4,000-11,000" }), ctx);
  assert.equal(wbc.valueNum, 7500);
  assert.equal(wbc.flag, "N");
  assert.equal(wbc.conversion?.value, 7.5);

  const rbs = assessRow(row({ loinc: "2345-7", display: "Glucose", value: "9.8", unit: "mmol/L", range: "3.9 - 7.8" }), ctx);
  assert.equal(rbs.flag, "H");
  assert.equal(rbs.conversion?.value, 177);

  const k = assessRow(row({ loinc: "2823-3", display: "Potassium", value: "45", unit: "mmol/L", range: "3.5-5.1" }), ctx);
  assert.ok(k.issues.some((i) => /plausible/.test(i.text)));

  const disagree = assessRow(row({ loinc: "718-7", display: "Hemoglobin", value: "11.2", unit: "g/dL", range: "12.0-15.5", printedFlag: "H" }), ctx);
  assert.equal(disagree.flag, "L");
  assert.ok(disagree.issues.some((i) => i.field === "flag" && i.severity === "warn"));

  const dup = assessRow(row({ loinc: "718-7", display: "Hemoglobin", value: "13.1", unit: "g/dL" }), {
    ...ctx,
    history: { "718-7": [{ date: "2026-10-01", value: "13.1", unit: "g/dL" }] },
  });
  assert.ok(dup.issues.some((i) => /Already on file/.test(i.text)));

  const empty = assessRow(row({ display: "Something" }), ctx);
  assert.ok(empty.issues.some((i) => i.severity === "error"));
  assert.equal(empty.code, "local:something");
});

test("identity check", () => {
  const base = { printedDob: "", printedAge: "", printedSex: "", collectedDate: "2026-10-01" };
  assert.equal(checkIdentity({ ...base, printedName: "Mrs. AIYANA BRIGHTWATER" }, patient).status, "match");
  assert.equal(checkIdentity({ ...base, printedName: "Brightwater, A." }, patient).status, "match");
  assert.equal(checkIdentity({ ...base, printedName: "John Smith" }, patient).status, "mismatch");
  assert.equal(checkIdentity({ ...base, printedName: "Aiyana Brightwater", printedDob: "1968-03-15" }, patient).status, "mismatch");
  assert.equal(checkIdentity({ ...base, printedName: "Aiyana Brightwater", printedAge: "58 Y" }, patient).status, "match");
  assert.equal(checkIdentity({ ...base, printedName: "Aiyana Brightwater", printedAge: "30 Y" }, patient).status, "mismatch");
  assert.equal(checkIdentity({ ...base, printedName: "Aiyana Brightwater", printedSex: "Male" }, patient).status, "mismatch");
  assert.equal(checkIdentity({ ...base, printedName: "" }, patient).status, "unknown");
});

test("draft blockers: date, identity override, at least one valid row", () => {
  const d = { ...emptyDraft(), printedName: "John Smith", rows: [row({ id: "a", loinc: "718-7", display: "Hemoglobin", value: "", unit: "g/dL" })] };
  const a = assessDraft(d, patient, {});
  assert.ok(a.blockers.some((b) => /collection date/.test(b)));
  assert.ok(a.blockers.some((b) => /belongs to this patient/.test(b)));
  assert.ok(a.blockers.some((b) => /needs fixing/.test(b)));

  const fixed = { ...d, collectedDate: "2026-10-01", identityConfirmed: true, rows: [{ ...d.rows[0], value: "13.0" }] };
  assert.deepEqual(assessDraft(fixed, patient, {}).blockers, []);
});

test("draft from extraction: catalog codes, home panels, boxes as fractions", () => {
  const x: ExtractedReport = {
    lab_name: "Popular Diagnostic",
    report_title: "Haematology",
    patient_name: "Aiyana Brightwater",
    patient_dob: null,
    patient_age: "58 Y",
    patient_sex: "F",
    patient_id: null,
    collected_date: "2026-10-01",
    collected_time: "8:05",
    reported_date: "2026-10-01",
    reported_time: null,
    notes: [],
    sections: [
      {
        name: "Haematology",
        results: [
          { name: "Haemoglobin", value: "11.2", unit: "g/dl", reference_range: "12-15.5", flag: "L", loinc: null, file: 1, box: { x0: 100, y0: 400, x1: 900, y1: 430 }, confidence: "high", note: null },
          { name: "Peripheral smear", value: "Normocytic", unit: null, reference_range: null, flag: null, loinc: null, file: 1, box: null, confidence: "medium", note: null },
        ],
      },
    ],
  };
  const d = draftFromExtraction(x, [{ width: 1000, height: 2000 }]);
  assert.equal(d.collectedTime, "08:05");
  assert.equal(d.rows[0].loinc, "718-7");
  assert.equal(d.rows[0].display, "Hemoglobin");
  assert.equal(d.rows[0].unit, "g/dL");
  assert.deepEqual(d.rows[0].box, { x0: 0.1, y0: 0.2, x1: 0.9, y1: 0.215 });
  const a = assessDraft(d, patient, {});
  assert.equal(panelFor(d.rows[0], a.rows.get(d.rows[0].id)!).code, "58410-2");
  assert.deepEqual(panelFor(d.rows[1], a.rows.get(d.rows[1].id)!), { code: "local:haematology", display: "Haematology" });
  assert.equal(a.rows.get(d.rows[0].id)!.flag, "L");
  assert.deepEqual(a.blockers, []);
});
