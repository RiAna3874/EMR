import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Time-based one-time codes (RFC 6238) as shown by Google Authenticator, Microsoft
// Authenticator, Authy and the like: six digits from HMAC-SHA1, a new one every 30 seconds.
const STEP_S = 30;
const DIGITS = 6;
// Accept the code before and after the current one, for a phone clock a little off.
const WINDOW = 1;

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Not base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// 160 bits, the size RFC 4226 recommends.
export const newTotpSecret = () => base32Encode(randomBytes(20));

export const stepAt = (ms: number) => Math.floor(ms / 1000 / STEP_S);

export function totpAt(secret: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const mac = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const offset = mac[mac.length - 1] & 15;
  const n = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(n).padStart(DIGITS, "0");
}

// The step the code belongs to, or null. A step at or before lastStep was already used.
export function verifyTotp(secret: string, code: string, nowMs: number, lastStep?: number | null): number | null {
  const given = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(given)) return null;
  const now = stepAt(nowMs);
  for (let step = now - WINDOW; step <= now + WINDOW; step++) {
    if (lastStep != null && step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(given))) return step;
  }
  return null;
}

// What the authenticator app scans: otpauth://totp/Issuer:account?secret=...&issuer=...
export function otpauthUri(secret: string, account: string, issuer = "Meridian EMR"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_S}`;
}

// Shown in groups of four for typing into an app by hand.
export const groupSecret = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

// One-time recovery codes for a lost phone, like "k7q2-m9xt". Stored only as hashes.
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function newRecoveryCodes(n = 10): string[] {
  const pick = () => Array.from({ length: 4 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
  return Array.from({ length: n }, () => `${pick()}-${pick()}`);
}

export const normalizeRecoveryCode = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, "");
export const hashRecoveryCode = (code: string) => createHash("sha256").update(normalizeRecoveryCode(code)).digest("hex");
export const looksLikeRecoveryCode = (code: string) => normalizeRecoveryCode(code).length === 8;
