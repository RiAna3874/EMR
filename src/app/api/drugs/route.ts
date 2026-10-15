import { NextResponse, type NextRequest } from "next/server";
import { baseDb } from "@/lib/db";
import { getActiveUser } from "@/lib/session";
import { searchRegistered } from "@/lib/meds/dgda-server";

// Brand search over the DGDA registered drug list, for Prescribe and outside medications.
export async function GET(req: NextRequest) {
  if (!(await getActiveUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
  return NextResponse.json(await searchRegistered(baseDb, q));
}
