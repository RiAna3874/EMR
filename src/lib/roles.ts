import type { Role } from "@prisma/client";

// What each role may see and do. Server actions and pages check these; the UI
// hides what a role can't use, but the server check is the one that counts.
export const PERMISSIONS = {
  // Clinical chart: results, vitals, notes, orders, imports, printing.
  viewClinical: ["physician", "resident", "nurse"],
  // Vitals and allergies are routinely entered by nursing.
  recordVitals: ["physician", "resident", "nurse"],
  editAllergies: ["physician", "resident", "nurse"],
  // Problems and the medication list are prescriber decisions.
  editProblems: ["physician", "resident"],
  editMeds: ["physician", "resident"],
  // Medication review at rooming: what the patient actually takes, outside and
  // over-the-counter medications, and "mark as reviewed". Prescribing is editMeds/signOrders.
  reviewMeds: ["physician", "resident", "nurse"],
  // Writing and signing one's own notes and addenda. Residents' notes route for cosign.
  writeNotes: ["physician", "resident", "nurse"],
  cosignNotes: ["physician"],
  // Nurses can pend orders for a prescriber; only prescribers sign them.
  pendOrders: ["physician", "resident", "nurse"],
  signOrders: ["physician", "resident"],
  // Residents' prescriptions are sent at once but wait on an attending's cosignature.
  cosignOrders: ["physician"],
  // Pharmacy refill requests: nurses prepare them against the protocol; prescribers decide.
  pendRefills: ["physician", "resident", "nurse"],
  approveRefills: ["physician", "resident"],
  // Uploading and reviewing an outside report vs. verifying it into the chart.
  importReports: ["physician", "resident", "nurse"],
  fileImports: ["physician", "resident"],
  // Acknowledging results in the Inbox.
  reviewResults: ["physician", "resident"],
  useInbox: ["physician", "resident", "nurse"],
  // Scheduling and the clinic day. Anyone can book, reschedule and cancel.
  bookAppointments: ["physician", "resident", "nurse", "front_desk"],
  // Check-in (demographics, insurance, copay), no-shows and check-out.
  checkIn: ["nurse", "front_desk"],
  // Rooming records vitals, so it needs a clinician.
  roomPatients: ["physician", "resident", "nurse"],
  // Starting and finishing the provider part of a visit.
  seePatients: ["physician", "resident"],
  // Provider session templates and blocked time.
  editSchedules: ["physician", "front_desk"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

// A resident's signed note waits on an attending.
export const needsCosign = (role: Role) => role === "resident";

export const roleLabel: Record<Role, string> = {
  physician: "Physician",
  resident: "Resident",
  nurse: "Nurse",
  front_desk: "Front desk",
};

export const isProvider = (role: Role) => role === "physician" || role === "resident";

export type SessionUser = { id: string; name: string; credentials: string | null; role: Role; username: string };

export const displayName = (u: Pick<SessionUser, "name" | "credentials">) => (u.credentials ? `${u.name}, ${u.credentials}` : u.name);

export const RX_COSIGNER_REQUIRED = "Choose an attending to cosign. Resident prescriptions need a cosignature.";

export const COSIGNER_REQUIRED = "Choose an attending to cosign. Resident notes need a cosignature.";
