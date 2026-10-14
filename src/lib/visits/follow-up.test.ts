import { test } from "node:test";
import assert from "node:assert/strict";
import { followUpDateFor, followUpText, toDbDate } from "./follow-up";
import { bnDate, bnDigits } from "./bangla";

const d = (s: string) => new Date(`${s}T00:00:00`);
const iso = (x: Date | null) => (x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}` : null);

test("return dates count from the visit day", () => {
  assert.equal(iso(followUpDateFor("2w", d("2026-10-14"))), "2026-10-28");
  assert.equal(iso(followUpDateFor("3m", d("2026-10-14"))), "2027-01-14");
  assert.equal(iso(followUpDateFor("1m", d("2027-01-31"))), "2027-02-28");
  assert.equal(followUpDateFor("prn", d("2026-10-14")), null);
  assert.equal(followUpDateFor("nonsense", d("2026-10-14")), null);
});

test("follow-up text and Bangla dates", () => {
  const fmt = (x: Date) => iso(x)!;
  assert.equal(followUpText({ followUpInterval: "2w", followUpDate: toDbDate(d("2026-10-28")) }, fmt), "2 weeks (2026-10-28)");
  assert.equal(followUpText({ followUpInterval: "prn", followUpDate: null }, fmt), "As needed");
  assert.equal(followUpText({ followUpInterval: "date", followUpDate: toDbDate(d("2026-11-02")) }, fmt), "2026-11-02");
  assert.equal(followUpText({ followUpInterval: null, followUpDate: null }, fmt), null);
  assert.equal(bnDigits("1+0+1"), "১+০+১");
  assert.equal(bnDate(d("2026-10-28")), "২৮ অক্টোবর ২০২৬");
  assert.equal(bnDate(d("2026-10-28"), { weekday: true }), "বুধবার, ২৮ অক্টোবর ২০২৬");
});

test("vitals summary shows temperature in °F", async () => {
  const { vitalsSummary } = await import("./vitals-line");
  const m = new Map([
    ["8480-6", { code: "8480-6", valueNum: 142 }],
    ["8462-4", { code: "8462-4", valueNum: 88 }],
    ["8310-5", { code: "8310-5", valueNum: 38.4 }],
    ["29463-7", { code: "29463-7", valueNum: 71.5 }],
  ]);
  assert.deepEqual(vitalsSummary(m), [
    { label: "BP", value: "142/88 mmHg" },
    { label: "Temp", value: "101.1 °F" },
    { label: "Weight", value: "71.5 kg" },
  ]);
});
