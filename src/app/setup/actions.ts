"use server";

import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { passwordError, usernameError } from "@/lib/accounts";
import { roleLabel } from "@/lib/roles";
import { startSession } from "@/lib/session";
import { SETUP_LOCK, setupTokenMatches } from "@/lib/setup";

export type SetupState = { error?: string; values?: Record<string, string> } | undefined;

export async function createFirstAdmin(_prev: SetupState, form: FormData): Promise<SetupState> {
  const get = (k: string) => String(form.get(k) ?? "").trim();
  const values = { name: get("name"), credentials: get("credentials"), role: get("role"), username: get("username").toLowerCase() };
  const password = String(form.get("password") ?? "");
  const fail = (error: string) => ({ error, values });

  if (!setupTokenMatches(String(form.get("token") ?? ""))) return fail("That setup code isn't right. It's the MERIDIAN_SETUP_TOKEN value set on the server.");
  if (!values.name) return fail("Enter your name.");
  if (!(values.role in roleLabel)) return fail("Choose your role.");
  const err = usernameError(values.username) ?? passwordError(password, values.username);
  if (err) return fail(err);
  if (password !== String(form.get("confirm") ?? "")) return fail("The two passwords don't match.");

  const passwordHash = await hashPassword(password);
  const created = await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SETUP_LOCK})`;
    if ((await tx.practitioner.count({ where: { username: { not: null } } })) > 0) return null;
    return tx.practitioner.create({
      data: { name: values.name, credentials: values.credentials || null, role: values.role as Role, username: values.username, passwordHash, isAdmin: true },
    });
  });
  if (!created) redirect("/login");
  await startSession(created.id);
  redirect("/admin/users?welcome=1");
}
