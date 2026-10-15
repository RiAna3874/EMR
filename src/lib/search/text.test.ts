import { test } from "node:test";
import assert from "node:assert/strict";
import { canon, parseQuery, searchDocs, withinEdits, wordMatch, type Doc } from "./text";

const doc = (key: string, text: string, title = "", at?: Date): Doc => ({
  key,
  at,
  fields: [
    { label: "Title", text: title, weight: 3 },
    { label: "Body", text, weight: 1, snippet: true },
  ],
});
const keys = (q: string, docs: Doc[]) => searchDocs(q, docs).matches.map((m) => m.key);

test("British and American spellings are one word", () => {
  assert.equal(canon("Haemoglobin"), "hemoglobin");
  assert.equal(canon("oedema"), "edema");
  assert.equal(canon("Anaemia"), "anemia");
  assert.equal(canon("diarrhoea"), "diarrhea");
  assert.equal(canon("tumour"), "tumor");
  assert.equal(canon("৭২"), "৭২"); // Bangla digits untouched
});

test("whole words, word starts and one typo match; short words don't fuzz", () => {
  assert.equal(wordMatch("hemoglobin", "hemoglobin", true), 3);
  assert.equal(wordMatch("hemoglobin", "hemo", true), 2);
  assert.equal(wordMatch("hemoglobin", "hemoglobn", true), 1);
  assert.equal(wordMatch("creatinine", "creatnine", true), 1);
  assert.equal(wordMatch("cough", "couhg", true), 1);
  assert.equal(wordMatch("ldl", "hdl", true), 0);
  assert.equal(wordMatch("hemoglobin", "hemo", false), 0);
  // Numbers match exactly or as a leading part, never 7 for 72 or 7.2.
  assert.equal(wordMatch("7.2", "7.2", true), 3);
  assert.equal(wordMatch("72", "7", true), 0);
  assert.ok(withinEdits("abcd", "abdc", 1));
  assert.ok(!withinEdits("abcd", "dcba", 1));
});

test("abbreviations and local names find the words in the chart, both ways", () => {
  const docs = [doc("a1c", "Hemoglobin A1c 7.2 %"), doc("hb", "Hemoglobin 11.2 g/dL"), doc("alt", "ALT 54 U/L"), doc("napa", "Paracetamol 500 mg tablet")];
  assert.deepEqual(keys("hba1c", docs), ["a1c"]);
  assert.deepEqual(keys("sgpt", docs), ["alt"]);
  assert.deepEqual(keys("napa", docs), ["napa"]);
  assert.deepEqual(keys("acetaminophen", docs), ["napa"]);
  assert.ok(keys("haemoglobin", docs).includes("hb"));
});

test("multi-word phrases are one term: blood pressure finds BP readings", () => {
  const terms = parseQuery("blood pressure trend");
  assert.equal(terms.length, 2);
  assert.equal(terms[0].text, "blood pressure");
  const docs = [doc("sys", "Systolic BP"), doc("hr", "Heart rate"), doc("note", "Blood pressure trend reviewed today")];
  assert.deepEqual(keys("bp", docs).sort(), ["note", "sys"]);
});

test("every word must match; quotes keep words together", () => {
  const docs = [doc("1", "chest pain on exertion, no fever"), doc("2", "pain in the left knee; chest clear")];
  assert.deepEqual(keys("chest pain", docs).sort(), ["1", "2"]);
  assert.deepEqual(keys('"chest pain"', docs), ["1"]);
  assert.deepEqual(keys("knee chest", docs), ["2"]);
});

test("when nothing has every word, the closest partial matches come back, marked", () => {
  const r = searchDocs("knee zebra", [doc("2", "pain in the left knee")]);
  assert.equal(r.partial, true);
  assert.deepEqual(r.matches.map((m) => m.key), ["2"]);
});

test("titles outrank bodies, newer outranks older", () => {
  const now = new Date("2026-10-15");
  const docs = [doc("body", "metformin was mentioned", "Visit", new Date("2026-10-01")), doc("title", "dose", "Metformin 500 mg", new Date("2026-10-01"))];
  assert.deepEqual(searchDocs("metformin", docs, now).matches.map((m) => m.key), ["title", "body"]);
  const dated = [doc("old", "cough", "", new Date("2023-01-01")), doc("new", "cough", "", new Date("2026-10-01"))];
  assert.deepEqual(searchDocs("cough", dated, now).matches.map((m) => m.key), ["new", "old"]);
});

test("the snippet shows the passage with the match marked, and the chart's own words come back for highlighting", () => {
  const long = `${"Lorem ipsum dolor sit amet. ".repeat(10)}Patient reports haemoptysis twice this week. ${"More text follows here. ".repeat(10)}`;
  const m = searchDocs("hemoptysis", [doc("n", long)]).matches[0];
  assert.ok(m.snippet);
  assert.ok(m.snippet!.text.startsWith("…"));
  const [a, b] = m.snippet!.marks[0];
  assert.equal(m.snippet!.text.slice(a, b), "haemoptysis");
  assert.deepEqual(m.terms, ["haemoptysis"]);
});

test("Bangla text is searchable", () => {
  assert.deepEqual(keys("জ্বর", [doc("bn", "রোগীর জ্বর তিন দিন"), doc("en", "fever three days")]), ["bn"]);
});
