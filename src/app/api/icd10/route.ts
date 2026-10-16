import { NextResponse, type NextRequest } from "next/server";
import { getActiveUser } from "@/lib/session";
import { checkIcd10, searchIcd10 } from "@/lib/icd10/codes";

// ICD-10-CM for the diagnosis pickers: ?q= searches complete codes by code or words;
// ?codes=A,B checks each code (complete, needs more characters, or not a code).
export async function GET(req: NextRequest) {
  if (!(await getActiveUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const p = req.nextUrl.searchParams;
  const codes = p.get("codes");
  if (codes !== null) {
    const list = [...new Set(codes.split(",").map((c) => c.trim()).filter(Boolean))].slice(0, 50);
    return NextResponse.json(Object.fromEntries(list.map((c) => [c, checkIcd10(c.slice(0, 12))])));
  }
  return NextResponse.json(searchIcd10((p.get("q") ?? "").slice(0, 120)));
}
