import "server-only";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { smartTextFor } from "@/lib/smart-text";
import { fmtDate } from "@/lib/format";
import { systemPhrases } from "./library";
import { findProblemPlan, type Phrase } from "./smarttext";

// System phrases plus the clinician's own; theirs win on a name clash.
export async function phrasesFor(userId: string): Promise<Phrase[]> {
  const mine = await db.smartPhrase.findMany({ where: { ownerId: userId }, orderBy: { name: "asc" } });
  const byName = new Map<string, Phrase>(systemPhrases.map((p) => [p.name, p]));
  for (const p of mine) byName.set(p.name, { name: p.name, description: p.description, body: p.body, mine: true });
  return [...byName.values()].sort((a, b) => Number(!!b.mine) - Number(!!a.mine) || a.name.localeCompare(b.name));
}

export type EditorProblem = { id: string; display: string; code: string; lastPlan: string | null; lastPlanDate: string | null };

// Everything the note editor needs besides the note itself.
export async function editorContext(patientId: string) {
  const [links, phrases, conditions, recent, encounters, cosigners] = await Promise.all([
    smartTextFor(patientId),
    phrasesFor(currentUser.id),
    db.condition.findMany({ where: { patientId, status: "active" }, orderBy: { priority: "asc" } }),
    db.note.findMany({ where: { patientId, status: { not: "draft" } }, orderBy: { serviceAt: "desc" }, take: 10, select: { body: true, serviceAt: true } }),
    db.encounter.findMany({ where: { patientId, status: { not: "cancelled" }, start: { lte: new Date(new Date().setHours(24, 0, 0, 0)) } }, orderBy: { start: "desc" }, take: 8 }),
    db.practitioner.findMany({ where: { role: "physician", id: { not: currentUser.id } }, orderBy: { name: "asc" } }),
  ]);

  // Problem-based charting: show what was last written for each problem so it can be carried forward.
  const problems: EditorProblem[] = conditions.map((c) => {
    for (const n of recent) {
      const plan = findProblemPlan(n.body, c);
      if (plan) return { id: c.id, display: c.display, code: c.code, lastPlan: plan, lastPlanDate: fmtDate(n.serviceAt) };
    }
    return { id: c.id, display: c.display, code: c.code, lastPlan: null, lastPlanDate: null };
  });

  return {
    links,
    phrases,
    problems,
    encounters: encounters.map((e) => ({ id: e.id, label: `${fmtDate(e.start)} · ${e.type === "office" ? "Office visit" : e.type === "telehealth" ? "Telehealth" : "Phone"}${e.reason ? ` · ${e.reason}` : ""}`, start: e.start.toISOString() })),
    cosigners: cosigners.map((p) => ({ id: p.id, label: `${p.name}, ${p.credentials ?? ""}`.replace(/, $/, "") })),
  };
}

export type EditorContext = Awaited<ReturnType<typeof editorContext>>;
