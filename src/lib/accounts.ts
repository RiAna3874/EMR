// Rules for staff accounts made at /setup and /admin/users. Pure, so they're tested.

export const MIN_PASSWORD = 12;

export function usernameError(username: string): string | null {
  if (!/^[a-z][a-z0-9._-]{2,31}$/.test(username)) return "Usernames are 3 to 32 characters: lowercase letters, digits, dot, dash or underscore, starting with a letter.";
  return null;
}

// Length matters most; also refuse the demo password and passwords that contain the username.
export function passwordError(password: string, username: string): string | null {
  if (password.length < MIN_PASSWORD) return `Passwords need at least ${MIN_PASSWORD} characters.`;
  if (password.length > 200) return "That password is too long.";
  const lower = password.toLowerCase();
  if (lower.includes("meridian")) return "Don't use the demo password, or a password containing it.";
  if (username && lower.includes(username.toLowerCase())) return "The password can't contain the username.";
  if (new Set(password).size < 5) return "That password is too repetitive.";
  return null;
}

// A temporary password an admin reads out or hands over; the user replaces it at first sign-in.
// No 0/O or 1/l/I, so it can be read aloud and typed without mistakes.
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export function temporaryPassword(): string {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomBelow(ALPHABET.length)]).join("");
  return [group(), group(), group(), group()].join("-");
}

// Uniform, from the Web Crypto API (in Node and browsers alike, so this file stays importable by client forms).
function randomBelow(n: number): number {
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}
