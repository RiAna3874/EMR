// Order safety checks: allergies, duplicates, too-soon repeats, and a few
// kidney-function and interaction rules. Pure, so the composer can warn before
// an order is added and the pending list can show the same warnings.
import { satisfyingCodes, type Orderable } from "./catalog";

export type OrderContext = {
  allergies: { substance: string; severity: string }[];
  // Orders already pending or active for this patient, by orderable code.
  openOrders: { code: string; status: string }[];
  // Most recent lab result date (ms) by report code and by LOINC code.
  lastResulted: Record<string, number>;
  activeMeds: string[];
  egfr: number | null;
  now: number;
};

export type OrderWarning = { level: "stop" | "caution"; text: string };

// Allergy entries are free text; map common ones to the drug classes they cover.
const allergyClasses: [RegExp, string[]][] = [
  [/penicillin|amoxicillin|ampicillin|augmentin/i, ["penicillin"]],
  [/cephalosporin|cephalexin|cefdinir|ceftriaxone|keflex/i, ["cephalosporin"]],
  [/sulfa|sulfamethoxazole|bactrim/i, ["sulfonamide"]],
  [/codeine/i, ["codeine"]],
  [/morphine|oxycodone|hydrocodone|opioid/i, ["opioid"]],
  [/nsaid|ibuprofen|naproxen|aspirin/i, ["nsaid"]],
  [/macrolide|azithromycin|erythromycin|clarithromycin/i, ["macrolide"]],
  [/statin/i, ["statin"]],
  [/ace inhibitor|lisinopril|enalapril/i, ["ace-inhibitor"]],
  [/contrast|iodine/i, ["iodinated-contrast"]],
];

export function classesForAllergy(substance: string) {
  return allergyClasses.flatMap(([re, classes]) => (re.test(substance) ? classes : []));
}

const DAY = 86_400_000;

export function orderWarnings(o: Orderable, ctx: OrderContext, opts: { ignoreOpenOrder?: boolean } = {}): OrderWarning[] {
  const out: OrderWarning[] = [];
  const drugClasses = o.med?.classes ?? [];
  const orderClasses = o.contrast ? [...drugClasses, "iodinated-contrast"] : drugClasses;

  for (const a of ctx.allergies) {
    const allergic = classesForAllergy(a.substance);
    const hit = orderClasses.find((c) => allergic.includes(c));
    if (hit) {
      out.push({ level: "stop", text: `Allergy: ${a.substance} (${a.severity}). ${o.display} is ${hit === "iodinated-contrast" ? "a contrast study" : `in the ${hit} class`}.` });
    } else if (allergic.includes("penicillin") && drugClasses.includes("cephalosporin")) {
      out.push({ level: "caution", text: `Allergy: ${a.substance}. Low cross-reactivity risk with cephalosporins.` });
    }
  }

  if (!opts.ignoreOpenOrder) {
    const open = ctx.openOrders.find((x) => x.code === o.code);
    if (open) out.push({ level: "caution", text: open.status === "pending" ? "Already in pending orders." : "Already ordered and not yet resulted." });
  }

  if (o.repeatDays) {
    const times = satisfyingCodes(o).map((c) => ctx.lastResulted[c]).filter((t) => t !== undefined);
    const last = times.length ? Math.max(...times) : undefined;
    if (last !== undefined) {
      const days = Math.floor((ctx.now - last) / DAY);
      if (days < o.repeatDays) out.push({ level: "caution", text: `Last resulted ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`}.` });
    }
  }

  if (o.med) {
    const base = o.display.split(/[\s-]/)[0].toLowerCase();
    const same = ctx.activeMeds.find((m) => m.toLowerCase().startsWith(base));
    if (same) out.push({ level: "caution", text: `Patient already takes ${same}.` });
  }

  const egfr = ctx.egfr;
  if (egfr !== null) {
    if (o.code === "RX:861007" && egfr < 30) out.push({ level: "stop", text: `Metformin is contraindicated with eGFR ${egfr}.` });
    else if (o.code === "RX:861007" && egfr < 45) out.push({ level: "caution", text: `eGFR ${egfr}: don't start metformin below 45.` });
    if (drugClasses.includes("nsaid") && egfr < 45) out.push({ level: "caution", text: `eGFR ${egfr}: NSAIDs can worsen kidney function.` });
    if (o.contrast && egfr < 30) out.push({ level: "stop", text: `eGFR ${egfr}: iodinated contrast risks kidney injury.` });
    if (o.code === "RX:1648755" && egfr < 30) out.push({ level: "caution", text: `eGFR ${egfr}: nitrofurantoin is less effective and more toxic.` });
  }

  if (drugClasses.includes("nsaid") && ctx.activeMeds.some((m) => /apixaban|warfarin|rivaroxaban|clopidogrel/i.test(m))) {
    out.push({ level: "caution", text: "On an anticoagulant or antiplatelet: higher bleeding risk with NSAIDs." });
  }
  return out;
}
