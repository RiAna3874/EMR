import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanBody, cleanTitle, conversationName, countsTowardBadge, isGroup, isUnread, MAX_BODY, nextReadMarker, readBy, sameMembers } from "./chat";
import { can } from "../roles";

const t = (min: number) => new Date(Date.UTC(2026, 9, 13, 9, min));
const member = (id: string, name: string, lastReadAt: Date | null, leftAt: Date | null = null) => ({
  practitionerId: id,
  practitioner: { id, name },
  lastReadAt,
  leftAt,
  joinedAt: t(0),
});

test("every role can use secure chat", () => {
  for (const r of ["physician", "resident", "nurse", "front_desk"] as const) assert.equal(can(r, "useChat"), true, r);
});

test("message bodies are trimmed, required and bounded", () => {
  assert.deepEqual(cleanBody("  BP 182/104 on recheck \r\n"), { ok: true, body: "BP 182/104 on recheck" });
  assert.equal(cleanBody("   ").ok, false);
  assert.equal(cleanBody(undefined).ok, false);
  assert.equal(cleanBody("x".repeat(MAX_BODY)).ok, true);
  assert.equal(cleanBody("x".repeat(MAX_BODY + 1)).ok, false);
});

test("group names collapse whitespace; blank means unnamed", () => {
  assert.equal(cleanTitle("  Morning   huddle "), "Morning huddle");
  assert.equal(cleanTitle("   "), null);
});

test("conversations are named after the other people in them", () => {
  const members = [member("a", "Dana Chen", null), member("b", "Kirsten Lund", null), member("c", "Leo Brandt", null, t(5))];
  assert.equal(conversationName(null, members, "a"), "Kirsten Lund");
  assert.equal(conversationName("Huddle", members, "a"), "Huddle");
  const many = ["Dana Chen", "Kirsten Lund", "Leo Brandt", "Helena Marsh", "Rafael Ibarra"].map((n, i) => member(String(i), n, null));
  assert.equal(conversationName(null, many, "0"), "Kirsten Lund, Leo Brandt +2");
  assert.equal(isGroup(null, members), false, "a member who left doesn't make it a group");
  assert.equal(isGroup(null, many), true);
});

test("read receipts list members whose marker has reached the message", () => {
  const msg = { senderId: "a", createdAt: t(10) };
  const members = [member("a", "Dana Chen", t(10)), member("b", "Kirsten Lund", t(12)), member("c", "Leo Brandt", t(9)), member("d", "Helena Marsh", t(20), t(21))];
  assert.deepEqual(readBy(msg, members).map((m) => m.practitionerId), ["b"]);
});

test("unread means someone else's text after the read marker or join", () => {
  const me = { practitionerId: "b", joinedAt: t(5), lastReadAt: t(10) };
  assert.equal(isUnread({ senderId: "a", createdAt: t(11), kind: "text" }, me), true);
  assert.equal(isUnread({ senderId: "a", createdAt: t(10), kind: "text" }, me), false);
  assert.equal(isUnread({ senderId: "b", createdAt: t(11), kind: "text" }, me), false, "own message");
  assert.equal(isUnread({ senderId: "a", createdAt: t(11), kind: "system" }, me), false, "system line");
  assert.equal(isUnread({ senderId: "a", createdAt: t(3), kind: "text" }, { ...me, lastReadAt: null }), false, "before joining");
});

test("muted conversations only reach the badge when urgent", () => {
  assert.equal(countsTowardBadge(false, false), true);
  assert.equal(countsTowardBadge(true, false), false);
  assert.equal(countsTowardBadge(true, true), true);
});

test("member sets compare without order", () => {
  assert.equal(sameMembers(["a", "b"], ["b", "a"]), true);
  assert.equal(sameMembers(["a", "b"], ["a", "b", "c"]), false);
});

test("read markers only move forward and never into the future", () => {
  const now = t(30);
  assert.deepEqual(nextReadMarker(t(20), t(10), now), t(20));
  assert.deepEqual(nextReadMarker(t(10), t(20), now), t(20));
  assert.deepEqual(nextReadMarker(null, t(40), now), now);
});
