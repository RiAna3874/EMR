import { db } from "@/lib/db";
import { getActiveUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { logChartView } from "@/lib/audit/server";

// Serves an uploaded document's bytes to clinical staff.
export async function GET(_req: Request, { params }: { params: Promise<{ docId: string }> }) {
  const user = await getActiveUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!can(user.role, "viewClinical")) return new Response("Forbidden", { status: 403 });
  const { docId } = await params;
  const doc = await db.documentReference.findUnique({ where: { id: docId } });
  if (!doc) return new Response("Not found", { status: 404 });
  await logChartView(doc.patientId, "Uploaded file");
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.size),
      "Content-Disposition": `inline; filename="${doc.fileName.replace(/[^\w.\- ]/g, "_")}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
