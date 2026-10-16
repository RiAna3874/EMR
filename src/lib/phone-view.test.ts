import { test } from "node:test";
import assert from "node:assert/strict";
import { isPhone, phoneEquivalent } from "./phone-view";

const to = (path: string) => {
  const u = new URL(path, "http://x");
  return phoneEquivalent(u.pathname, u.searchParams);
};

test("full-site pages open their phone screen", () => {
  assert.equal(to("/"), "/m");
  assert.equal(to("/?view=all"), "/m");
  assert.equal(to("/patients"), "/m/patients");
  assert.equal(to("/patients/new"), "/m/patients");
  assert.equal(to("/patients/abc123"), "/m/patients/abc123");
  assert.equal(to("/patients/abc123/results?view=graph&codes=2345-7"), "/m/patients/abc123/results");
  assert.equal(to("/patients/abc123/meds"), "/m/patients/abc123/meds");
  assert.equal(to("/patients/abc123/notes?note=n9"), "/m/patients/abc123/notes/n9");
  assert.equal(to("/patients/abc123/media?item=m1"), "/m/patients/abc123/media/m1");
  assert.equal(to("/patients/abc123/visit?e=1"), "/m/patients/abc123");
  assert.equal(to("/messages"), "/m/chat");
  assert.equal(to("/messages/c1"), "/m/chat/c1");
  assert.equal(to("/messages/new?patient=p1"), "/m/chat/new?patient=p1");
  assert.equal(to("/inbox"), "/m");
  assert.equal(to("/schedule/book"), "/m");
});

test("sign-in, files, printouts and the phone view itself are left alone", () => {
  for (const p of ["/m", "/m/patients/x", "/login", "/lock?next=/", "/account/password", "/api/patients", "/media/m1", "/documents/d1", "/print/note/1", "/view/full-site", "/manifest.webmanifest", "/favicon.ico"]) {
    assert.equal(to(p), null, p);
  }
});

test("phones, not tablets or computers", () => {
  assert.ok(isPhone("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"));
  assert.ok(isPhone("Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36"));
  assert.ok(!isPhone("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148"));
  assert.ok(!isPhone("Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 Chrome/129.0 Safari/537.36"));
  assert.ok(!isPhone("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15"));
});
