"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { hashRecoveryCode, looksLikeRecoveryCode, verifyTotp } from "@/lib/totp";
import { logEvent } from "@/lib/audit/server";
import { clearFailures, lockedOut, recordFailure } from "@/lib/sign-in-lockout";
import { CHALLENGE_TRIES, currentChallenge, endChallenge, endSession, getCurrentUser, safeNext, startChallenge, startSession } from "@/lib/session";



type SignInState = { error?: string; username?: string } | undefined;

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));
  if (!username || !password) return { error: "Enter your username and password.", username };

  const user = await db.practitioner.findUnique({ where: { username } });
  if (user && lockedOut(user)) {
    await logEvent({ action: "sign_in_failed", subject: "Sign-in", actor: { id: user.id, username: user.username }, detail: "Locked after too many wrong passwords" });
    return { error: "Too many wrong passwords. Wait 5 minutes and try again.", username };
  }
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    if (user) await recordFailure(user.id);
    await logEvent({
      action: "sign_in_failed",
      subject: "Sign-in",
      actor: user ? { id: user.id, username: user.username } : null,
      // Never what was typed: people sometimes type their password into the username box.
      detail: user ? (user.active ? "Wrong password" : "Account deactivated") : "Unknown username",
    });
    return { error: "That username and password don't match.", username };
  }
  await clearFailures(user.id);
  // Two-step sign-in: the password alone doesn't open the chart.
  if (user.totpEnabledAt) {
    await startChallenge(user.id, next);
    redirect("/login/verify");
  }
  await startSession(user.id);
  await logEvent({ action: "sign_in", subject: "Sign-in", actor: { id: user.id, username: user.username }, detail: "Password only" });
  redirect(next);
}

type VerifyState = { error?: string } | undefined;

export async function verifyTwoStep(_prev: VerifyState, form: FormData): Promise<VerifyState> {
  const challenge = await currentChallenge();
  if (!challenge) {
    await endChallenge();
    redirect("/login?expired=1");
  }
  const user = challenge.practitioner;
  const actor = { id: user.id, username: user.username };
  const code = String(form.get("code") ?? "").trim();
  if (!code) return { error: "Enter the 6-digit code from your authenticator app." };

  let ok = false;
  let detail = "Authenticator code";
  if (looksLikeRecoveryCode(code)) {
    // A recovery code works once: remove its hash as it's used, in one statement so two tabs can't both use it.
    const hash = hashRecoveryCode(code);
    const used = await db.$executeRaw`
      UPDATE "Practitioner" SET "recoveryCodes" = array_remove("recoveryCodes", ${hash})
      WHERE id = ${user.id} AND ${hash} = ANY("recoveryCodes")`;
    ok = used === 1;
    if (ok) {
      detail = `Recovery code (${user.recoveryCodes.length - 1} left)`;
      await logEvent({ action: "recovery_code_used", subject: "Two-step sign-in", actor, detail });
    }
  } else if (user.totpSecret) {
    const step = verifyTotp(user.totpSecret, code, Date.now(), user.totpLastStep);
    // Record the step so the same code can't be replayed, unless another sign-in got there first.
    if (step !== null) {
      const claimed = await db.practitioner.updateMany({
        where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
        data: { totpLastStep: step },
      });
      ok = claimed.count === 1;
    }
  }

  if (!ok) {
    const attempts = challenge.attempts + 1;
    await db.signInChallenge.update({ where: { id: challenge.id }, data: { attempts } });
    await logEvent({ action: "two_step_failed", subject: "Two-step sign-in", actor, detail: `Attempt ${attempts} of ${CHALLENGE_TRIES}` });
    if (attempts >= CHALLENGE_TRIES) {
      await endChallenge();
      redirect("/login?expired=tries");
    }
    return { error: "That code isn't right. Check the code in your authenticator app and try again." };
  }

  const next = challenge.next;
  await endChallenge();
  await startSession(user.id);
  await logEvent({ action: "sign_in", subject: "Sign-in", actor, detail });
  redirect(safeNext(next));
}

export async function cancelTwoStep() {
  await endChallenge();
  redirect("/login");
}

export async function signOut() {
  const user = await getCurrentUser();
  await endSession();
  if (user) await logEvent({ action: "sign_out", subject: "Sign-in", actor: { id: user.id, username: user.username } });
  redirect("/login");
}
