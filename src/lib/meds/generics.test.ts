import { test } from "node:test";
import assert from "node:assert/strict";
import { className, genericCode, genericFromCode, mergeGenerics, parseAtcClasses, parseRxIngredients, parseWikidata, rankGenerics } from "./generics";
import { downloadGenerics, saveGenerics } from "./generics-server";
import { productFor, writesOwnSig } from "./formulary";
import { orderableFor } from "@/lib/orders/catalog";
import { medWarnings } from "./checks";

// Shaped like the real answers: RxNav allconcepts and allClasses, Wikidata SPARQL JSON.
const rxBody = {
  minConceptGroup: {
    minConcept: [
      { rxcui: "161", name: "acetaminophen", tty: "IN" },
      { rxcui: "435", name: "albuterol", tty: "IN" },
      { rxcui: "18631", name: "azithromycin", tty: "IN" },
      { rxcui: "29046", name: "lisinopril", tty: "IN" },
      { rxcui: "999001", name: "zinc oxide", tty: "IN" },
    ],
  },
};
const atcBody = {
  rxclassMinConceptList: {
    rxclassMinConcept: [
      { classId: "0", className: "Anatomical Therapeutic Chemical", classType: "ATC1-4" },
      { classId: "N02B", className: "OTHER ANALGESICS AND ANTIPYRETICS", classType: "ATC1-4" },
      { classId: "N02BE", className: "ANILIDES", classType: "ATC1-4" },
      { classId: "J01F", className: "MACROLIDES, LINCOSAMIDES AND STREPTOGRAMINS", classType: "ATC1-4" },
      { classId: "J01FA", className: "MACROLIDES", classType: "ATC1-4" },
      { classId: "C09AA", className: "ACE INHIBITORS, PLAIN", classType: "ATC1-4" },
      { classId: "A03FA", className: "PROPULSIVES", classType: "ATC1-4" },
    ],
  },
};
const b = (v: string) => ({ value: v });
const wdBody = {
  head: { vars: ["item", "en", "bn", "rxcui", "atcs", "aliases"] },
  results: {
    bindings: [
      { item: b("http://www.wikidata.org/entity/Q57055"), en: b("paracetamol"), bn: b("প্যারাসিটামল"), rxcui: b("161"), atcs: b("N02BE01"), aliases: b("acetaminophen|APAP") },
      { item: b("http://www.wikidata.org/entity/Q422212"), en: b("salbutamol"), atcs: b("R03AC02|R03CC02"), aliases: b("albuterol") },
      { item: b("http://www.wikidata.org/entity/Q165399"), en: b("azithromycin"), rxcui: b("18631"), atcs: b("J01FA10|S01AA26"), aliases: b("") },
      // Domperidone isn't in RxNorm: it comes from Wikidata alone.
      { item: b("http://www.wikidata.org/entity/Q423174"), en: b("domperidone"), atcs: b("A03FA03"), aliases: b("Motilium®") },
      // An item with two RxCUIs arrives twice and is merged.
      { item: b("http://www.wikidata.org/entity/Q423174"), en: b("domperidone"), rxcui: b("3626"), atcs: b("A03FA03"), aliases: b("") },
    ],
  },
};

const merged = () => mergeGenerics(parseRxIngredients(rxBody), parseWikidata(wdBody), parseAtcClasses(atcBody));

test("RxNorm and Wikidata join into one name per ingredient", () => {
  const rows = merged();
  const para = rows.find((r) => r.id === "rx161")!;
  assert.equal(para.name, "Paracetamol");
  assert.equal(para.otherNames, "acetaminophen; APAP");
  assert.equal(para.bangla, "প্যারাসিটামল");
  assert.equal(para.classes, "Anilides; Other analgesics and antipyretics");
  // Joined by name when Wikidata has no RxCUI: salbutamol is RxNorm's albuterol.
  const salb = rows.find((r) => r.rxcui === "435")!;
  assert.equal(salb.name, "Salbutamol");
  assert.match(salb.otherNames, /albuterol/);
  // Wikidata-only medicines are kept; brand-like names are dropped.
  const dom = rows.find((r) => r.name === "Domperidone")!;
  assert.equal(dom.id, "wdQ423174");
  assert.equal(dom.otherNames, "");
  // RxNorm-only ingredients are kept with their own name.
  assert.ok(rows.some((r) => r.name === "Lisinopril" && r.wikidata === null));
  assert.equal(rows.length, 6);
  assert.equal(className("ACE INHIBITORS, PLAIN"), "ACE inhibitors, plain");
});

test("search finds a generic by any name, Bangla, or class", () => {
  const rows = merged();
  assert.deepEqual(rankGenerics(rows, "acetaminophen").map((r) => r.name), ["Paracetamol"]);
  assert.deepEqual(rankGenerics(rows, "প্যারা").map((r) => r.name), ["Paracetamol"]);
  assert.deepEqual(rankGenerics(rows, "macrolide").map((r) => r.name), ["Azithromycin"]);
  // Names starting with what was typed come first; then medicines with a class before chemicals.
  assert.deepEqual(rankGenerics(rows, "z").map((r) => r.name), ["Zinc oxide", "Azithromycin"]);
  assert.deepEqual(rankGenerics(rows, "i").map((r) => r.name).slice(-1), ["Zinc oxide"]);
});

test("a generic's code reads back as a product the prescriber writes the sig for", () => {
  const code = genericCode({ id: "wdQ423174", name: "Domperidone" });
  assert.equal(code, "RX:GENERIC:wdQ423174:Domperidone");
  const p = productFor({ code })!;
  assert.equal(p.display, "Domperidone");
  assert.equal(p.generic, "wdQ423174");
  assert.ok(writesOwnSig(p));
  assert.equal(productFor({ rxnorm: p.rxnorm })?.display, "Domperidone");
  assert.equal(orderableFor(code)?.display, "Domperidone");
  assert.equal(genericFromCode("RX:GENERIC::x"), undefined);
  // The clinic's checks know domperidone by name.
  const w = medWarnings("Domperidone", { dose: "20 mg", frequency: "three times daily" }, { allergies: [], activeMeds: [], egfr: null });
  assert.ok(w.some((x) => x.kind === "dose" && x.level === "stop"));
});

test("the download asks RxNorm, its ATC classes and Wikidata", async () => {
  const asked: string[] = [];
  const fakeFetch = (async (url: string, init?: RequestInit) => {
    asked.push(`${init?.method ?? "GET"} ${new URL(url).host}`);
    const body = url.includes("allconcepts") ? rxBody : url.includes("rxclass") ? atcBody : wdBody;
    if (url.includes("wikidata")) assert.match(String(init?.body), /P267/);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  const rows = await downloadGenerics(undefined, fakeFetch);
  assert.deepEqual(asked, ["GET rxnav.nlm.nih.gov", "GET rxnav.nlm.nih.gov", "POST query.wikidata.org"]);
  assert.equal(rows.length, 6);
  await assert.rejects(saveGenerics({} as never, rows), /only 6 generic names/);
});

test("a broken answer is an error, not an empty list", () => {
  assert.throws(() => parseRxIngredients({}), /RxNorm/);
  assert.throws(() => parseWikidata({ results: {} }), /Wikidata/);
});
