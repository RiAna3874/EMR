import type { EncounterType } from "@prisma/client";

// What an appointment is for. The length sets how much of the schedule it takes;
// `type` is the encounter type it creates.
export type VisitType = { id: string; label: string; minutes: number; type: EncounterType; color: string };

export const VISIT_TYPES: VisitType[] = [
  { id: "follow_up", label: "Follow-up", minutes: 20, type: "office", color: "#0f8a8a" },
  { id: "same_day", label: "Same-day sick", minutes: 20, type: "office", color: "#c2410c" },
  { id: "new_patient", label: "New patient", minutes: 40, type: "office", color: "#7c3aed" },
  { id: "annual", label: "Annual wellness", minutes: 40, type: "office", color: "#15803d" },
  { id: "procedure", label: "Procedure", minutes: 40, type: "office", color: "#a16207" },
  { id: "consult", label: "Consult", minutes: 40, type: "office", color: "#1d4ed8" },
  { id: "video", label: "Video visit", minutes: 20, type: "telehealth", color: "#0e7490" },
];

const byId = new Map(VISIT_TYPES.map((v) => [v.id, v]));

export const visitType = (id: string): VisitType => byId.get(id) ?? VISIT_TYPES[0];
export const isVisitType = (id: string) => byId.has(id);

// The clinic's exam rooms, offered when a nurse rooms a patient.
export const ROOMS = ["Exam 1", "Exam 2", "Exam 3", "Exam 4", "Exam 5", "Exam 6", "Procedure"];

export const CANCEL_REASONS = ["Patient request", "Patient ill", "Provider unavailable", "Weather", "Scheduled in error", "Other"];
