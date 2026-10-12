import { test } from "node:test";
import assert from "node:assert/strict";
import { ORDER_SETS, ORDERABLES, orderableByCode, searchOrderables } from "./catalog";
import { classesForAllergy, orderWarnings, type OrderContext } from "./checks";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 12);
const ctx = (over: Partial<OrderContext> = {}): OrderContext => ({
  allergies: [],
  openOrders: [],
  lastResulted: {},
  activeMeds: [],
  egfr: null,
  now,
  ...over,
});
const get = (code: string) => orderableByCode.get(code)!;
const texts = (o: string, c: OrderContext) => orderWarnings(get(o), c).map((w) => `${w.level}: ${w.text}`);

test("catalog codes are unique and order sets only name real orderables", () => {
  assert.equal(new Set(ORDERABLES.map((o) => o.code)).size, ORDERABLES.length);
  for (const s of ORDER_SETS) for (const c of s.codes) assert.ok(orderableByCode.has(c), `${s.id}: ${c}`);
});

test("search matches names and keywords", () => {
  assert.equal(searchOrderables("cbc")[0].code, "58410-2");
  assert.ok(searchOrderables("augmentin").some((o) => o.code === "RX:562251"));
  assert.ok(searchOrderables("diabetic eye").some((o) => o.code === "REF:ophthalmology"));
  assert.deepEqual(searchOrderables(""), []);
});

test("allergy text maps to drug classes", () => {
  assert.deepEqual(classesForAllergy("Penicillin"), ["penicillin"]);
  assert.deepEqual(classesForAllergy("Sulfamethoxazole/trimethoprim"), ["sulfonamide"]);
  assert.deepEqual(classesForAllergy("Iodinated contrast media"), ["iodinated-contrast"]);
  assert.deepEqual(classesForAllergy("Peanuts"), []);
});

test("penicillin allergy stops amoxicillin and cautions on cephalexin", () => {
  const c = ctx({ allergies: [{ substance: "Penicillin", severity: "moderate" }] });
  assert.equal(orderWarnings(get("RX:723"), c)[0].level, "stop");
  assert.equal(orderWarnings(get("RX:309114"), c)[0].level, "caution");
  assert.deepEqual(orderWarnings(get("RX:248656"), c), []);
});

test("contrast allergy stops a contrast CT but not a plain one", () => {
  const c = ctx({ allergies: [{ substance: "Iodinated contrast media", severity: "moderate" }] });
  assert.equal(orderWarnings(get("CPT:74177"), c)[0].level, "stop");
  assert.deepEqual(orderWarnings(get("CPT:71250"), c), []);
});

test("duplicate and too-soon lab orders", () => {
  assert.match(texts("58410-2", ctx({ openOrders: [{ code: "58410-2", status: "pending" }] }))[0], /Already in pending/);
  assert.match(texts("4548-4", ctx({ lastResulted: { "4548-4": now - 21 * DAY } }))[0], /21 days ago/);
  assert.deepEqual(texts("4548-4", ctx({ lastResulted: { "4548-4": now - 100 * DAY } })), []);
  // A recent CMP counts against a BMP.
  assert.match(texts("51990-0", ctx({ lastResulted: { "24323-8": now - DAY } }))[0], /yesterday/);
});

test("kidney function and interaction rules", () => {
  assert.equal(orderWarnings(get("RX:861007"), ctx({ egfr: 25 }))[0].level, "stop");
  assert.equal(orderWarnings(get("RX:861007"), ctx({ egfr: 40 }))[0].level, "caution");
  assert.deepEqual(orderWarnings(get("RX:861007"), ctx({ egfr: 80 })), []);
  assert.ok(texts("RX:197806", ctx({ activeMeds: ["Apixaban 5 mg tablet"] })).some((t) => /bleeding/.test(t)));
  assert.ok(texts("RX:314076", ctx({ activeMeds: ["Lisinopril 20 mg tablet"] })).some((t) => /already takes/.test(t)));
});
