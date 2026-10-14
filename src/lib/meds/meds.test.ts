import { test } from "node:test";
import assert from "node:assert/strict";
import { FORMULARY, productByCode, productFor } from "./formulary";
import { INGREDIENTS, ingredientsOf, interactionsBetween } from "./drugs";
import { fillStatus, interactionsAmong, maxRefills, medWarnings, refillProtocol, type MedCheckContext } from "./checks";
import { daysSupplyFor, doseMg, numberWords, sigText, suggestQuantity, timesPerDay, unitsHint } from "./sig";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 13);
const ctx = (over: Partial<MedCheckContext> = {}): MedCheckContext => ({ allergies: [], activeMeds: [], egfr: null, ...over });
const levels = (drug: string, c: MedCheckContext, rx = null as Parameters<typeof medWarnings>[1]) => medWarnings(drug, rx, c).map((w) => `${w.level}:${w.kind}`);

test("every formulary product has a unique code and a known ingredient", () => {
  assert.equal(new Set(FORMULARY.map((p) => p.rxnorm)).size, FORMULARY.length);
  for (const p of FORMULARY) assert.ok(INGREDIENTS.some((i) => i.match.test(p.display)), p.display);
  assert.equal(productFor({ rxnorm: "314077" })?.display, "Lisinopril 20 mg tablet");
  assert.equal(productFor({ drug: "Apixaban 5 mg tablet" })?.rxnorm, "1364445");
});

test("Bangladeshi brands are checked as their generic", () => {
  // Napa is paracetamol: the daily maximum applies to it typed as free text.
  assert.ok(levels("Napa Extra", ctx(), { dose: "2000 mg", frequency: "every 6 hours" }).includes("stop:dose"));
  assert.ok(levels("Seclo 20 mg", ctx({ activeMeds: ["Esomeprazole 20 mg capsule"] })).includes("caution:duplicate"));
  assert.ok(levels("Filmet 400 mg", ctx({ activeMeds: ["Warfarin 5 mg tablet"] })).includes("stop:interaction"));
  assert.ok(levels("Cef-3 200 mg", ctx({ allergies: [{ substance: "Ceftriaxone", severity: "moderate" }] })).includes("stop:allergy"));
  // Esomeprazole isn't mistaken for omeprazole.
  assert.deepEqual(ingredientsOf("Esomeprazole 20 mg capsule").map((i) => i.id), ["esomeprazole"]);
});

test("off-list medications round-trip by name and say they weren't checked", () => {
  const p = productFor({ code: "RX:OFFLIST:Tufnil  200 mg" });
  assert.equal(p?.display, "Tufnil 200 mg");
  assert.equal(p?.offList, true);
  assert.equal(productFor({ rxnorm: p!.rxnorm })?.display, "Tufnil 200 mg");
  assert.equal(productFor({ code: "RX:OFFLIST:" }), undefined);
  assert.deepEqual(levels("Tufnil 200 mg", ctx()), ["caution:not checked"]);
  assert.ok(!levels("Paracetamol 500 mg tablet", ctx()).includes("caution:not checked"));
});

test("frequency and dose parsing", () => {
  assert.equal(timesPerDay("twice daily with meals"), 2);
  assert.equal(timesPerDay("every 6 hours as needed"), 4);
  assert.equal(timesPerDay("nightly"), 1);
  assert.equal(timesPerDay("once weekly"), 1 / 7);
  assert.equal(timesPerDay("at migraine onset, may repeat in 2 hours"), null);
  assert.equal(doseMg("75 mcg"), 0.075);
  assert.equal(doseMg("500 mg day 1, then 250 mg"), 500);
  assert.equal(doseMg("2 tablets", { unitMg: 500 }), 1000);
});

test("quantity and days supply follow the sig", () => {
  const metformin = productByCode.get("RX:861007")!;
  assert.equal(suggestQuantity(metformin, { dose: "1000 mg", frequency: "twice daily" }, 30), "120 tablets");
  assert.equal(daysSupplyFor(metformin, { dose: "500 mg", frequency: "twice daily" }, "60 tablets"), 30);
  const albuterol = productByCode.get("RX:745679")!;
  assert.equal(suggestQuantity(albuterol, { dose: "2 puffs", frequency: "every 4 hours" }, 30), null);
  assert.equal(sigText({ dose: "600 mg", route: "oral", frequency: "every 6 hours", prn: true, prnReason: "pain", durationDays: 7 }), "600 mg oral, every 6 hours as needed for pain for 7 days");
  assert.equal(suggestQuantity(productByCode.get("RX:248656")!, { dose: "500 mg day 1, then 250 mg", frequency: "once daily" }, 5), null);
  assert.equal(unitsHint("10 mg", productByCode.get("RX:197361")), "2 tablets");
  assert.equal(unitsHint("5 mg", productByCode.get("RX:197361")), null);
  assert.equal(numberWords(180), "one hundred eighty");
  assert.equal(numberWords(12), "twelve");
});

test("allergies stop by class and by name", () => {
  const pcn = ctx({ allergies: [{ substance: "Penicillin", severity: "moderate" }] });
  assert.deepEqual(levels("Amoxicillin 500 mg capsule", pcn), ["stop:allergy"]);
  assert.deepEqual(levels("Cephalexin 500 mg capsule", pcn), ["caution:allergy"]);
  const codeine = ctx({ allergies: [{ substance: "Codeine", severity: "moderate" }] });
  assert.ok(levels("Acetaminophen-codeine 300-30 mg tablet", codeine).includes("stop:allergy"));
  assert.ok(!levels("Oxycodone 5 mg tablet", codeine).includes("stop:allergy"));
});

test("interactions and duplicate therapy against current meds", () => {
  assert.ok(levels("Ibuprofen 600 mg tablet", ctx({ activeMeds: ["Apixaban 5 mg tablet"] })).includes("stop:interaction"));
  assert.ok(levels("Losartan 50 mg tablet", ctx({ activeMeds: ["Lisinopril 20 mg tablet"] })).includes("stop:interaction"));
  assert.ok(levels("Clarithromycin 500 mg tablet", ctx({ activeMeds: ["Atorvastatin 40 mg tablet"] })).includes("stop:interaction"));
  assert.ok(levels("Tramadol 50 mg tablet", ctx({ activeMeds: ["Sertraline 50 mg tablet"] })).includes("caution:interaction"));
  assert.match(medWarnings("Rosuvastatin 20 mg tablet", null, ctx({ activeMeds: ["Atorvastatin 40 mg tablet"] }))[0].text, /Duplicate therapy/);
  assert.match(medWarnings("Lisinopril 10 mg tablet", null, ctx({ activeMeds: ["Lisinopril 20 mg tablet"] }))[0].text, /already takes/);
  assert.deepEqual(interactionsBetween("Amlodipine 5 mg tablet", "Atorvastatin 40 mg tablet"), []);
});

test("dose limits, older adults, kidneys", () => {
  assert.ok(levels("Acetaminophen 500 mg tablet", ctx(), { dose: "1000 mg", frequency: "every 4 hours" }).includes("stop:dose"));
  assert.deepEqual(levels("Acetaminophen 500 mg tablet", ctx(), { dose: "1000 mg", frequency: "every 8 hours" }), []);
  // 4 g/day is fine under 65 but over the 3 g limit at 76.
  assert.deepEqual(levels("Acetaminophen 500 mg tablet", ctx(), { dose: "1000 mg", frequency: "every 6 hours" }), []);
  assert.ok(levels("Acetaminophen 500 mg tablet", ctx({ ageYears: 76 }), { dose: "1000 mg", frequency: "every 6 hours" }).includes("stop:dose"));
  assert.ok(levels("Cyclobenzaprine 10 mg tablet", ctx({ ageYears: 76 })).includes("caution:older adult"));
  assert.deepEqual(levels("Metformin 500 mg tablet", ctx({ egfr: 25 })), ["stop:kidney"]);
  assert.deepEqual(levels("Metformin 500 mg tablet", ctx({ egfr: 40 })), ["caution:kidney"]);
  assert.deepEqual(levels("Alendronate 70 mg tablet", ctx({ egfr: 30 })), ["stop:kidney"]);
});

test("controlled drugs get no refills", () => {
  assert.equal(maxRefills("Oxycodone 5 mg tablet"), 0);
  assert.equal(maxRefills("Tramadol 50 mg tablet"), 0);
  assert.equal(maxRefills("Lisinopril 10 mg tablet"), 11);
  assert.ok(levels("Oxycodone 5 mg tablet", ctx(), { refills: 1 }).includes("stop:controlled"));
  assert.ok(levels("Oxycodone 5 mg tablet", ctx(), { refills: 0 }).includes("caution:controlled"));
});

test("interactions among a current list", () => {
  const list = interactionsAmong(["Levothyroxine 75 mcg tablet", "Ferrous sulfate 325 mg tablet", "Sertraline 50 mg tablet"]);
  assert.equal(list.length, 1);
  assert.match(list[0].text, /4 hours/);
});

test("refill protocol and fill status", () => {
  const items = refillProtocol("Lisinopril 20 mg tablet", { lastResulted: { "24323-8": now - 40 * DAY }, lastVisitAt: now - 400 * DAY, now });
  assert.deepEqual(items.map((i) => i.met), [false, true]);
  const fs = fillStatus(
    [
      { filledAt: new Date(now - 200 * DAY), daysSupply: 90 },
      { filledAt: new Date(now - 110 * DAY), daysSupply: 90 },
    ],
    3,
    now,
  );
  assert.equal(fs.refillsLeft, 2);
  assert.equal(fs.daysLate, 20);
});
