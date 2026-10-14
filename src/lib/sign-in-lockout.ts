import "server-only";
import { db } from "@/lib/db";

// Five wrong passwords in a row, at sign-in or on the lock screen, block password sign-in
// for that account for a few minutes. Kept in the database, so a restart doesn't reset it.
export const MAX_FAILURES = 5;
export const LOCKOUT_MS = 5 * 60 * 1000;

export const lockedOut = (p: { signInLockedUntil: Date | null }) => !!p.signInLockedUntil && p.signInLockedUntil.getTime() > Date.now();

// Counts a wrong password; true when this one locked the account.
export async function recordFailure(practitionerId: string): Promise<boolean> {
  const p = await db.practitioner.update({ where: { id: practitionerId }, data: { failedSignIns: { increment: 1 } }, select: { failedSignIns: true } });
  if (p.failedSignIns < MAX_FAILURES) return false;
  await db.practitioner.update({ where: { id: practitionerId }, data: { failedSignIns: 0, signInLockedUntil: new Date(Date.now() + LOCKOUT_MS) } });
  return true;
}

export async function clearFailures(practitionerId: string) {
  await db.practitioner.updateMany({ where: { id: practitionerId, OR: [{ failedSignIns: { gt: 0 } }, { signInLockedUntil: { not: null } }] }, data: { failedSignIns: 0, signInLockedUntil: null } });
}
