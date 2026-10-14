import { test } from "node:test";
import assert from "node:assert/strict";
import { problemBasedAP, withoutLinkedLines, type APMed, type APOrder } from "./problem-ap";
import { findProblemPlan } from "./smarttext";

const htn = { id: "c1", display: "Essential hypertension", code: "I10" };
const dm = { id: "c2", display: "Type 2 diabetes mellitus", code: "E11.9" };
const med = (drug: string, conditionId: string | null, status = "active"): APMed => ({ drug, dose: "10 mg", route: "oral", frequency: "once daily", status, conditionId });
const order = (display: string, conditionId: string | null, o: Partial<APOrder> = {}): APOrder => ({
  type: "lab",
  display,
  status: "signed",
  priority: "routine",
  conditionId,
  signedAt: new Date(2026, 9, 14),
  completedAt: null,
  ...o,
});

test("puts each problem's meds and orders under it and the rest under Other", () => {
  const out = problemBasedAP(
    [htn, dm],
    [med("Lisinopril", "c1"), med("Amlodipine", "c1", "on_hold"), med("Metformin", "c2"), med("Paracetamol", null)],
    [
      order("Basic metabolic panel", "c1", { priority: "urgent" }),
      order("Hemoglobin A1c", "c2", { status: "pending", signedAt: null }),
      order("Empagliflozin", "c2", { type: "medication", status: "pending", details: { dose: "10 mg", route: "oral", frequency: "once daily" } }),
      order("Chest X-ray", null, { type: "imaging" }),
    ],
  );
  assert.equal(
    out,
    [
      "1. Essential hypertension (I10)",
      "Assessment: ***",
      "Plan: ***",
      "Medications:",
      "- Lisinopril: 10 mg oral, once daily",
      "- Amlodipine: 10 mg oral, once daily (on hold)",
      "Orders:",
      "- Basic metabolic panel (urgent, ordered 14 Oct 2026)",
      "",
      "2. Type 2 diabetes mellitus (E11.9)",
      "Assessment: ***",
      "Plan: ***",
      "Medications:",
      "- Metformin: 10 mg oral, once daily",
      "- Empagliflozin: 10 mg oral, once daily (new, pending signature)",
      "Orders:",
      "- Hemoglobin A1c (pending signature)",
      "",
      "Other (not linked to a problem):",
      "Medications:",
      "- Paracetamol: 10 mg oral, once daily",
      "Orders:",
      "- Chest X-ray (ordered 14 Oct 2026)",
    ].join("\n"),
  );
});

test("a problem with nothing linked is a plain block, and links to inactive problems count as Other", () => {
  assert.equal(problemBasedAP([htn], [], []), "1. Essential hypertension (I10)\nAssessment: ***\nPlan: ***");
  assert.equal(problemBasedAP([htn], [med("Omeprazole", "resolved-problem")], []), "1. Essential hypertension (I10)\nAssessment: ***\nPlan: ***\n\nOther (not linked to a problem):\nMedications:\n- Omeprazole: 10 mg oral, once daily");
  assert.equal(problemBasedAP([], [], []), "1. ***\nPlan: ***");
});

test("carrying a plan forward drops the old medication and order lists", () => {
  const body = problemBasedAP([htn, dm], [med("Lisinopril", "c1")], [order("Lipid panel", "c1")]).replace("Assessment: ***", "Assessment: BP 128/80, at goal.").replace("Plan: ***", "Plan: continue.");
  const plan = findProblemPlan(body, htn)!;
  assert.match(plan, /Lisinopril/);
  assert.equal(withoutLinkedLines(plan), "Essential hypertension (I10)\nAssessment: BP 128/80, at goal.\nPlan: continue.");
  assert.equal(withoutLinkedLines("A\nMedications:\n- x\nThen more"), "A\nThen more");
});
