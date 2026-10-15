import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getActiveUser } from "@/lib/session";
import { logChartView } from "@/lib/audit/server";
import { searchChart } from "@/lib/search/chart";
import { isHitKind } from "@/lib/search/types";

// Search inside one chart, as you type: the search page and the ⌘K palette.
// What comes back is limited to what the user's role may see (src/lib/search/chart.ts).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const patient = await db.patient.findUnique({ where: { id }, select: { id: true, mergedIntoId: true } });
  if (!patient) return NextResponse.json({ error: "No such patient" }, { status: 404 });
  const patientId = patient.mergedIntoId ?? patient.id;

  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") ?? "";
  const limit = Math.min(200, Math.max(1, Number(sp.get("limit")) || 200));
  const result = await searchChart(patientId, user, sp.get("q") ?? "", { limit, kind: isHitKind(kind) ? kind : undefined });
  // The access log records that the chart was searched, never what for.
  if (result.query) await logChartView(patientId, "Search");
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
