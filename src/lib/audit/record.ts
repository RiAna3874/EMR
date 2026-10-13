import "server-only";
import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { cache } from "react";
import { MODEL_LABELS, UNLOGGED_MODELS, changedFields, parentOf, patientOf, writeAction, type AuditAction } from "./labels";

// Writes access-log rows. Takes the plain (unlogged) Prisma client, so writing the log
// doesn't log itself. The session cookie name matches src/lib/session.ts.
const SESSION_COOKIE = "meridian_session";

export type Actor = { id: string; username: string | null };
export type AuditEntry = {
  action: AuditAction;
  subject: string;
  actor?: Actor | null;
  patientId?: string | null;
  recordId?: string | null;
  detail?: string | null;
};

// The caller's address, as the host's proxy reports it.
export async function requestIp(): Promise<string | null> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  } catch {
    return null; // not in a request (scripts, seed)
  }
}

// Whoever is signed in on this request, or null outside a request or when signed out.
const requestActor = cache(async (base: PrismaClient): Promise<Actor | null> => {
  try {
    const { cookies } = await import("next/headers");
    const token = (await cookies()).get(SESSION_COOKIE)?.value;
    if (!token) return null;
    const id = createHash("sha256").update(token).digest("hex");
    const session = await base.session.findUnique({ where: { id }, select: { practitioner: { select: { id: true, username: true } } } });
    return session?.practitioner ?? null;
  } catch {
    return null;
  }
});

export async function recordAudit(base: PrismaClient, entry: AuditEntry) {
  const actor = entry.actor === undefined ? await requestActor(base) : entry.actor;
  await base.auditEvent.create({
    data: {
      action: entry.action,
      subject: entry.subject,
      actorId: actor?.id ?? null,
      actorName: actor?.username ?? null,
      patientId: entry.patientId ?? null,
      recordId: entry.recordId ?? null,
      detail: entry.detail?.slice(0, 500) ?? null,
      ip: await requestIp(),
    },
  });
}

// Called by the Prisma extension in src/lib/db.ts after every successful write.
// Only writes made by a signed-in person are logged; the seed and scripts have no one signed in.
export async function recordWrite(base: PrismaClient, model: string, operation: string, args: Record<string, unknown> | undefined, result: unknown) {
  const action = writeAction(operation);
  if (!action || UNLOGGED_MODELS.has(model)) return;
  const actor = await requestActor(base);
  if (!actor) return;

  const one = result && typeof result === "object" && !Array.isArray(result) ? (result as Record<string, unknown>) : null;
  const recordId = typeof one?.id === "string" ? one.id : null;
  const count = typeof one?.count === "number" ? one.count : Array.isArray(result) ? result.length : null;
  const subject = MODEL_LABELS[model] ?? model;

  // createMany may span patients; log one row per patient.
  if (Array.isArray(args?.data)) {
    const rows = args.data as Record<string, unknown>[];
    const byPatient = new Map<string | null, number>();
    for (const r of rows) {
      const p = typeof r.patientId === "string" ? r.patientId : null;
      byPatient.set(p, (byPatient.get(p) ?? 0) + 1);
    }
    for (const [patientId, n] of byPatient) await recordAudit(base, { action, subject, actor, patientId, detail: `${n} ${n === 1 ? "record" : "records"}` });
    return;
  }

  let patientId = patientOf(model, args, result);
  if (!patientId) {
    const parent = parentOf(model, args, result);
    if (parent) {
      const where = { where: { id: parent.id }, select: { patientId: true } } as const;
      const row =
        parent.model === "Encounter"
          ? await base.encounter.findUnique(where)
          : parent.model === "Note"
            ? await base.note.findUnique(where)
            : await base.conversation.findUnique(where);
      patientId = row?.patientId ?? null;
    }
  }
  const fields = action === "update" ? changedFields(operation === "upsert" ? args?.update : args?.data) : null;
  const detail = [fields, count !== null && count !== 1 ? `${count} records` : null].filter(Boolean).join(" · ") || null;
  if (count === 0) return; // an updateMany or deleteMany that matched nothing changed nothing
  await recordAudit(base, { action, subject, actor, patientId, recordId, detail });
}
