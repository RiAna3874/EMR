// Problem-based assessment and plan with each problem's linked medications and
// orders under it, the way a progress note's A&P reads in Epic. Anything not
// linked to an active problem goes under "Other". Pure: the caller loads the rows.
import { fmtDate } from "@/lib/format";
import { problemBlock } from "./smarttext";

export type APProblem = { id: string; display: string; code: string };
export type APMed = { drug: string; dose: string; route: string; frequency: string; status: string; conditionId: string | null };
export type APOrder = {
  type: string;
  display: string;
  status: string;
  priority: string;
  conditionId: string | null;
  signedAt: Date | null;
  completedAt: Date | null;
  details?: unknown;
};

export const medLine = (m: APMed) => `- ${m.drug}: ${[m.dose, m.route].filter(Boolean).join(" ")}, ${m.frequency}${m.status === "on_hold" ? " (on hold)" : ""}`;

export function orderLine(o: APOrder) {
  if (o.type === "medication") {
    const d = (o.details ?? {}) as { dose?: string; route?: string; frequency?: string };
    const sig = [[d.dose, d.route].filter(Boolean).join(" "), d.frequency].filter(Boolean).join(", ");
    return `- ${o.display}${sig ? `: ${sig}` : ""} (new, pending signature)`;
  }
  const urgency = o.priority === "stat" ? "STAT, " : o.priority === "urgent" ? "urgent, " : "";
  const state =
    o.status === "pending"
      ? "pending signature"
      : o.status === "completed"
        ? `done ${o.completedAt ? fmtDate(o.completedAt) : ""}`.trim()
        : `ordered ${o.signedAt ? fmtDate(o.signedAt) : ""}`.trim();
  return `- ${o.display} (${urgency}${state})`;
}

// The medication and order lines under one problem; empty when nothing is linked.
export function linkedLines(meds: APMed[], orders: APOrder[]) {
  // A prescription not yet signed reads as a medication change.
  const rx = orders.filter((o) => o.type === "medication");
  const other = orders.filter((o) => o.type !== "medication");
  const out: string[] = [];
  if (meds.length || rx.length) out.push("Medications:", ...meds.map(medLine), ...rx.map(orderLine));
  if (other.length) out.push("Orders:", ...other.map(orderLine));
  return out.join("\n");
}

export function problemAP(problem: APProblem, meds: APMed[], orders: APOrder[], n?: number) {
  const linked = linkedLines(
    meds.filter((m) => m.conditionId === problem.id),
    orders.filter((o) => o.conditionId === problem.id),
  );
  return linked ? `${problemBlock(problem, n)}\n${linked}` : problemBlock(problem, n);
}

export function problemBasedAP(problems: APProblem[], meds: APMed[], orders: APOrder[]) {
  const ids = new Set(problems.map((p) => p.id));
  const blocks = problems.length ? problems.map((p, i) => problemAP(p, meds, orders, i + 1)) : ["1. ***\nPlan: ***"];
  const other = linkedLines(
    meds.filter((m) => !m.conditionId || !ids.has(m.conditionId)),
    orders.filter((o) => !o.conditionId || !ids.has(o.conditionId)),
  );
  if (other) blocks.push(`Other (not linked to a problem):\n${other}`);
  return blocks.join("\n\n");
}

// An earlier note's plan without the medication and order lists it pulled in,
// so carrying it forward doesn't bring back lists that may be out of date.
export function withoutLinkedLines(plan: string) {
  const out: string[] = [];
  let inList = false;
  for (const line of plan.split("\n")) {
    if (/^\s*(Medications|Orders):\s*$/.test(line)) inList = true;
    else if (inList && /^\s*- /.test(line)) continue;
    else {
      inList = false;
      out.push(line);
    }
  }
  return out.join("\n").trimEnd();
}
