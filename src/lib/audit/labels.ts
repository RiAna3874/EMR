// What the access log records, in words staff and a privacy officer can read.
// Pure: shared by the recorder (src/lib/audit/record.ts), the log page and tests.

export const AUDIT_ACTIONS = {
  view: "Viewed",
  print: "Printed",
  create: "Added",
  update: "Changed",
  delete: "Removed",
  sign_in: "Signed in",
  sign_in_failed: "Sign-in failed",
  two_step_failed: "Two-step code wrong",
  recovery_code_used: "Used a recovery code",
  sign_out: "Signed out",
  screen_locked: "Screen locked",
  screen_unlocked: "Unlocked the screen",
  password_changed: "Changed password",
  two_step_on: "Turned on two-step sign-in",
  account: "Staff account change",
  setup: "Set up the site",
  export: "Exported",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const isAuditAction = (a: string): a is AuditAction => a in AUDIT_ACTIONS;

// Chart record types, by Prisma model.
export const MODEL_LABELS: Record<string, string> = {
  Patient: "Demographics",
  Encounter: "Appointment",
  EncounterEvent: "Visit status",
  EncounterDiagnosis: "Visit diagnosis",
  ScheduleSession: "Schedule template",
  ScheduleBlock: "Blocked time",
  Condition: "Problem",
  AllergyIntolerance: "Allergy",
  MedicationRequest: "Medication",
  Pharmacy: "Pharmacy",
  MedicationDispense: "Dispense",
  RefillRequest: "Refill request",
  Observation: "Result or vital",
  ObservationCorrection: "Result correction",
  DiagnosticReport: "Lab report",
  Note: "Note",
  NoteAddendum: "Note addendum",
  NoteVersion: "Note earlier version",
  SmartPhrase: "SmartPhrase",
  DocumentReference: "Uploaded file",
  ImportJob: "Report import",
  ServiceRequest: "Order",
  SmsMessage: "Text message",
  ClinicalDocument: "Outside document",
  Conversation: "Secure chat",
  ChatMessage: "Secure chat message",
};

// Not chart changes, or logged by hand with better words (sign-in, staff accounts):
// sessions, sign-in challenges, chat read markers, and the log itself.
export const UNLOGGED_MODELS = new Set(["Session", "SignInChallenge", "AuditEvent", "Practitioner", "ConversationMember"]);

const WRITE_OPS: Record<string, AuditAction> = {
  create: "create",
  createMany: "create",
  createManyAndReturn: "create",
  update: "update",
  updateMany: "update",
  updateManyAndReturn: "update",
  upsert: "update",
  delete: "delete",
  deleteMany: "delete",
};

export const writeAction = (operation: string): AuditAction | null => WRITE_OPS[operation] ?? null;

// Field names only, never values: the log says what kind of thing changed, the chart holds what it is.
const NOISE = new Set(["updatedAt", "id"]);
export function changedFields(data: unknown): string | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const keys = Object.keys(data).filter((k) => !NOISE.has(k));
  return keys.length ? keys.join(", ") : null;
}

const str = (v: unknown) => (typeof v === "string" ? v : null);
const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

// The patient a write touched, from what Prisma was given and what it returned.
export function patientOf(model: string, args: Record<string, unknown> | undefined, result: unknown): string | null {
  const r = obj(result);
  const where = obj(args?.where);
  const data = obj(args?.data) ?? obj(obj(args?.create));
  if (model === "Patient") return str(r?.id) ?? str(where?.id);
  return (
    str(r?.patientId) ??
    str(data?.patientId) ??
    str(obj(obj(data?.patient)?.connect)?.id) ??
    str(where?.patientId) ??
    null
  );
}

// For models that reach the patient through a parent: the parent's model and id.
export function parentOf(model: string, args: Record<string, unknown> | undefined, result: unknown): { model: "Encounter" | "Note" | "Conversation"; id: string } | null {
  const r = obj(result);
  const data = obj(args?.data);
  const pick = (k: string) => str(r?.[k]) ?? str(data?.[k]);
  if (model === "EncounterEvent") {
    const id = pick("encounterId");
    return id ? { model: "Encounter", id } : null;
  }
  if (model === "NoteAddendum" || model === "NoteVersion") {
    const id = pick("noteId");
    return id ? { model: "Note", id } : null;
  }
  if (model === "ChatMessage") {
    const id = pick("conversationId");
    return id ? { model: "Conversation", id } : null;
  }
  return null;
}
