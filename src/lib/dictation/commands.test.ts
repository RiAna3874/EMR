import { test } from "node:test";
import assert from "node:assert/strict";
import { applyCommands, isUndo, joinPiece, tidy } from "./commands";

test("English commands become punctuation and line breaks", () => {
  assert.equal(applyCommands("fever for three days comma no cough full stop new line plan"), "Fever for three days, no cough.\nPlan");
  assert.equal(applyCommands("Chest clear. New paragraph. Assessment colon dengue"), "Chest clear.\n\nAssessment: dengue");
  assert.equal(applyCommands("any vomiting question mark"), "Any vomiting?");
  assert.equal(applyCommands("fever full stop no cough"), "Fever. No cough");
});

test("Bangla commands, and a Bangla full stop after Bangla words", () => {
  assert.equal(applyCommands("তিন দিন ধরে জ্বর দাঁড়ি নতুন লাইন কাশি নেই"), "তিন দিন ধরে জ্বর।\nকাশি নেই");
  assert.equal(applyCommands("জ্বর কমা মাথাব্যথা"), "জ্বর, মাথাব্যথা");
});

test("'period' stays a word", () => {
  assert.equal(applyCommands("last menstrual period two weeks ago"), "Last menstrual period two weeks ago");
});

test("a command inside a longer word is left alone", () => {
  assert.equal(applyCommands("commander"), "Commander");
});

test("scratch that, in either language", () => {
  assert.ok(isUndo("Scratch that."));
  assert.ok(isUndo("মুছে ফেলো।"));
  assert.ok(!isUndo("scratch that itch"));
});

test("pieces join with one space and sentence capitals", () => {
  assert.equal(joinPiece("", "fever"), "Fever");
  assert.equal(joinPiece("Fever for 3 days.", "No cough."), " No cough.");
  assert.equal(joinPiece("Fever for 3 days", "And headache."), " and headache.");
  assert.equal(joinPiece("Started on", "Napa 500 mg."), " Napa 500 mg.");
  assert.equal(joinPiece("Plan:\n", "CBC"), "CBC");
  assert.equal(joinPiece("Fever", ", cough"), ", cough");
  assert.equal(joinPiece("জ্বর", "কাশি"), " কাশি");
});

test("tidy spacing", () => {
  assert.equal(tidy("BP 130/80 , pulse 88 . Chest clear"), "BP 130/80, pulse 88. Chest clear");
  assert.equal(tidy("Napa 500 mg t.d.s. for 3 days"), "Napa 500 mg t.d.s. for 3 days");
  assert.equal(tidy("Temp 38.5 C"), "Temp 38.5 C");
});
