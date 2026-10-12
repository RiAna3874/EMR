import { NextResponse, type NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { age, fmtDob, fullName, sexShort } from "@/lib/format";

// Patient lookup for the command palette: name (either order), MRN, or DOB (MM/DD/YYYY).
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json([]);

  const or: Prisma.PatientWhereInput[] = [{ mrn: { contains: q, mode: "insensitive" } }];
  const dob = q.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dob) or.push({ dob: new Date(Date.UTC(+dob[3], +dob[1] - 1, +dob[2])) });
  const words = q.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  or.push({
    AND: words.map((w) => ({ OR: [{ firstName: { startsWith: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }] })),
  });

  const patients = await db.patient.findMany({ where: { OR: or }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 8 });
  return NextResponse.json(
    patients.map((p) => ({ id: p.id, name: fullName(p), detail: `${age(p.dob)} y ${sexShort(p.sex)} · ${fmtDob(p.dob)} · ${p.mrn}` })),
  );
}
