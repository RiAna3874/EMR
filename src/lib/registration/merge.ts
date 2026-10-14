import "server-only";
import type { Patient } from "@prisma/client";
import type { Tx } from "@/lib/db";

// Every chart record that belongs to a patient. The access log is left as it was:
// it is append-only and records what happened to the duplicate chart at the time.
const MOVED = [
  "encounter",
  "condition",
  "allergyIntolerance",
  "medicationRequest",
  "medicationDispense",
  "refillRequest",
  "observation",
  "diagnosticReport",
  "note",
  "documentReference",
  "importJob",
  "serviceRequest",
  "clinicalDocument",
  "conversation",
  "encounterDiagnosis",
] as const;

// Contact and coverage details the kept chart takes from the duplicate when it has none.
const FILL_BLANKS = [
  "middleName", "preferredName", "phone", "email", "address", "emergencyContactName", "emergencyContactRelation", "emergencyContactPhone",
  "pcpId", "preferredPharmacyId", "insurancePayer", "insuranceMemberId", "insuranceGroup", "subscriberName", "subscriberRelation",
] as const;

export type MergeCounts = Record<(typeof MOVED)[number], number>;

// Moves everything from `from` to `into` and retires `from`. Name, date of birth, sex and
// MRN stay as the kept chart has them.
export async function mergeCharts(tx: Tx, from: Patient, into: Patient, userId: string): Promise<MergeCounts> {
  const counts = {} as MergeCounts;
  for (const model of MOVED) {
    // The models share the patientId column; Prisma's per-model types don't share a signature.
    const delegate = tx[model] as unknown as { updateMany: (a: { where: { patientId: string }; data: { patientId: string } }) => Promise<{ count: number }> };
    counts[model] = (await delegate.updateMany({ where: { patientId: from.id }, data: { patientId: into.id } })).count;
  }
  const fill = Object.fromEntries(FILL_BLANKS.filter((k) => !into[k] && from[k]).map((k) => [k, from[k]]));
  const allergies = await tx.allergyIntolerance.count({ where: { patientId: into.id } });
  const allergyStatus =
    allergies > 0 ? "has_allergies" : into.allergyStatus === "no_known_allergies" || from.allergyStatus === "no_known_allergies" ? "no_known_allergies" : "not_reviewed";
  await tx.patient.update({ where: { id: into.id }, data: { ...fill, allergyStatus } });
  await tx.patient.update({ where: { id: from.id, mergedIntoId: null }, data: { mergedIntoId: into.id, mergedAt: new Date(), mergedById: userId } });
  return counts;
}
