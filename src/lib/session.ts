import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can, type Permission, type SessionUser } from "@/lib/roles";
import { twoStepRequired } from "@/lib/deployment";

export const SESSION_COOKIE = "meridian_session";
// A clinic shift. Sessions also end after IDLE_MS without a request.
const SESSION_MS = 12 * 60 * 60 * 1000;
const IDLE_MS = 2 * 60 * 60 * 1000;
// lastSeenAt is only written when it is this stale, to avoid a write per request.
const TOUCH_MS = 5 * 60 * 1000;

const tokenId = (token: string) => createHash("sha256").update(token).digest("hex");

export async function startSession(practitionerId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_MS);
  await db.session.create({ data: { id: tokenId(token), practitionerId, expiresAt } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

// After a password change: sign out everywhere else.
export async function endOtherSessions(practitionerId: string) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  await db.session.deleteMany({ where: { practitionerId, ...(token ? { id: { not: tokenId(token) } } : {}) } });
}

export async function endSession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { id: tokenId(token) } });
  jar.delete(SESSION_COOKIE);
}

// The signed-in user for this request, or null. Cached per request.
export const getCurrentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const id = tokenId(token);
  const session = await db.session.findUnique({ where: { id }, include: { practitioner: true } });
  const now = Date.now();
  if (!session || session.expiresAt.getTime() < now || now - session.lastSeenAt.getTime() > IDLE_MS || !session.practitioner.active) {
    if (session) await db.session.deleteMany({ where: { id } });
    return null;
  }
  if (now - session.lastSeenAt.getTime() > TOUCH_MS) await db.session.update({ where: { id }, data: { lastSeenAt: new Date(now) } });
  const p = session.practitioner;
  return { id: p.id, name: p.name, credentials: p.credentials, role: p.role, username: p.username ?? "", isAdmin: p.isAdmin, mustChangePassword: p.mustChangePassword, twoStepEnabled: !!p.totpEnabledAt };
});

// Only same-site paths, so a crafted link can't bounce a fresh sign-in elsewhere.
export const safeNext = (next: string | undefined) =>
  next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login") ? next : "/";

// Signed in and past every sign-in step: own password chosen, two-step set up where required.
// For API routes and anything shown outside requireUser's redirects (the top bar).
export const signInComplete = (u: SessionUser) => !u.mustChangePassword && (!twoStepRequired || u.twoStepEnabled);

export async function getActiveUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && signInComplete(user) ? user : null;
}

// For pages and server actions: the signed-in user, or off to the sign-in screen.
// Someone still on a temporary password is sent to choose their own first, then,
// where two-step sign-in is required, to set up their authenticator app.
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");
  if (twoStepRequired && !user.twoStepEnabled) redirect("/account/two-step");
  return user;
}

// Two-step sign-in: between a correct password and the authenticator code. The cookie
// lives five minutes and allows five tries; then it's back to the password.
export const CHALLENGE_COOKIE = "meridian_two_step";
const CHALLENGE_MS = 5 * 60 * 1000;
export const CHALLENGE_TRIES = 5;

export async function startChallenge(practitionerId: string, next: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + CHALLENGE_MS);
  await db.signInChallenge.deleteMany({ where: { OR: [{ practitionerId }, { expiresAt: { lt: new Date() } }] } });
  await db.signInChallenge.create({ data: { id: tokenId(token), practitionerId, next, expiresAt } });
  (await cookies()).set(CHALLENGE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/login",
    expires: expiresAt,
  });
}

export async function currentChallenge() {
  const token = (await cookies()).get(CHALLENGE_COOKIE)?.value;
  if (!token) return null;
  const c = await db.signInChallenge.findUnique({ where: { id: tokenId(token) }, include: { practitioner: true } });
  if (!c || c.expiresAt.getTime() < Date.now() || c.attempts >= CHALLENGE_TRIES || !c.practitioner.active) return null;
  return c;
}

export async function endChallenge() {
  const jar = await cookies();
  const token = jar.get(CHALLENGE_COOKIE)?.value;
  if (token) await db.signInChallenge.deleteMany({ where: { id: tokenId(token) } });
  jar.delete({ name: CHALLENGE_COOKIE, path: "/login" });
}

// Staff account management (/admin/users).
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/?denied=admin");
  return user;
}

// As requireUser, and the user's role must allow `permission`; a user without it
// is sent to My Day with a notice. Every server action that changes the chart calls this.
export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect(`/?denied=${permission}`);
  return user;
}
