import "server-only";
import { db, type Tx } from "@/lib/db";
import { matchProblem } from "./link";

// The problem a new medication or order is for: the one picked, or else one the
// typed indication names. The indication defaults to the problem's name.
export async function problemLink(patientId: string, conditionId: string | null | undefined, indication: string | null | undefined, tx: Tx = db) {
  const problems = await tx.condition.findMany({ where: { patientId, status: "active" }, orderBy: { priority: "asc" }, select: { id: true, display: true } });
  const picked = (conditionId && problems.find((p) => p.id === conditionId)) || matchProblem(indication, problems);
  return { conditionId: picked?.id ?? null, indication: indication?.trim() || picked?.display || null };
}
