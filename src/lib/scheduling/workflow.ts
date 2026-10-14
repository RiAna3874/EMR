import type { EncounterStatus, EncounterType, Role } from "@prisma/client";
import { can, type Permission } from "@/lib/roles";

// The clinic day as a state machine. Each action moves an appointment from one
// of `from` to `to`, and needs a permission from src/lib/roles.ts.
//
//   planned ─arrive→ arrived ─room→ roomed ─start→ in_progress ─complete→ finished ─checkOut→ checked_out
//      │                └──────────start (video visits, or a provider rooming their own)──┘
//      ├─noShow→ no_show ─undoNoShow→ planned
//      └─cancel→ cancelled
export type WorkflowAction = "arrive" | "undoArrival" | "room" | "start" | "complete" | "checkOut" | "noShow" | "undoNoShow" | "cancel";

export const TRANSITIONS: Record<WorkflowAction, { from: EncounterStatus[]; to: EncounterStatus; needs: Permission; label: string }> = {
  arrive: { from: ["planned"], to: "arrived", needs: "checkIn", label: "Check in" },
  undoArrival: { from: ["arrived"], to: "planned", needs: "checkIn", label: "Undo check-in" },
  room: { from: ["arrived"], to: "roomed", needs: "roomPatients", label: "Room" },
  start: { from: ["arrived", "roomed"], to: "in_progress", needs: "seePatients", label: "Start visit" },
  complete: { from: ["in_progress"], to: "finished", needs: "seePatients", label: "Visit done" },
  checkOut: { from: ["finished"], to: "checked_out", needs: "checkIn", label: "Check out" },
  noShow: { from: ["planned"], to: "no_show", needs: "checkIn", label: "No show" },
  undoNoShow: { from: ["no_show"], to: "planned", needs: "checkIn", label: "Undo no-show" },
  cancel: { from: ["planned"], to: "cancelled", needs: "bookAppointments", label: "Cancel" },
};

export function canTransition(action: WorkflowAction, status: EncounterStatus, role: Role) {
  const t = TRANSITIONS[action];
  return t.from.includes(status) && can(role, t.needs);
}

// The one next step this role would normally take, shown as the row's button on My Day.
// An office visit is roomed by the nurse before the provider starts it; a provider
// can room their own patient by starting the visit, and a video visit goes straight in.
export function nextStep(status: EncounterStatus, type: EncounterType, role: Role): WorkflowAction | null {
  const order: WorkflowAction[] =
    status === "arrived" && (type !== "office" || can(role, "seePatients")) ? ["start"] : ["arrive", "room", "start", "complete", "checkOut"];
  return order.find((a) => canTransition(a, status, role)) ?? null;
}

export const statusLabel: Record<EncounterStatus, string> = {
  planned: "Scheduled",
  arrived: "Arrived",
  roomed: "Roomed",
  in_progress: "With provider",
  finished: "Visit done",
  checked_out: "Checked out",
  no_show: "No show",
  cancelled: "Cancelled",
};

// Statuses that hold a place on the schedule (a cancelled or no-show slot is free again).
export const ACTIVE_STATUSES: EncounterStatus[] = ["planned", "arrived", "roomed", "in_progress", "finished", "checked_out"];
// Patients physically in the clinic, waiting or being seen.
export const IN_CLINIC: EncounterStatus[] = ["arrived", "roomed", "in_progress", "finished"];

export const eventLabel: Record<string, string> = {
  booked: "Scheduled",
  rescheduled: "Rescheduled",
  arrive: "Checked in",
  undoArrival: "Check-in undone",
  room: "Roomed",
  start: "Visit started",
  complete: "Visit done",
  checkOut: "Checked out",
  noShow: "Marked no show",
  undoNoShow: "No-show undone",
  cancel: "Cancelled",
};

// "4 min", "1 h 12 min"
export function minutesLabel(ms: number) {
  const m = Math.max(0, Math.floor(ms / 60_000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

// How a visit fee was paid at check-in. Amounts are in taka (stored in paisa).
export const PAYMENT_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "bkash", label: "bKash" },
  { id: "nagad", label: "Nagad" },
  { id: "card", label: "Card" },
  { id: "waived", label: "Waived" },
] as const;

export function paymentText(paisa: number | null, method: string | null) {
  const label = PAYMENT_METHODS.find((m) => m.id === method)?.label ?? method;
  if (paisa) return `৳${(paisa / 100).toLocaleString("en-IN", { maximumFractionDigits: 2 })}${label ? ` (${label})` : ""}`;
  return method === "waived" ? "Waived" : "None collected";
}
