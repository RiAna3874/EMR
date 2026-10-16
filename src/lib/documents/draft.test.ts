import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { PatientFacts } from "@/lib/labs/draft";
import {
  assessDocDraft,
  docContent,
  DocDraftSchema,
  docDraftFromExtraction,
  emptyDocDraft,
  matchMed,
  matchProblem,
  orderChoices,
  readContent,
  suggestOrder,
  type ChartFacts,
  type DocDraft,
  type ExtractedDocument,
} from "./draft";

const sample = (name: string) => JSON.parse(readFileSync(`samples/${name}.extraction.json`, "utf8")) as ExtractedDocument;
const marcus: PatientFacts = { firstName: "Marcus", lastName: "Okonkwo-Hale", dob: "1959-03-21", sex: "male", mrn: "M1011748" };
const chart: ChartFacts = {
  problems: [
    { code: "I48.91", display: "Unspecified atrial fibrillation" },
    { code: "N18.30", display: "Chronic kidney disease, stage 3 unspecified" },
    { code: "I50.9", display: "Heart failure, unspecified" },
  ],
  meds: [{ drug: "Apixaban 5 mg tablet" }, { drug: "Metoprolol succinate ER 50 mg tablet" }, { drug: "Furosemide 40 mg tablet" }],
  orders: [
    { id: "echo", type: "imaging", code: "CPT:93306", display: "Echocardiogram, transthoracic complete", signedAt: "2026-10-11T09:00:00Z" },
    { id: "dexa", type: "imaging", code: "CPT:77080", display: "DEXA bone density, axial", signedAt: "2026-09-13T09:00:00Z" },
    { id: "eye", type: "referral", code: "REF:ophthalmology", display: "Referral to Ophthalmology (diabetic eye exam)", signedAt: "2026-10-10T09:00:00Z" },
  ],
};
const discharge = () => docDraftFromExtraction(sample("synthetic-discharge-summary"), [{ width: 1100, height: 913 }, { width: 1100, height: 724 }]);
const TODAY = "2026-10-13";

test("draft from a two-page discharge summary keeps pages, dates and boxes", () => {
  const d = discharge();
  assert.equal(d.type, "discharge_summary");
  assert.equal(d.admitDate, "2026-10-05");
  assert.equal(d.serviceDate, "2026-10-09");
  assert.equal(d.diagnoses.length, 4);
  assert.equal(d.diagnoses[0].kind, "principal");
  assert.ok(d.diagnoses.every((x) => !x.addToProblems), "nothing is added to the problem list unless the reviewer ticks it");
  const torsemide = d.meds.find((m) => m.drug.startsWith("Torsemide"))!;
  assert.equal(torsemide.file, 1, "file numbers become 0-based page indexes");
  assert.ok(torsemide.box && torsemide.box.x1 <= 1 && torsemide.box.y0 > 0, "pixel boxes become fractions of the page");
});

test("a clean draft has no blockers", () => {
  assert.deepEqual(assessDocDraft(discharge(), marcus, chart, TODAY).blockers, []);
});

test("identity: a different patient's document must be confirmed", () => {
  const d = discharge();
  const a = assessDocDraft(d, { ...marcus, dob: "1960-01-01" }, chart, TODAY);
  assert.equal(a.identity.status, "mismatch");
  assert.ok(a.blockers.includes("Confirm this document belongs to this patient."));
  assert.deepEqual(assessDocDraft({ ...d, identityConfirmed: true }, { ...marcus, dob: "1960-01-01" }, chart, TODAY).blockers, []);
});

test("problem matching: same code, same category, or new", () => {
  assert.equal(matchProblem({ text: "Atrial fibrillation, rate controlled", icd10: "I48.91" }, chart.problems)?.kind, "same");
  const hf = matchProblem({ text: "Acute on chronic systolic heart failure", icd10: "I50.23" }, chart.problems);
  assert.equal(hf?.kind, "related");
  assert.equal(hf?.code, "I50.9");
  assert.equal(matchProblem({ text: "Hypokalemia", icd10: "E87.6" }, chart.problems), null);
  assert.equal(matchProblem({ text: "heart failure, unspecified", icd10: "" }, chart.problems)?.kind, "same");
});

test("medication reconciliation flags stopped-but-active and new-not-listed", () => {
  const d = discharge();
  const a = assessDocDraft(d, marcus, chart, TODAY);
  const by = (drug: string) => d.meds.find((m) => m.drug.startsWith(drug))!.id;
  assert.equal(a.meds.get(by("Apixaban")), "Apixaban 5 mg tablet");
  assert.match(a.medNotes.get(by("Furosemide"))!, /Stopped in this document but still active/);
  assert.match(a.medNotes.get(by("Torsemide"))!, /not on the medication list/);
  assert.equal(matchMed({ drug: "metoprolol succinate 25 mg", text: "" }, chart.meds), "Metoprolol succinate ER 50 mg tablet");
});

test("adding to the lists is checked", () => {
  const d = discharge();
  const tick = (patch: (x: DocDraft) => void) => {
    const copy = structuredClone(d);
    patch(copy);
    return assessDocDraft(copy, marcus, chart, TODAY).blockers;
  };
  assert.deepEqual(
    tick((x) => x.diagnoses.forEach((y) => (y.addToProblems = y.icd10 === "E87.6"))),
    [],
  );
  assert.match(tick((x) => (x.diagnoses.find((y) => y.icd10 === "I48.91")!.addToProblems = true)).join(), /already on the problem list/);
  assert.match(tick((x) => Object.assign(x.diagnoses[3], { addToProblems: true, icd10: "HYPO" })).join(), /isn't an ICD-10 code/);
  assert.match(tick((x) => (x.meds.find((m) => m.change === "stopped")!.addToList = true)).join(), /was stopped/);
  assert.match(tick((x) => (x.meds.find((m) => m.drug.startsWith("Apixaban"))!.addToList = true)).join(), /already on the medication list/);
  assert.deepEqual(
    tick((x) => (x.meds.find((m) => m.drug.startsWith("Torsemide"))!.addToList = true)),
    [],
  );
});

test("required fields and dates", () => {
  const blank = emptyDocDraft();
  const b = assessDocDraft(blank, marcus, chart, TODAY).blockers;
  assert.ok(b.includes("Enter the document title."));
  assert.ok(b.includes("Enter the document date."));
  assert.ok(b.includes("The document has no text to file."));
  const future = assessDocDraft({ ...discharge(), serviceDate: "2026-12-01" }, marcus, chart, TODAY).blockers;
  assert.ok(future.includes("Document date is in the future."));
  const backwards = assessDocDraft({ ...discharge(), admitDate: "2026-10-10" }, marcus, chart, TODAY).blockers;
  assert.ok(backwards.includes("Admission date is after the discharge date."));
});

test("order linking: only orders of the right type, matched by words, never by type alone", () => {
  const dxa = docDraftFromExtraction(sample("synthetic-dxa-report"), [{ width: 1100, height: 945 }]);
  assert.deepEqual(
    orderChoices("imaging_report", chart.orders).map((o) => o.id),
    ["echo", "dexa"],
  );
  assert.equal(suggestOrder(dxa, chart.orders), "dexa");
  const eye = docDraftFromExtraction(sample("synthetic-eye-consult-letter"), [{ width: 1100, height: 840 }]);
  assert.equal(eye.type, "consult_note");
  assert.equal(suggestOrder(eye, chart.orders), "eye");
  assert.equal(suggestOrder(discharge(), chart.orders), null, "discharge summaries don't answer orders");
  const ct = docDraftFromExtraction(sample("synthetic-ct-chest-report"), [{ width: 1100, height: 978 }]);
  assert.equal(suggestOrder(ct, chart.orders), null, "a CT doesn't answer an echo or DEXA order");
  const stale = assessDocDraft({ ...dxa, orderId: "gone" }, { ...marcus, firstName: "Rosalind", lastName: "Ferreira", dob: "1950-05-08", sex: "female" }, chart, TODAY);
  assert.ok(stale.blockers.some((b) => /linked order is no longer open/.test(b)));
});

test("a lab report sent as a document is flagged for re-reading", () => {
  const x = { ...sample("synthetic-ct-chest-report"), document_type: "lab_report" as const };
  const d = docDraftFromExtraction(x, [{ width: 1100, height: 978 }]);
  assert.equal(d.type, "other");
  assert.equal(d.detectedType, "lab_report");
});

test("stored content round-trips and drops empty rows", () => {
  const d = discharge();
  d.followUps.push({ id: "f9", text: "  ", due: "", file: 0, box: null });
  const c = readContent(JSON.parse(JSON.stringify(docContent(d))));
  assert.equal(c.followUps.length, 4);
  assert.equal(c.meds.length, 6);
  assert.equal(readContent({}).sections.length, 0);
});

test("a written echo report keeps its measurements, findings and conclusion", () => {
  const d = docDraftFromExtraction(sample("synthetic-echo-report"), [{ width: 1240, height: 1754 }]);
  assert.equal(d.type, "imaging_report");
  assert.equal(d.measurements.length, 10);
  const ef = d.measurements.find((m) => m.name.startsWith("LVEF"))!;
  assert.deepEqual([ef.value, ef.unit, ef.range, ef.group], ["58", "%", "52-72", "M-mode / 2D measurements"]);
  assert.equal(d.measurements.find((m) => m.name === "Mitral E/A")!.unit, "", "a missing unit is blank, not null");
  assert.ok(d.sections.find((s) => s.heading === "Findings")!.text.split("\n").length >= 10, "every finding line is kept");
  const filed = docContent(d);
  assert.equal(filed.measurements.length, 10);
});

test("drafts and filed documents from before measurements read back with none", () => {
  const old = { ...discharge() } as Partial<DocDraft>;
  delete old.measurements;
  assert.deepEqual(DocDraftSchema.parse(old).measurements, []);
  assert.deepEqual(readContent({ sections: [] }).measurements, []);
});
