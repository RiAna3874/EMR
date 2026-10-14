import type { EncounterStatus, NoteStatus } from "@prisma/client";

// What still stands between a visit and "Sign and close visit". Blockers stop it;
// warnings are shown but don't.
export type CloseCheck = {
  diagnoses: number;
  notes: { status: NoteStatus }[]; // the visit's notes (entered-in-error ones are already hidden)
  pendingOrders: number;
  status: EncounterStatus;
};

export const OPEN_STATUSES: EncounterStatus[] = ["arrived", "roomed", "in_progress"];

export function closeBlockers(c: CloseCheck): string[] {
  const out: string[] = [];
  if (!OPEN_STATUSES.includes(c.status)) out.push(c.status === "planned" ? "The patient hasn't been checked in." : "This visit isn't open.");
  if (c.diagnoses === 0) out.push("Add at least one diagnosis for this visit.");
  if (c.notes.length === 0) out.push("Write a note for this visit.");
  else if (!c.notes.some((n) => n.status !== "draft")) out.push("Sign the visit note.");
  return out;
}

export function closeWarnings(c: CloseCheck): string[] {
  return c.pendingOrders ? [`${c.pendingOrders} pending ${c.pendingOrders === 1 ? "order isn't" : "orders aren't"} signed. They stay pending after the visit closes.`] : [];
}
