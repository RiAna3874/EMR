"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { FIELDS, parseDob, validateRegistration, type FieldErrors } from "@/lib/registration/registration";
import { nextMrn, possibleDuplicates } from "@/lib/registration/server";

export type DuplicateRow = {
  id: string;
  mrn: string;
  name: string;
  dob: string;
  sex: string;
  phone: string | null;
  address: string | null;
  strength: "exact" | "likely" | "possible";
  reason: string;
};

export type RegisterState = { errors?: FieldErrors; error?: string; duplicates?: DuplicateRow[] } | undefined;

async function duplicateRows(input: { firstName: string; lastName: string; dob: Date }): Promise<DuplicateRow[]> {
  const matches = await possibleDuplicates(input);
  return matches.map(({ patient: p, strength, reason }) => ({
    id: p.id,
    mrn: p.mrn,
    name: `${p.lastName}, ${p.firstName}`,
    dob: p.dob.toISOString().slice(0, 10),
    sex: p.sex,
    phone: p.phone,
    address: p.address,
    strength,
    reason,
  }));
}

// The live duplicate check on the form, run as soon as name and date of birth are filled in.
export async function checkDuplicates(firstName: string, lastName: string, dob: string): Promise<DuplicateRow[]> {
  await requirePermission("registerPatients");
  const date = parseDob(dob);
  if (!firstName.trim() || !lastName.trim() || !date) return [];
  return duplicateRows({ firstName: firstName.trim(), lastName: lastName.trim(), dob: date });
}

export async function registerPatient(_prev: RegisterState, form: FormData): Promise<RegisterState> {
  const user = await requirePermission("registerPatients");
  const result = validateRegistration(Object.fromEntries(FIELDS.map((k) => [k, String(form.get(k) ?? "")])));
  if (!result.ok) return { errors: result.errors, error: "Check the highlighted fields." };
  const v = result.value;

  const [pcp, pharmacy] = await Promise.all([
    v.pcpId ? db.practitioner.findFirst({ where: { id: v.pcpId, role: "physician", active: true } }) : null,
    v.preferredPharmacyId ? db.pharmacy.findUnique({ where: { id: v.preferredPharmacyId } }) : null,
  ]);
  if (v.pcpId && !pcp) return { errors: { pcpId: "Choose a physician from the list." } };
  if (v.preferredPharmacyId && !pharmacy) return { errors: { preferredPharmacyId: "Choose a pharmacy from the list." } };

  // Possible duplicates block registration until the registrar has looked at every
  // one of them and confirmed this is someone else.
  const duplicates = await duplicateRows(v);
  const seen = new Set(String(form.get("seenDuplicates") ?? "").split(",").filter(Boolean));
  const confirmed = form.get("notDuplicate") === "on" && duplicates.every((d) => seen.has(d.id));
  if (duplicates.length && !confirmed) {
    const exact = duplicates.some((d) => d.strength === "exact");
    return {
      duplicates,
      error: exact
        ? "A patient with this name and date of birth is already registered. Open their chart instead, or confirm this is a different person."
        : "Check the possible matches before creating a new record.",
    };
  }
  const duplicateCheckNote = duplicates.length ? `Checked against possible duplicates: ${duplicates.map((d) => `${d.mrn} (${d.reason.toLowerCase()})`).join("; ")}` : null;

  let patientId = "";
  for (let attempt = 0; !patientId; attempt++) {
    try {
      const created = await db.patient.create({ data: { ...v, mrn: await nextMrn(), registeredById: user.id, duplicateCheckNote } });
      patientId = created.id;
    } catch (e) {
      // An MRN already taken (e.g. entered by hand before the sequence existed): take the next one.
      if (attempt < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") continue;
      throw e;
    }
  }
  revalidatePath("/patients");
  redirect(form.get("returnTo") === "book" ? `/schedule/book?patient=${patientId}` : `/patients/${patientId}?registered=1`);
}
