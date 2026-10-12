"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { endSession, safeNext, startSession } from "@/lib/session";

// Brief lockout after repeated failures for one username (per server process).
const failures = new Map<string, { count: number; until: number }>();
const MAX_FAILURES = 5;
const LOCKOUT_MS = 60_000;


type SignInState = { error?: string; username?: string } | undefined;

export async function signIn(_prev: SignInState, form: FormData): Promise<SignInState> {
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(String(form.get("next") ?? "/"));
  if (!username || !password) return { error: "Enter your username and password.", username };

  const f = failures.get(username);
  if (f && f.until > Date.now()) return { error: "Too many attempts. Wait a minute and try again.", username };

  const user = await db.practitioner.findUnique({ where: { username } });
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    const count = (f?.count ?? 0) + 1;
    failures.set(username, count >= MAX_FAILURES ? { count: 0, until: Date.now() + LOCKOUT_MS } : { count, until: 0 });
    return { error: "That username and password don't match.", username };
  }
  failures.delete(username);
  await startSession(user.id);
  redirect(next);
}

export async function signOut() {
  await endSession();
  redirect("/login");
}
