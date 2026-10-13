import { test } from "node:test";
import assert from "node:assert/strict";
import { findDuplicates, formatPhone, normName, parseDob, validateRegistration } from "./registration";

const today = new Date(2026, 9, 13);
const base = { firstName: "Maria", lastName: "Gonzalez", dob: "1984-07-21", sex: "female", phone: "503 555 0142" };

test("a minimal registration needs name, date of birth, sex and a way to reach the patient", () => {
  const r = validateRegistration(base, today);
  assert.ok(r.ok);
  assert.equal(r.value.phone, "(503) 555-0142");
  assert.equal(r.value.dob.toISOString(), "1984-07-21T00:00:00.000Z");
  assert.equal(r.value.address, null);
  assert.equal(r.value.insurancePayer, null);
  assert.equal(r.value.subscriberRelation, null);

  const empty = validateRegistration({}, today);
  assert.ok(!empty.ok);
  assert.deepEqual(Object.keys(empty.errors).sort(), ["dob", "firstName", "lastName", "phone", "sex"]);
});

test("dates of birth must be real, past and plausible", () => {
  assert.equal(parseDob("2023-02-29"), null);
  assert.equal(parseDob("02/03/1990"), null);
  const bad = (dob: string) => {
    const r = validateRegistration({ ...base, dob }, today);
    return r.ok ? null : r.errors.dob;
  };
  assert.match(bad("2026-10-14")!, /future/);
  assert.equal(bad("2026-10-13"), null); // a newborn registered today
  assert.match(bad("1900-01-01")!, /120 years/);
  assert.match(bad("1984-13-01")!, /real date/);
});

test("phone numbers are normalised and checked", () => {
  assert.equal(formatPhone("+1 (503) 555-0142"), "(503) 555-0142");
  assert.equal(formatPhone("555-0142"), null);
  const r = validateRegistration({ ...base, phone: "", email: "maria@example.com" }, today);
  assert.ok(r.ok, "email alone is enough contact");
  const bad = validateRegistration({ ...base, phone: "12345" }, today);
  assert.ok(!bad.ok && bad.errors.phone);
});

test("a partly entered address is an error; a full one becomes one line", () => {
  const partial = validateRegistration({ ...base, city: "Portland" }, today);
  assert.ok(!partial.ok);
  assert.deepEqual(Object.keys(partial.errors).sort(), ["state", "street", "zip"]);
  const full = validateRegistration({ ...base, street: "120 SE Alder St", unit: "Apt 4", city: "Portland", state: "or", zip: "97214" }, today);
  assert.ok(full.ok);
  assert.equal(full.value.address, "120 SE Alder St Apt 4, Portland, OR 97214");
});

test("insurance: blank is self-pay, a plan needs a member ID, a dependent needs the holder", () => {
  const noId = validateRegistration({ ...base, insurancePayer: "Cascade Health Plan" }, today);
  assert.ok(!noId.ok && noId.errors.insuranceMemberId);
  const orphan = validateRegistration({ ...base, insuranceMemberId: "X1" }, today);
  assert.ok(!orphan.ok && orphan.errors.insurancePayer);
  const self = validateRegistration({ ...base, insurancePayer: "Cascade Health Plan", insuranceMemberId: "chp123" }, today);
  assert.ok(self.ok);
  assert.equal(self.value.subscriberRelation, "Self");
  assert.equal(self.value.insuranceMemberId, "CHP123");
  const dep = validateRegistration({ ...base, insurancePayer: "Cascade Health Plan", insuranceMemberId: "CHP123", subscriberRelation: "Spouse" }, today);
  assert.ok(!dep.ok && dep.errors.subscriberName);
});

test("an emergency contact needs a name and phone", () => {
  const r = validateRegistration({ ...base, emergencyContactPhone: "5035550100" }, today);
  assert.ok(!r.ok && r.errors.emergencyContactName);
  const r2 = validateRegistration({ ...base, emergencyContactName: "Luis Gonzalez" }, today);
  assert.ok(!r2.ok && r2.errors.emergencyContactPhone);
});

const d = (s: string) => parseDob(s)!;
const existing = [
  { id: "a", mrn: "M1", firstName: "Maria", lastName: "Gonzalez", dob: d("1984-07-21") },
  { id: "b", mrn: "M2", firstName: "María", lastName: "González-Ruiz", dob: d("1984-07-21") },
  { id: "c", mrn: "M3", firstName: "Maria", lastName: "Hernandez", dob: d("1984-07-21") },
  { id: "d", mrn: "M4", firstName: "Maria", lastName: "Gonzalez", dob: d("1984-07-12") },
  { id: "e", mrn: "M5", firstName: "Gonzalez", lastName: "Maria", dob: d("1984-07-21") },
  { id: "f", mrn: "M6", firstName: "Peter", lastName: "Gonzalez", dob: d("1984-07-21") },
  { id: "g", mrn: "M7", firstName: "Maria", lastName: "Gonzalez", dob: d("1962-03-02") },
];

test("duplicate check finds the same person under typos, accents, swaps and name changes", () => {
  const found = findDuplicates({ firstName: "maria", lastName: "gonzalez", dob: d("1984-07-21") }, existing);
  const byId = Object.fromEntries(found.map((m) => [m.patient.id, m.strength]));
  assert.deepEqual(byId, { a: "exact", b: "likely", e: "likely", c: "possible", d: "possible" });
  assert.equal(found[0].patient.id, "a", "exact matches come first");
  assert.equal(byId.f, undefined, "same last name and DOB but a different first name is a different person");
  assert.equal(byId.g, undefined, "same name, unrelated date of birth");
});

test("a one-letter typo or a short form of the first name still matches", () => {
  const typo = findDuplicates({ firstName: "Maria", lastName: "Gonzales", dob: d("1984-07-21") }, existing);
  assert.equal(typo.find((m) => m.patient.id === "a")?.strength, "likely");
  const short = findDuplicates({ firstName: "Rob", lastName: "Lee", dob: d("1970-01-01") }, [{ id: "r", mrn: "M9", firstName: "Robert", lastName: "Lee", dob: d("1970-01-01") }]);
  assert.equal(short[0]?.strength, "likely");
});

test("names compare without case, accents or punctuation", () => {
  assert.equal(normName("O'Brien-Núñez"), "obriennunez");
});
