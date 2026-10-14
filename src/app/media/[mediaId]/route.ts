import { db } from "@/lib/db";
import { getActiveUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { logChartView } from "@/lib/audit/server";

// Serves a Media tab item to clinical staff: the full file, or ?size=thumb for the grid.
// Opening the full file is logged; the grid's thumbnails are covered by the Media tab's own entry.
export async function GET(req: Request, { params }: { params: Promise<{ mediaId: string }> }) {
  const user = await getActiveUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!can(user.role, "viewClinical")) return new Response("Forbidden", { status: 403 });
  const { mediaId } = await params;
  const thumb = new URL(req.url).searchParams.get("size") === "thumb";
  const item = await db.mediaItem.findUnique({ where: { id: mediaId }, select: { patientId: true, title: true, fileName: true, mimeType: true, size: true } });
  if (!item) return new Response("Not found", { status: 404 });
  if (thumb) {
    const t = await db.mediaItem.findUniqueOrThrow({ where: { id: mediaId }, select: { thumb: true } });
    if (t.thumb) {
      return new Response(new Uint8Array(t.thumb), {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
      });
    }
  }
  const full = await db.mediaItem.findUniqueOrThrow({ where: { id: mediaId }, select: { data: true } });
  if (!thumb) await logChartView(item.patientId, `Media: ${item.title}`);
  const ext = item.fileName.match(/\.[a-z0-9]+$/i)?.[0] ?? "";
  const name = `${item.title}${ext}`.replace(/[^\w.\- ]/g, "_");
  return new Response(new Uint8Array(full.data), {
    headers: {
      "Content-Type": item.mimeType,
      "Content-Length": String(item.size),
      "Content-Disposition": `${new URL(req.url).searchParams.has("download") ? "attachment" : "inline"}; filename="${name}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
