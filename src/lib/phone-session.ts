import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { can, type Permission, type SessionUser } from "@/lib/roles";

// As requirePermission (src/lib/session.ts), but a user without it stays in the phone view.
export async function requirePhonePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect(`/m?denied=${permission}`);
  return user;
}
