import { test } from "node:test";
import assert from "node:assert/strict";
import { doseSchedule, dosageForm } from "./schedule";
import { FORMULARY } from "./formulary";

const product = (name: string) => FORMULARY.find((p) => p.display.startsWith(name))!;
const d = (s: string) => new Date(`${s}T00:00:00`);

test("daily patterns read morning + noon + night, counting tablets", () => {
  const metformin = product("Metformin 500");
  const s = doseSchedule({ drug: metformin.display, dose: "500 mg", frequency: "twice daily with meals", prn: false }, "bn", metformin);
  assert.equal(s.form, "Tab.");
  assert.equal(s.pattern, "১+০+১");
  assert.equal(s.food, "খাবার পরে");
  assert.equal(s.duration, "চলবে");
  assert.equal(s.amount, null);

  const en = doseSchedule({ drug: metformin.display, dose: "1000 mg", frequency: "twice daily with meals", prn: false }, "en", metformin);
  assert.equal(en.pattern, "2+0+2");
  assert.equal(en.food, "after food");

  const amox = product("Amoxicillin 500");
  const a = doseSchedule({ drug: amox.display, dose: "500 mg", frequency: "three times daily for 7 days", prn: false }, "bn", amox);
  assert.equal(a.form, "Cap.");
  assert.equal(a.pattern, "১+১+১");
  assert.equal(a.duration, "৭ দিন");

  assert.equal(doseSchedule({ drug: "X", dose: "1 tablet", frequency: "nightly", prn: false }, "en").pattern, "0+0+1");
  assert.equal(doseSchedule({ drug: "X", dose: "1 tablet", frequency: "once daily", prn: false }, "en").pattern, "1+0+0");
  assert.equal(doseSchedule({ drug: "X", dose: "1 tablet", frequency: "four times daily", prn: false }, "en").pattern, "1+1+1+1");
  assert.equal(doseSchedule({ drug: "X", dose: "1 tablet", frequency: "once daily before breakfast", prn: false }, "bn").food, "খাবারের আগে");
});

test("half tablets and end dates", () => {
  const s = doseSchedule({ drug: "X 5 mg tablet", dose: "0.5 tablet", frequency: "once daily", prn: false, start: d("2026-10-14"), end: d("2026-10-23") }, "en");
  assert.equal(s.pattern, "½+0+0");
  assert.equal(s.duration, "10 days");
  assert.equal(doseSchedule({ drug: "X", dose: "1.5 tablets", frequency: "twice daily", prn: false }, "bn").pattern, "১½+০+১½");
});

test("as-needed, interval and non-tablet medicines say the dose and how often instead", () => {
  const ibu = product("Ibuprofen 600");
  const p = doseSchedule({ drug: ibu.display, dose: "600 mg", frequency: "every 6 hours as needed with food", prn: true, prnReason: "pain" }, "en", ibu);
  assert.equal(p.pattern, null);
  assert.equal(p.how, "if needed (pain), every 6 hours");
  assert.equal(p.amount, "1 tablet");
  assert.equal(p.duration, null);
  assert.equal(doseSchedule({ drug: ibu.display, dose: "600 mg", frequency: "every 6 hours as needed", prn: true }, "bn", ibu).amount, "১টি করে");
  assert.equal(p.food, "after food");

  const insulin = product("Insulin glargine");
  const i = doseSchedule({ drug: insulin.display, dose: "10 units", frequency: "nightly", prn: false }, "bn", insulin);
  assert.equal(i.form, "Inj.");
  assert.equal(i.pattern, "০+০+১");
  assert.equal(i.amount, "10 units");

  const w = doseSchedule({ drug: "Semaglutide pen", dose: "0.5 mg", frequency: "once weekly", prn: false }, "bn");
  assert.equal(w.pattern, null);
  assert.equal(w.how, "সপ্তাহে ১ বার");
});

test("dosage forms", () => {
  assert.equal(dosageForm("Salbutamol 100 mcg inhaler"), "Inh.");
  assert.equal(dosageForm("Paracetamol 120 mg/5 mL suspension"), "Syp.");
  assert.equal(dosageForm("Napa"), null);
});
