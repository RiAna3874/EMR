"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { logEvent } from "@/lib/audit/server";
import { endSession, getCurrentUser, safeNext, setSessionLocked } from "@/lib/session";
import { clearFailures, lockedOut, recordFailure } from "@/lib/sign-in-lockout";

// Called by the idle timer in the browser.
export async function lockScreen(next: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.locked) {
    await setSessionLocked(true);
    await logEvent({ action: "screen_locked", subject: "Sign-in", actor: { id: user.id, username: user.username }, detail: "Left idle" });
  }
  redirect(`/lock?next=${encodeURIComponent(safeNext(next))}`);
}

export type UnlockState = { error?: string } | undefined;

// The same person types their password again. Too many wrong ones end the session.
export async function unlockScreen(_prev: UnlockState, form: FormData): Promise<UnlockState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const next = safeNext(String(form.get("next") ?? "/"));
  const actor = { id: user.id, username: user.username };
  const p = await db.practitioner.findUniqueOrThrow({ where: { id: user.id }, select: { passwordHash: true, signInLockedUntil: true } });
  if (lockedOut(p) || !(await verifyPassword(String(form.get("password") ?? ""), p.passwordHash))) {
    const locked = lockedOut(p) || (await recordFailure(user.id));
    await logEvent({ action: "sign_in_failed", subject: "Sign-in", actor, detail: "Wrong password on the lock screen" });
    if (locked) {
      await endSession();
      redirect("/login");
    }
    return { error: "That password isn't right." };
  }
  await clearFailures(user.id);
  await setSessionLocked(false);
  await logEvent({ action: "screen_unlocked", subject: "Sign-in", actor });
  redirect(next);
}
