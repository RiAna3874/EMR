import type { Sex } from "@prisma/client";

// Patient registration rules: what a new patient record needs, and which existing
// patients might be the same person. Pure, so it can be tested without a database.

export const LANGUAGES = ["English", "Spanish", "Vietnamese", "Mandarin", "Russian", "Somali", "Arabic", "Other"];
export const RELATIONSHIPS = ["Spouse", "Partner", "Parent", "Child", "Sibling", "Guardian", "Friend", "Other"];
export const SUBSCRIBER_RELATIONSHIPS = ["Self", "Spouse", "Parent", "Other"];
const SEXES: Sex[] = ["female", "male", "other", "unknown"];

export type RegistrationInput = {
  firstName: string;
  middleName: string | null;
  lastName: string;
  preferredName: string | null;
  dob: Date;
  sex: Sex;
  phone: string | null;
  email: string | null;
  address: string | null;
  preferredLanguage: string;
  emergencyContactName: string | null;
  emergencyContactRelation: string | null;
  emergencyContactPhone: string | null;
  pcpId: string | null;
  preferredPharmacyId: string | null;
  insurancePayer: string | null;
  insuranceMemberId: string | null;
  insuranceGroup: string | null;
  subscriberName: string | null;
  subscriberRelation: string | null;
};

// The registration form's field names.
export const FIELDS = [
  "firstName", "middleName", "lastName", "preferredName", "dob", "sex",
  "phone", "email", "street", "unit", "city", "state", "zip", "preferredLanguage",
  "emergencyContactName", "emergencyContactRelation", "emergencyContactPhone",
  "pcpId", "preferredPharmacyId",
  "insurancePayer", "insuranceMemberId", "insuranceGroup", "subscriberName", "subscriberRelation",
] as const;

export type FieldErrors = Partial<Record<string, string>>;

const clean = (v: string | undefined) => (v ?? "").trim().replace(/\s+/g, " ");
const orNull = (v: string) => v || null;

// "5035550142" or "+1 (503) 555-0142" → "(503) 555-0142"; anything else is an error.
export function formatPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

// A date input's "YYYY-MM-DD" as a date-only value (UTC midnight, like every DOB column).
export function parseDob(raw: string): Date | null {
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 ? d : null;
}

// Checks and normalises the registration form. Returns either the record to save
// or an error per field, keyed by the form field's name.
export function validateRegistration(
  form: Record<string, string | undefined>,
  today = new Date(),
): { ok: true; value: RegistrationInput } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const f = Object.fromEntries(FIELDS.map((k) => [k, clean(form[k])])) as Record<(typeof FIELDS)[number], string>;

  if (!f.firstName) errors.firstName = "Enter the legal first name.";
  if (!f.lastName) errors.lastName = "Enter the legal last name.";
  for (const k of ["firstName", "middleName", "lastName", "preferredName"] as const) {
    if (f[k] && !/^[\p{L}][\p{L}' .-]*$/u.test(f[k])) errors[k] = "Use letters, spaces, hyphens and apostrophes only.";
  }

  const dob = f.dob ? parseDob(f.dob) : null;
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (!f.dob) errors.dob = "Enter the date of birth.";
  else if (!dob) errors.dob = "Enter a real date.";
  else if (dob.getTime() > todayUtc) errors.dob = "Date of birth can't be in the future.";
  else if (today.getFullYear() - dob.getUTCFullYear() > 120) errors.dob = "Check the year: that's over 120 years ago.";

  if (!SEXES.includes(f.sex as Sex)) errors.sex = "Choose legal sex.";

  const phone = f.phone ? formatPhone(f.phone) : null;
  if (f.phone && !phone) errors.phone = "Enter a 10-digit phone number.";
  const ecPhone = f.emergencyContactPhone ? formatPhone(f.emergencyContactPhone) : null;
  if (f.emergencyContactPhone && !ecPhone) errors.emergencyContactPhone = "Enter a 10-digit phone number.";
  if (!phone && !f.email) errors.phone ??= "Enter a phone number or email so the clinic can reach the patient.";
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errors.email = "Enter a valid email address.";

  // The address is entered in parts and stored as one line, the way the chart shows it.
  const state = f.state.toUpperCase();
  const anyAddress = f.street || f.city || f.state || f.zip;
  if (anyAddress) {
    if (!f.street) errors.street = "Enter the street address.";
    if (!f.city) errors.city = "Enter the city.";
    if (!/^[A-Z]{2}$/.test(state)) errors.state = "Two letters, e.g. OR.";
    if (!/^\d{5}(-\d{4})?$/.test(f.zip)) errors.zip = "Five digits.";
  }
  const address = anyAddress ? `${f.street}${f.unit ? ` ${f.unit}` : ""}, ${f.city}, ${state} ${f.zip}` : null;

  if ((f.emergencyContactPhone || f.emergencyContactRelation) && !f.emergencyContactName) errors.emergencyContactName = "Enter the contact's name.";
  if (f.emergencyContactName && !ecPhone && !errors.emergencyContactPhone) errors.emergencyContactPhone = "Enter the contact's phone number.";

  // Blank payer means self-pay; a payer needs a member ID to bill.
  if (f.insurancePayer && !f.insuranceMemberId) errors.insuranceMemberId = "Enter the member ID from the card.";
  if (!f.insurancePayer && (f.insuranceMemberId || f.insuranceGroup)) errors.insurancePayer = "Enter the insurance plan, or clear the card fields for self-pay.";
  const subscriberRelation = f.insurancePayer ? f.subscriberRelation || "Self" : null;
  if (subscriberRelation && !SUBSCRIBER_RELATIONSHIPS.includes(subscriberRelation)) errors.subscriberRelation = "Choose the relationship.";
  if (subscriberRelation && subscriberRelation !== "Self" && !f.subscriberName) errors.subscriberName = "Enter the policy holder's name.";

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      firstName: f.firstName,
      middleName: orNull(f.middleName),
      lastName: f.lastName,
      preferredName: orNull(f.preferredName),
      dob: dob!,
      sex: f.sex as Sex,
      phone,
      email: orNull(f.email.toLowerCase()),
      address,
      preferredLanguage: LANGUAGES.includes(f.preferredLanguage) ? f.preferredLanguage : "English",
      emergencyContactName: orNull(f.emergencyContactName),
      emergencyContactRelation: f.emergencyContactName ? orNull(f.emergencyContactRelation) : null,
      emergencyContactPhone: f.emergencyContactName ? ecPhone : null,
      pcpId: orNull(f.pcpId),
      preferredPharmacyId: orNull(f.preferredPharmacyId),
      insurancePayer: orNull(f.insurancePayer),
      insuranceMemberId: f.insurancePayer ? orNull(f.insuranceMemberId.toUpperCase()) : null,
      insuranceGroup: f.insurancePayer ? orNull(f.insuranceGroup.toUpperCase()) : null,
      subscriberName: subscriberRelation && subscriberRelation !== "Self" ? f.subscriberName : null,
      subscriberRelation,
    },
  };
}

// ---- Duplicate check ----

export type DuplicateCandidate = { id: string; mrn: string; firstName: string; lastName: string; dob: Date };
export type DuplicateMatch<C extends DuplicateCandidate = DuplicateCandidate> = { patient: C; strength: "exact" | "likely" | "possible"; reason: string };

// Lowercase letters only, accents dropped: "O'Brien-Núñez" → "obriennunez".
export const normName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");

function editDistance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

// One typo apart (or a hyphenated name sharing a part): "Nguyen" / "Nguyn", "Garcia" / "Garcia-Lopez".
function similar(a: string, b: string) {
  if (a === b) return true;
  if (Math.min(a.length, b.length) >= 4 && editDistance(a, b) <= 1) return true;
  return false;
}
const lastNamesMatch = (a: string, b: string) => {
  const parts = (s: string) => s.toLowerCase().split(/[\s-]+/).map(normName).filter(Boolean);
  const pa = parts(a);
  const pb = parts(b);
  return similar(normName(a), normName(b)) || pa.some((x) => pb.includes(x));
};
// First names match on the same name, a typo, or one being the start of the other ("Rob" / "Robert").
const firstNamesMatch = (a: string, b: string) => {
  const x = normName(a);
  const y = normName(b);
  return similar(x, y) || (Math.min(x.length, y.length) >= 3 && (x.startsWith(y) || y.startsWith(x)));
};

// Dates of birth that are probably the same date entered wrongly: one of day, month
// or year differs, or day and month are swapped.
function dobClose(a: Date, b: Date) {
  const pa = [a.getUTCFullYear(), a.getUTCMonth() + 1, a.getUTCDate()];
  const pb = [b.getUTCFullYear(), b.getUTCMonth() + 1, b.getUTCDate()];
  if (pa[0] === pb[0] && pa[1] === pb[2] && pa[2] === pb[1]) return true;
  return pa.filter((v, i) => v !== pb[i]).length === 1;
}

// Which existing patients might be the person being registered, strongest first.
// The query that finds `candidates` can be broad; this decides what counts.
export function findDuplicates<C extends DuplicateCandidate>(input: { firstName: string; lastName: string; dob: Date }, candidates: C[]): DuplicateMatch<C>[] {
  const order = { exact: 0, likely: 1, possible: 2 };
  const out: DuplicateMatch<C>[] = [];
  for (const p of candidates) {
    const sameDob = p.dob.getTime() === input.dob.getTime();
    const first = firstNamesMatch(input.firstName, p.firstName);
    const last = lastNamesMatch(input.lastName, p.lastName);
    const exactName = normName(input.firstName) === normName(p.firstName) && normName(input.lastName) === normName(p.lastName);
    let m: Omit<DuplicateMatch<C>, "patient"> | null = null;
    if (sameDob && exactName) m = { strength: "exact", reason: "Same name and date of birth" };
    else if (sameDob && first && last) m = { strength: "likely", reason: "Similar name, same date of birth" };
    else if (sameDob && firstNamesMatch(input.firstName, p.lastName) && lastNamesMatch(input.lastName, p.firstName))
      m = { strength: "likely", reason: "First and last name swapped, same date of birth" };
    else if (sameDob && first) m = { strength: "possible", reason: "Same first name and date of birth (last name may have changed)" };
    else if (exactName && dobClose(input.dob, p.dob)) m = { strength: "possible", reason: "Same name, date of birth one digit or field apart" };
    if (m) out.push({ patient: p, ...m });
  }
  return out.sort((a, b) => order[a.strength] - order[b.strength]);
}
