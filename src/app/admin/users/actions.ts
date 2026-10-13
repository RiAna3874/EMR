"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { temporaryPassword, usernameError } from "@/lib/accounts";
import { roleLabel } from "@/lib/roles";
import { requireAdmin } from "@/lib/session";
import { logEvent } from "@/lib/audit/server";

// The result banner on /admin/users. A temporary password is shown once, here, and never stored in clear.
export type AdminState = { ok?: string; error?: string; temp?: { username: string; password: string } } | undefined;

const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const isRole = (r: string): r is Role => r in roleLabel;

const logAccount = (admin: { id: string; username: string }, detail: string, recordId?: string) =>
  logEvent({ action: "account", subject: "Staff account", actor: admin, recordId, detail });

export async function addAccount(_prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const name = str(form, "name");
  const username = str(form, "username").toLowerCase();
  const role = str(form, "role");
  if (!name) return { error: "Enter the person's full name." };
  if (!isRole(role)) return { error: "Choose a role." };
  const err = usernameError(username);
  if (err) return { error: err };
  if (await db.practitioner.findUnique({ where: { username } })) return { error: `The username ${username} is taken.` };
  const password = temporaryPassword();
  const created = await db.practitioner.create({
    data: {
      name,
      credentials: str(form, "credentials") || null,
      role,
      username,
      isAdmin: form.get("isAdmin") === "on",
      passwordHash: await hashPassword(password),
      mustChangePassword: true,
    },
  });
  await logAccount(admin, `Added ${username} (${roleLabel[role]}${form.get("isAdmin") === "on" ? ", administrator" : ""})`, created.id);
  revalidatePath("/admin/users");
  return { ok: `Added ${name}.`, temp: { username, password } };
}

export async function manageAccount(_prev: AdminState, form: FormData): Promise<AdminState> {
  const admin = await requireAdmin();
  const op = str(form, "op");
  const target = await db.practitioner.findUnique({ where: { id: str(form, "id") } });
  if (!target || !target.username) return { error: "That account no longer exists." };
  // An admin can't lock themselves out, so there is always at least one active admin.
  const self = target.id === admin.id;

  switch (op) {
    case "resetPassword": {
      const password = temporaryPassword();
      await db.$transaction([
        db.practitioner.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(password), mustChangePassword: true } }),
        db.session.deleteMany({ where: { practitionerId: target.id } }),
      ]);
      await logAccount(admin, `Reset password for ${target.username}`, target.id);
      revalidatePath("/admin/users");
      return { ok: `${target.name} has a new temporary password and is signed out everywhere.`, temp: { username: target.username, password } };
    }
    // Lost or replaced phone: they set two-step sign-in up again at their next sign-in.
    case "resetTwoStep":
      if (self) return { error: "You can't reset your own two-step sign-in. Ask another administrator, or use a recovery code." };
      await db.$transaction([
        db.practitioner.update({ where: { id: target.id }, data: { totpSecret: null, totpPendingSecret: null, totpEnabledAt: null, totpLastStep: null, recoveryCodes: [] } }),
        db.session.deleteMany({ where: { practitionerId: target.id } }),
      ]);
      await logAccount(admin, `Reset two-step sign-in for ${target.username}`, target.id);
      revalidatePath("/admin/users");
      return { ok: `${target.name}'s two-step sign-in is reset and they're signed out. They set it up again with their phone at their next sign-in.` };
    case "deactivate":
      if (self) return { error: "You can't deactivate your own account." };
      await db.$transaction([
        db.practitioner.update({ where: { id: target.id }, data: { active: false } }),
        db.session.deleteMany({ where: { practitionerId: target.id } }),
      ]);
      await logAccount(admin, `Deactivated ${target.username}`, target.id);
      revalidatePath("/admin/users");
      return { ok: `${target.name} can no longer sign in. Their chart history is kept.` };
    case "reactivate":
      await db.practitioner.update({ where: { id: target.id }, data: { active: true } });
      await logAccount(admin, `Reactivated ${target.username}`, target.id);
      revalidatePath("/admin/users");
      return { ok: `${target.name} can sign in again.` };
    case "makeAdmin":
    case "removeAdmin":
      if (self) return { error: "You can't change your own admin access. Ask another administrator." };
      await db.practitioner.update({ where: { id: target.id }, data: { isAdmin: op === "makeAdmin" } });
      await logAccount(admin, `${op === "makeAdmin" ? "Made" : "Removed"} administrator: ${target.username}`, target.id);
      revalidatePath("/admin/users");
      return { ok: op === "makeAdmin" ? `${target.name} is now an administrator.` : `${target.name} is no longer an administrator.` };
    case "edit": {
      const name = str(form, "name");
      const role = str(form, "role");
      if (!name) return { error: "Enter the person's full name." };
      if (!isRole(role)) return { error: "Choose a role." };
      await db.practitioner.update({ where: { id: target.id }, data: { name, role, credentials: str(form, "credentials") || null } });
      await logAccount(admin, `Edited ${target.username}${role !== target.role ? `: role ${roleLabel[target.role]} to ${roleLabel[role]}` : ""}`, target.id);
      revalidatePath("/admin/users");
      return { ok: `Saved ${name}.` };
    }
  }
  return { error: "Unknown action." };
}
