"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { hashRecoveryCode, newRecoveryCodes, verifyTotp } from "@/lib/totp";
import { logEvent } from "@/lib/audit/server";
import { twoStepRequired } from "@/lib/deployment";
import { endOtherSessions, getCurrentUser } from "@/lib/session";

export type TwoStepState = { error?: string; codes?: string[]; ok?: string } | undefined;

// Uses getCurrentUser, not requireUser: someone required to set up two-step sign-in must be able to get here.
async function me() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");
  return { user, row: await db.practitioner.findUniqueOrThrow({ where: { id: user.id } }) };
}

// The first code from the app proves it was set up right; then two-step sign-in is on.
export async function confirmTwoStep(_prev: TwoStepState, form: FormData): Promise<TwoStepState> {
  const { user, row } = await me();
  if (row.totpEnabledAt) return { error: "Two-step sign-in is already on." };
  if (!row.totpPendingSecret) return { error: "The setup expired. Reload the page and scan the new code." };
  const step = verifyTotp(row.totpPendingSecret, String(form.get("code") ?? ""), Date.now());
  if (step === null) return { error: "That code doesn't match. Check that the phone's clock is set automatically, then enter the code showing now." };
  const codes = newRecoveryCodes();
  await db.practitioner.update({
    where: { id: user.id },
    data: { totpSecret: row.totpPendingSecret, totpPendingSecret: null, totpEnabledAt: new Date(), totpLastStep: step, recoveryCodes: codes.map(hashRecoveryCode) },
  });
  // Anyone else signed in with only the password is signed out.
  await endOtherSessions(user.id);
  await logEvent({ action: "two_step_on", subject: "Two-step sign-in", actor: { id: user.id, username: user.username } });
  return { codes };
}

// A fresh set of recovery codes; the old ones stop working. Needs a current code.
export async function newCodes(_prev: TwoStepState, form: FormData): Promise<TwoStepState> {
  const { user, row } = await me();
  if (!row.totpSecret) return { error: "Two-step sign-in isn't on." };
  const step = verifyTotp(row.totpSecret, String(form.get("code") ?? ""), Date.now(), row.totpLastStep);
  if (step === null) return { error: "That code isn't right." };
  const codes = newRecoveryCodes();
  await db.practitioner.update({ where: { id: user.id }, data: { recoveryCodes: codes.map(hashRecoveryCode), totpLastStep: step } });
  await logEvent({ action: "account", subject: "Two-step sign-in", actor: { id: user.id, username: user.username }, detail: "New recovery codes" });
  return { codes };
}

// Only where it isn't required (development and demos). Needs the password.
export async function turnOffTwoStep(_prev: TwoStepState, form: FormData): Promise<TwoStepState> {
  const { user, row } = await me();
  if (twoStepRequired) return { error: "Two-step sign-in is required on this site. An administrator can reset it if you've lost your phone." };
  if (!(await verifyPassword(String(form.get("password") ?? ""), row.passwordHash))) return { error: "Your password isn't right." };
  await db.practitioner.update({ where: { id: user.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [] } });
  await logEvent({ action: "account", subject: "Two-step sign-in", actor: { id: user.id, username: user.username }, detail: "Turned off" });
  return { ok: "Two-step sign-in is off." };
}

