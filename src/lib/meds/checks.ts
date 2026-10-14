// Prescribing checks. Pure, so the composer warns while the prescription is
// being written, the pending list and the Inbox show the same warnings, and
// signing re-runs them on the server.
import { classesForAllergy, classesOf, DUPLICATE_CLASSES, ingredientsOf, interactionsBetween } from "./drugs";
import { productFor } from "./formulary";
import { doseMg, timesPerDay } from "./sig";

export type MedWarning = { level: "stop" | "caution"; text: string; kind?: "allergy" | "interaction" | "duplicate" | "dose" | "kidney" | "older adult" | "controlled" | "not checked" };

export type MedCheckContext = {
  allergies: { substance: string; severity: string }[];
  // Names of the patient's current medications, without the one being replaced.
  activeMeds: string[];
  egfr: number | null;
  ageYears?: number | null;
};

export type RxInput = { dose?: string; frequency?: string; refills?: number };

export const isControlled = (drug: string) => ingredientsOf(drug).some((i) => i.controlled);

// Controlled drugs get no refills: each supply needs a new prescription.
export function maxRefills(drug: string) {
  return isControlled(drug) ? 0 : 11;
}

const firstWord = (drug: string) => drug.split(/[\s-]/)[0].toLowerCase();

export function medWarnings(drug: string, rx: RxInput | null, ctx: MedCheckContext): MedWarning[] {
  const out: MedWarning[] = [];
  const ingredients = ingredientsOf(drug);
  const classes = classesOf(drug);
  if (!ingredients.length) {
    out.push({ kind: "not checked", level: "caution", text: `${drug} isn't in the clinic's drug list, so allergies, interactions and dose weren't checked. Check them yourself.` });
  }

  for (const a of ctx.allergies) {
    const allergic = classesForAllergy(a.substance);
    const byName = ingredients.find((i) => a.substance.toLowerCase().includes(i.name.split(/[\s-]/)[0]));
    const hit = classes.find((c) => allergic.includes(c));
    if (hit || byName) {
      out.push({ kind: "allergy", level: "stop", text: `Allergy: ${a.substance} (${a.severity}). ${drug} is ${hit ? `in the ${hit} class` : `${byName!.name}`}.` });
    } else if (allergic.includes("penicillin") && classes.includes("cephalosporin")) {
      out.push({ kind: "allergy", level: "caution", text: `Allergy: ${a.substance}. Low cross-reactivity risk with cephalosporins.` });
    }
  }

  for (const other of ctx.activeMeds) {
    const same = firstWord(other) === firstWord(drug) || ingredients.some((i) => i.match.test(other));
    if (same) {
      out.push({ kind: "duplicate", level: "caution", text: `Patient already takes ${other}.` });
      continue;
    }
    const otherClasses = classesOf(other);
    const dup = classes.find((c) => DUPLICATE_CLASSES[c] && otherClasses.includes(c));
    if (dup) out.push({ kind: "duplicate", level: "caution", text: `Duplicate therapy: ${other} is also one of the ${DUPLICATE_CLASSES[dup]}.` });
    for (const ix of interactionsBetween(drug, other)) {
      out.push({ kind: "interaction", level: ix.level, text: `Interaction with ${other}: ${ix.text}` });
    }
  }

  // Dose range, for products whose dose and frequency can be read.
  if (rx?.dose && rx.frequency) {
    const mg = doseMg(rx.dose, productFor({ drug }));
    const perDay = timesPerDay(rx.frequency);
    const older = (ctx.ageYears ?? 0) >= 65;
    for (const i of ingredients) {
      const max = older && i.maxDailyMgOlder ? i.maxDailyMgOlder : i.maxDailyMg;
      if (mg !== null && perDay !== null && max && ingredients.length === 1) {
        const daily = Math.round(mg * perDay * 100) / 100;
        if (daily > max) out.push({ kind: "dose", level: "stop", text: `Dose: up to ${daily} mg a day exceeds the ${max} mg daily maximum${older && i.maxDailyMgOlder ? " for patients 65 and over" : ""}.` });
      }
    }
  }

  if (ctx.egfr !== null) {
    for (const i of ingredients) {
      const r = i.renal;
      if (!r) continue;
      if (r.stopBelow !== undefined && ctx.egfr < r.stopBelow) out.push({ kind: "kidney", level: "stop", text: `${r.stop} with eGFR ${ctx.egfr}.` });
      else if (r.cautionBelow !== undefined && ctx.egfr < r.cautionBelow) out.push({ kind: "kidney", level: "caution", text: `eGFR ${ctx.egfr}: ${r.caution}` });
    }
  }

  if ((ctx.ageYears ?? 0) >= 65) {
    for (const i of ingredients) if (i.olderAdult) out.push({ kind: "older adult", level: "caution", text: `Age ${ctx.ageYears}: ${i.olderAdult}` });
  }

  if (isControlled(drug)) {
    if (rx?.refills !== undefined && rx.refills > maxRefills(drug)) {
      out.push({ kind: "controlled", level: "stop", text: "Controlled drugs can't have refills. Write a new prescription for each supply." });
    } else {
      out.push({ kind: "controlled", level: "caution", text: "Controlled drug. Prescribe the smallest amount needed and keep the clinic's register up to date." });
    }
  }
  return out;
}

export type ListInteraction = { a: string; b: string; level: "stop" | "caution"; text: string };

// Interactions and duplicate therapy among the medications a patient already takes.
export function interactionsAmong(drugs: string[]): ListInteraction[] {
  const out: ListInteraction[] = [];
  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const [a, b] = [drugs[i], drugs[j]];
      for (const ix of interactionsBetween(a, b)) out.push({ a, b, level: ix.level, text: ix.text });
      const dup = classesOf(a).find((c) => DUPLICATE_CLASSES[c] && classesOf(b).includes(c));
      if (dup) out.push({ a, b, level: "caution", text: `Duplicate therapy: both are ${DUPLICATE_CLASSES[dup]}.` });
    }
  }
  return out.sort((x, y) => (x.level === y.level ? 0 : x.level === "stop" ? -1 : 1));
}

export type ProtocolItem = { label: string; met: boolean; detail: string };

const MONTH = 30.44 * 86_400_000;

// What a refill protocol wants before renewing: a recent visit and the drug's
// monitoring labs. `lastResulted` holds the latest result time by report or LOINC code.
export function refillProtocol(drug: string, ctx: { lastResulted: Record<string, number>; lastVisitAt: number | null; now: number }): ProtocolItem[] {
  const ago = (t: number) => {
    const months = Math.floor((ctx.now - t) / MONTH);
    return months < 1 ? "this month" : months === 1 ? "1 month ago" : `${months} months ago`;
  };
  const items: ProtocolItem[] = [
    {
      label: "Office visit in the last 12 months",
      met: ctx.lastVisitAt !== null && ctx.now - ctx.lastVisitAt <= 12 * MONTH,
      detail: ctx.lastVisitAt ? `Last visit ${ago(ctx.lastVisitAt)}` : "No visit on record",
    },
  ];
  const seen = new Set<string>();
  for (const i of ingredientsOf(drug)) {
    for (const m of i.monitor ?? []) {
      if (seen.has(m.label)) continue;
      seen.add(m.label);
      const times = m.codes.map((c) => ctx.lastResulted[c]).filter((t): t is number => t !== undefined);
      const last = times.length ? Math.max(...times) : null;
      items.push({
        label: `${m.label} in the last ${m.months} months`,
        met: last !== null && ctx.now - last <= m.months * MONTH,
        detail: last ? `Last resulted ${ago(last)}` : "Never resulted",
      });
    }
  }
  return items;
}

export type FillStatus = {
  lastFilledAt: Date | null;
  runsOutAt: Date | null;
  daysLate: number; // past the run-out date with no new fill
  refillsLeft: number;
  fills: number;
};

const DAY = 86_400_000;

// From pharmacy fills: when the supply runs out and how many refills remain.
export function fillStatus(dispenses: { filledAt: Date; daysSupply: number }[], refills: number, now: number): FillStatus {
  const sorted = [...dispenses].sort((a, b) => a.filledAt.getTime() - b.filledAt.getTime());
  const last = sorted.at(-1);
  const runsOutAt = last ? new Date(last.filledAt.getTime() + last.daysSupply * DAY) : null;
  return {
    lastFilledAt: last?.filledAt ?? null,
    runsOutAt,
    daysLate: runsOutAt ? Math.max(0, Math.floor((now - runsOutAt.getTime()) / DAY)) : 0,
    refillsLeft: Math.max(0, refills - Math.max(0, sorted.length - 1)),
    fills: sorted.length,
  };
}
