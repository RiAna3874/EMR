import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";

// First run: an empty database has no accounts, and /setup makes the first administrator.
// Once any account exists, /setup is closed for good.
export async function needsSetup(): Promise<boolean> {
  return (await db.practitioner.count({ where: { username: { not: null } } })) === 0;
}

// In production the setup page asks for MERIDIAN_SETUP_TOKEN, so whoever finds a
// freshly deployed site first can't make themselves its administrator.
export const setupTokenRequired = process.env.NODE_ENV === "production";
export const setupTokenConfigured = !!process.env.MERIDIAN_SETUP_TOKEN && process.env.MERIDIAN_SETUP_TOKEN.length >= 16;

export function setupTokenMatches(given: string): boolean {
  if (!setupTokenRequired) return true;
  if (!setupTokenConfigured) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(given), digest(process.env.MERIDIAN_SETUP_TOKEN!));
}

// Serialises account creation at /setup so two people can't both become the first admin.
export const SETUP_LOCK = 724_001;
