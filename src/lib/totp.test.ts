import { test } from "node:test";
import assert from "node:assert/strict";
import {
  base32Decode,
  base32Encode,
  hashRecoveryCode,
  looksLikeRecoveryCode,
  newRecoveryCodes,
  newTotpSecret,
  otpauthUri,
  stepAt,
  totpAt,
  verifyTotp,
} from "./totp";

// RFC 6238 appendix B, SHA-1, secret "12345678901234567890" (last six digits of the 8-digit values).
const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890"));
const vectors: [number, string][] = [
  [59, "287082"],
  [1111111109, "081804"],
  [1111111111, "050471"],
  [1234567890, "005924"],
  [2000000000, "279037"],
  [20000000000, "353130"],
];

test("matches the RFC 6238 test vectors", () => {
  for (const [t, code] of vectors) assert.equal(totpAt(RFC_SECRET, stepAt(t * 1000)), code, `t=${t}`);
});

test("base32 round-trips and ignores spaces and case", () => {
  const buf = Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255, 7]);
  const s = base32Encode(buf);
  assert.deepEqual(base32Decode(s), buf);
  assert.deepEqual(base32Decode(s.toLowerCase().replace(/(.{4})/g, "$1 ")), buf);
  assert.equal(base32Encode(Buffer.from("12345678901234567890")), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
});

test("a fresh secret is 160 bits of base32", () => {
  const s = newTotpSecret();
  assert.match(s, /^[A-Z2-7]{32}$/);
  assert.notEqual(s, newTotpSecret());
});

test("accepts the current code and one step either side, not further", () => {
  const now = 1_760_000_000_000;
  const step = stepAt(now);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step), now), step);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 1), now), step - 1);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step + 1), now), step + 1);
  assert.equal(verifyTotp(RFC_SECRET, totpAt(RFC_SECRET, step - 3), now), null);
  assert.equal(verifyTotp(RFC_SECRET, "12345", now), null);
  assert.equal(verifyTotp(RFC_SECRET, "abcdef", now), null);
});

test("a code can't be used twice", () => {
  const now = 1_760_000_000_000;
  const step = stepAt(now);
  const code = totpAt(RFC_SECRET, step);
  assert.equal(verifyTotp(RFC_SECRET, code, now, step), null);
  assert.equal(verifyTotp(RFC_SECRET, code, now, step - 1), step);
});

test("the authenticator link names the clinic and account", () => {
  const uri = otpauthUri("ABCD", "dchen");
  assert.equal(uri, "otpauth://totp/Meridian%20EMR%3Adchen?secret=ABCD&issuer=Meridian%20EMR&algorithm=SHA1&digits=6&period=30");
});

test("recovery codes are distinct, readable, and hash the same however typed", () => {
  const codes = newRecoveryCodes();
  assert.equal(codes.length, 10);
  assert.equal(new Set(codes).size, 10);
  for (const c of codes) assert.match(c, /^[a-z2-9]{4}-[a-z2-9]{4}$/);
  assert.equal(hashRecoveryCode("K7Q2-M9XT"), hashRecoveryCode("k7q2 m9xt"));
  assert.equal(looksLikeRecoveryCode("k7q2-m9xt"), true);
  assert.equal(looksLikeRecoveryCode("123456"), false);
});
