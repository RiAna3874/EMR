"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/password";
import { passwordError } from "@/lib/accounts";
import { endOtherSessions, getCurrentUser } from "@/lib/session";
import { logEvent } from "@/lib/audit/server";

export type PasswordState = { error?: string; done?: boolean } | undefined;

// Uses getCurrentUser, not requireUser: someone on a temporary password must be able to get here.
export async function changePassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.locked) redirect("/lock");
  const current = String(form.get("current") ?? "");
  const next = String(form.get("password") ?? "");
  const row = await db.practitioner.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(current, row.passwordHash))) return { error: "Your current password isn't right." };
  const err = passwordError(next, user.username);
  if (err) return { error: err };
  if (next !== String(form.get("confirm") ?? "")) return { error: "The two new passwords don't match." };
  if (next === current) return { error: "Choose a password different from the current one." };
  const wasTemporary = row.mustChangePassword;
  await db.practitioner.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next), mustChangePassword: false } });
  await endOtherSessions(user.id);
  await logEvent({ action: "password_changed", subject: "Password", actor: { id: user.id, username: user.username }, detail: wasTemporary ? "Replaced a temporary password" : null });
  if (wasTemporary) redirect("/");
  return { done: true };
}
