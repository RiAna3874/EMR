import "server-only";
import type { Prisma } from "@prisma/client";
import { baseDb } from "@/lib/db";
import { parseLocalDate } from "@/lib/format";
import { isAuditAction } from "./labels";

// Filters for /admin/access-log and its CSV download, from the page's query string.
export type LogFilters = { patient?: string; q?: string; user?: string; action?: string; from?: string; to?: string };

const SIGN_IN_ACTIONS = ["sign_in", "sign_in_failed", "two_step_failed", "recovery_code_used", "sign_out"];
const ACCOUNT_ACTIONS = ["password_changed", "two_step_on", "account", "setup", "export"];

// Action groups for the filter menu, then single actions.
export const ACTION_GROUPS: Record<string, { label: string; actions: string[] }> = {
  chart: { label: "Any chart access", actions: ["view", "print", "create", "update", "delete"] },
  changes: { label: "Chart changes", actions: ["create", "update", "delete"] },
  signin: { label: "Sign-ins", actions: SIGN_IN_ACTIONS },
  failed: { label: "Failed sign-ins", actions: ["sign_in_failed", "two_step_failed"] },
  accounts: { label: "Account changes", actions: ACCOUNT_ACTIONS },
};

export async function logWhere(f: LogFilters): Promise<{ where: Prisma.AuditEventWhereInput; patientIds: string[] | null }> {
  const where: Prisma.AuditEventWhereInput = {};
  let patientIds: string[] | null = null;
  if (f.patient) patientIds = [f.patient];
  else if (f.q?.trim()) {
    // An MRN, or part of a name ("khan", "rahim khan").
    const words = f.q.trim().split(/[\s,]+/).filter(Boolean).slice(0, 3);
    const found = await baseDb.patient.findMany({
      where: { OR: [{ mrn: { equals: f.q.trim(), mode: "insensitive" } }, { AND: words.map((w) => ({ OR: [{ firstName: { contains: w, mode: "insensitive" } }, { lastName: { contains: w, mode: "insensitive" } }] })) }] },
      select: { id: true },
      take: 50,
    });
    patientIds = found.map((p) => p.id);
  }
  if (patientIds) where.patientId = { in: patientIds };
  if (f.user) where.actorId = f.user;
  if (f.action) {
    const group = ACTION_GROUPS[f.action];
    if (group) where.action = { in: group.actions };
    else if (isAuditAction(f.action)) where.action = f.action;
  }
  const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
  const from = isDate(f.from) ? parseLocalDate(f.from) : null;
  const to = isDate(f.to) ? parseLocalDate(f.to) : null;
  if (from || to) where.at = { ...(from ? { gte: from } : {}), ...(to ? { lt: new Date(to.getTime() + 86_400_000) } : {}) };
  return { where, patientIds };
}

// Names for the ids on a page of entries. The log itself keeps only ids and usernames.
export async function namesFor(rows: { actorId: string | null; patientId: string | null }[]) {
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))];
  const patientIds = [...new Set(rows.map((r) => r.patientId).filter((x): x is string => !!x))];
  const [actors, patients] = await Promise.all([
    baseDb.practitioner.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, credentials: true, role: true } }),
    baseDb.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, firstName: true, lastName: true, mrn: true } }),
  ]);
  return { actors: new Map(actors.map((a) => [a.id, a])), patients: new Map(patients.map((p) => [p.id, p])) };
}
