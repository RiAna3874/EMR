import "server-only";
import { baseDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { recordAudit, type Actor, type AuditEntry } from "./record";

// Explicit access-log entries: chart views and prints, sign-ins, account changes.
// Chart changes are logged on their own by the client in src/lib/db.ts.

// Pages re-render after every save; one view per person, chart and section in this window is enough.
const VIEW_REPEAT_MS = 5 * 60 * 1000;

export async function logChartView(patientId: string, section: string, action: "view" | "print" = "view") {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    if (action === "view") {
      const recent = await baseDb.auditEvent.findFirst({
        where: { actorId: user.id, patientId, subject: section, action, at: { gte: new Date(Date.now() - VIEW_REPEAT_MS) } },
        select: { id: true },
      });
      if (recent) return;
    }
    await recordAudit(baseDb, { action, subject: section, patientId, actor: { id: user.id, username: user.username } });
  } catch (e) {
    console.error("Access log: couldn't record a chart view", e);
  }
}

// For sign-in (before there's a session) and account changes. Pass actor: null for an unknown username.
export async function logEvent(entry: AuditEntry & { actor?: Actor | null }) {
  try {
    await recordAudit(baseDb, entry);
  } catch (e) {
    console.error("Access log: couldn't record an event", e);
  }
}
