import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getActiveUser } from "@/lib/session";
import { age, fmtDob, fullName, parseTypedDob, sexShort } from "@/lib/format";

// Patient lookup for the command palette: name (either order), MRN, DOB (DD/MM/YYYY),
// or phone number in any format (01711-123456, +880 1711 123456).
export async function GET(req: NextRequest) {
  if (!(await getActiveUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);

  const or: Prisma.PatientWhereInput[] = [{ mrn: { contains: q, mode: "insensitive" } }];
  const dob = parseTypedDob(q);
  if (dob) or.push({ dob });
  const words = q.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  or.push({
    AND: words.map((w) => ({ OR: [{ firstName: { startsWith: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }] })),
  });

  const digits = q.replace(/\D/g, "").replace(/^(880|0)/, "");
  if (digits.length >= 5 && digits.length * 2 >= q.replace(/\s/g, "").length) {
    const rows = await db.$queryRaw<{ id: string }[]>`SELECT id FROM "Patient" WHERE regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') LIKE ${`%${digits}%`} LIMIT 20`;
    if (rows.length) or.push({ id: { in: rows.map((r) => r.id) } });
  }

  // An old MRN from a merged duplicate still finds the patient.
  const merged = await db.patient.findFirst({ where: { mrn: { equals: q, mode: "insensitive" }, mergedIntoId: { not: null } }, select: { mergedIntoId: true } });
  if (merged?.mergedIntoId) or.push({ id: merged.mergedIntoId });
  const patients = await db.patient.findMany({ where: { OR: or }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 8 });
  return NextResponse.json(
    patients.map((p) => ({ id: p.id, name: fullName(p), detail: `${age(p.dob)} y ${sexShort(p.sex)} · ${fmtDob(p.dob)} · ${p.mrn}` })),
  );
}
