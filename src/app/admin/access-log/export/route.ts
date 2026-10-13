import { baseDb } from "@/lib/db";
import { getActiveUser } from "@/lib/session";
import { AUDIT_ACTIONS, isAuditAction } from "@/lib/audit/labels";
import { logWhere, namesFor } from "@/lib/audit/query";
import { logEvent } from "@/lib/audit/server";

const MAX_ROWS = 50_000;

const csv = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Quote everything; a leading = + - @ is defused so spreadsheets don't run it as a formula.
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`;
};

// The access log as a spreadsheet, with the page's filters. For a privacy complaint or review.
export async function GET(req: Request) {
  const user = await getActiveUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  if (!user.isAdmin) return new Response("Forbidden", { status: 403 });
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const { where } = await logWhere(params);
  const rows = await baseDb.auditEvent.findMany({ where, orderBy: [{ at: "desc" }, { id: "desc" }], take: MAX_ROWS });
  const { actors, patients } = await namesFor(rows);
  const lines = [["Time (UTC)", "Username", "Staff name", "Action", "What", "Patient MRN", "Patient name", "Details", "IP address", "Record id"].map(csv).join(",")];
  for (const r of rows) {
    const a = r.actorId ? actors.get(r.actorId) : null;
    const p = r.patientId ? patients.get(r.patientId) : null;
    lines.push(
      [r.at.toISOString(), r.actorName, a?.name, isAuditAction(r.action) ? AUDIT_ACTIONS[r.action] : r.action, r.subject, p?.mrn, p ? `${p.lastName}, ${p.firstName}` : "", r.detail, r.ip, r.recordId]
        .map(csv)
        .join(","),
    );
  }
  await logEvent({
    action: "export",
    subject: "Access log",
    actor: { id: user.id, username: user.username },
    detail: `${rows.length} entries${new URLSearchParams(params).toString() ? ` · ${new URLSearchParams(params).toString().slice(0, 200)}` : ""}`,
  });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="meridian-access-log-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
