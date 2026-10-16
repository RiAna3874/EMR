import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isPhone, phoneEquivalent, VIEW_COOKIE } from "@/lib/phone-view";
import { requireUser } from "@/lib/session";
import { can, type Permission, type SessionUser } from "@/lib/roles";

// As requirePermission (src/lib/session.ts), but a user without it stays in the phone view.
export async function requirePhonePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect(`/m?denied=${permission}`);
  return user;
}

// Where to go after signing in or unlocking. A form's redirect skips the middleware, so a phone
// returning to a full-site address is sent to its phone screen here instead.
export async function landingPath(next: string): Promise<string> {
  const [h, jar] = await Promise.all([headers(), cookies()]);
  if (jar.get(VIEW_COOKIE)?.value === "desktop" || !isPhone(h.get("user-agent") ?? "")) return next;
  const url = new URL(next, "http://local");
  return phoneEquivalent(url.pathname, url.searchParams) ?? next;
}
