import { NextResponse } from "next/server";
import { getActiveUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { chatBadge } from "@/lib/chat/server";

export const dynamic = "force-dynamic";

// Polled by the top bar so the Messages badge and urgent alert stay current on every screen.
export async function GET() {
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!can(user.role, "useChat")) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  return NextResponse.json(await chatBadge(user.id), { headers: { "Cache-Control": "no-store" } });
}
