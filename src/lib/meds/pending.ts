import "server-only";
import { db } from "@/lib/db";

// Current medications that already have a refill or change waiting in the order basket.
export async function pendingReplacements(patientId: string) {
  const pending = await db.serviceRequest.findMany({ where: { patientId, status: "pending", type: "medication" }, select: { details: true } });
  return new Set(pending.map((p) => (p.details as { replacesId?: string | null } | null)?.replacesId).filter((x): x is string => !!x));
}
