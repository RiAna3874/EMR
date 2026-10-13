import "server-only";
import { db } from "@/lib/db";
import { findDuplicates } from "./registration";

// Existing patients who might be the person being registered. The query is broad
// (same date of birth, or the same name in either order); findDuplicates decides.
export async function possibleDuplicates(input: { firstName: string; lastName: string; dob: Date }) {
  const name = (first: string, last: string) => ({
    firstName: { equals: first, mode: "insensitive" as const },
    lastName: { equals: last, mode: "insensitive" as const },
  });
  const candidates = await db.patient.findMany({
    where: { OR: [{ dob: input.dob }, name(input.firstName, input.lastName), name(input.lastName, input.firstName)] },
    select: { id: true, mrn: true, firstName: true, lastName: true, dob: true, sex: true, phone: true, address: true },
    take: 200,
  });
  return findDuplicates(input, candidates);
}

// The next medical record number, from a database sequence so two desks
// registering at once can't get the same one.
export async function nextMrn() {
  const [row] = await db.$queryRaw<{ n: string }[]>`SELECT nextval('patient_mrn_seq')::text AS n`;
  return `M${row.n}`;
}
