import { NextResponse, type NextRequest } from "next/server";
import { baseDb } from "@/lib/db";
import { getActiveUser } from "@/lib/session";
import { drugInfo } from "@/lib/meds/drug-label-server";

// The openFDA prescribing label for a medication name, for the Drug info panel.
export async function GET(req: NextRequest) {
  if (!(await getActiveUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const drug = (req.nextUrl.searchParams.get("drug") ?? "").trim().slice(0, 200);
  return NextResponse.json(await drugInfo(baseDb, drug));
}
