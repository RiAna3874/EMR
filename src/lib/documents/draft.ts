// The review screen's working copy of an outside clinical document (imaging
// report, discharge summary, referral or consult letter), and the checks that
// run on it. Pure functions only: the same code runs in the browser while the
// clinician reviews and on the server when they file.
import { z } from "zod";
import type { ClinicalDocType } from "@prisma/client";
import { BoxSchema, checkIdentity, toFractionBox, type IdentityCheck, type PageSize, type PatientFacts } from "@/lib/labs/draft";
import { toLocalDate } from "@/lib/format";

export const DOC_TYPES: { id: ClinicalDocType; label: string; plural: string }[] = [
  { id: "imaging_report", label: "Imaging report", plural: "Imaging" },
  { id: "discharge_summary", label: "Discharge summary", plural: "Discharge summaries" },
  { id: "referral_letter", label: "Referral letter", plural: "Referrals" },
  { id: "consult_note", label: "Consult letter", plural: "Consults" },
  { id: "procedure_note", label: "Procedure report", plural: "Procedures" },
  { id: "pathology_report", label: "Pathology report", plural: "Pathology" },
  { id: "other", label: "Other document", plural: "Other" },
];
export const docTypeLabel = Object.fromEntries(DOC_TYPES.map((t) => [t.id, t.label])) as Record<ClinicalDocType, string>;
const DOC_TYPE_IDS = DOC_TYPES.map((t) => t.id) as [ClinicalDocType, ...ClinicalDocType[]];

export const DIAGNOSIS_KINDS = { principal: "Principal", secondary: "Secondary", reason: "Reason for referral", finding: "Finding", history: "History" } as const;
export const MED_CHANGES = { new: "New", changed: "Changed", continued: "Continued", stopped: "Stopped", unknown: "Listed" } as const;

const Source = { file: z.number().int(), box: BoxSchema.nullable() };

export const DocSectionSchema = z.object({ id: z.string(), heading: z.string(), text: z.string(), ...Source });
export const DocDiagnosisSchema = z.object({
  id: z.string(),
  text: z.string(),
  kind: z.enum(Object.keys(DIAGNOSIS_KINDS) as [keyof typeof DIAGNOSIS_KINDS, ...(keyof typeof DIAGNOSIS_KINDS)[]]),
  icd10: z.string(),
  addToProblems: z.boolean(),
  ...Source,
});
export const DocMedSchema = z.object({
  id: z.string(),
  text: z.string(), // as printed
  drug: z.string(),
  dose: z.string(),
  route: z.string(),
  frequency: z.string(),
  change: z.enum(Object.keys(MED_CHANGES) as [keyof typeof MED_CHANGES, ...(keyof typeof MED_CHANGES)[]]),
  addToList: z.boolean(),
  ...Source,
});
export const DocFollowUpSchema = z.object({ id: z.string(), text: z.string(), due: z.string(), ...Source });

export const DocDraftSchema = z.object({
  type: z.enum(DOC_TYPE_IDS),
  detectedType: z.string(), // what Claude read it as, e.g. "lab_report"
  title: z.string(),
  organization: z.string(),
  author: z.string(),
  serviceDate: z.string(), // YYYY-MM-DD: exam date, discharge date or letter date
  admitDate: z.string(),
  dischargeDate: z.string(),
  modality: z.string(),
  bodyPart: z.string(),
  impression: z.string(),
  printedName: z.string(),
  printedDob: z.string(),
  printedAge: z.string(),
  printedSex: z.string(),
  printedId: z.string(),
  identityConfirmed: z.boolean(),
  notes: z.array(z.string()),
  sections: z.array(DocSectionSchema),
  diagnoses: z.array(DocDiagnosisSchema),
  meds: z.array(DocMedSchema),
  followUps: z.array(DocFollowUpSchema),
  orderId: z.string().nullable(), // the imaging or referral order this answers
});
export type DocDraft = z.infer<typeof DocDraftSchema>;
export type DocSection = z.infer<typeof DocSectionSchema>;
export type DocDiagnosis = z.infer<typeof DocDiagnosisSchema>;
export type DocMed = z.infer<typeof DocMedSchema>;
export type DocFollowUp = z.infer<typeof DocFollowUpSchema>;

// What a filed ClinicalDocument keeps in `content`: the reviewed structure and
// where each part came from on the source pages.
export type DocContent = Pick<
  DocDraft,
  "admitDate" | "dischargeDate" | "modality" | "bodyPart" | "impression" | "printedName" | "printedDob" | "printedId" | "notes" | "sections" | "diagnoses" | "meds" | "followUps"
>;

export function docContent(d: DocDraft): DocContent {
  const keep = <T extends { text: string }>(xs: T[]) => xs.filter((x) => x.text.trim());
  return {
    admitDate: d.admitDate,
    dischargeDate: d.dischargeDate,
    modality: d.modality.trim(),
    bodyPart: d.bodyPart.trim(),
    impression: d.impression.trim(),
    printedName: d.printedName.trim(),
    printedDob: d.printedDob,
    printedId: d.printedId.trim(),
    notes: d.notes,
    sections: keep(d.sections),
    diagnoses: keep(d.diagnoses),
    meds: d.meds.filter((m) => m.drug.trim() || m.text.trim()),
    followUps: keep(d.followUps),
  };
}

// Reads `content` back, tolerating fields added later.
export function readContent(json: unknown): DocContent {
  const c = (json ?? {}) as Partial<DocContent>;
  return {
    admitDate: c.admitDate ?? "",
    dischargeDate: c.dischargeDate ?? "",
    modality: c.modality ?? "",
    bodyPart: c.bodyPart ?? "",
    impression: c.impression ?? "",
    printedName: c.printedName ?? "",
    printedDob: c.printedDob ?? "",
    printedId: c.printedId ?? "",
    notes: c.notes ?? [],
    sections: c.sections ?? [],
    diagnoses: c.diagnoses ?? [],
    meds: c.meds ?? [],
    followUps: c.followUps ?? [],
  };
}

// ---------- the chart, for reconciliation ----------

export type ChartFacts = {
  problems: { code: string; display: string }[];
  meds: { drug: string }[]; // active and on hold
  orders: OrderChoice[]; // signed imaging, referral and procedure orders
};
export type OrderChoice = { id: string; type: string; code: string; display: string; signedAt: string };

// Which open orders a document of this type can answer.
const ORDER_TYPE_FOR: Partial<Record<ClinicalDocType, string>> = {
  imaging_report: "imaging",
  referral_letter: "referral",
  consult_note: "referral",
  procedure_note: "procedure",
};

export function orderChoices(type: ClinicalDocType, orders: OrderChoice[]) {
  const t = ORDER_TYPE_FOR[type];
  return t ? orders.filter((o) => o.type === t) : [];
}

const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !["referral", "report", "with", "without", "and", "the", "for", "views", "complete", "exam", "letter", "consult", "consultation"].includes(w));

const SYNONYMS: Record<string, string[]> = {
  echocardiogram: ["echo", "echocardiography", "tte", "transthoracic"],
  dexa: ["dxa", "densitometry", "density", "bone"],
  ophthalmology: ["eye", "retina", "retinal", "ophthalmic", "retinopathy", "ophthalmologist"],
  cardiology: ["cardiac", "heart", "cardiologist", "cardiovascular"],
  mammogram: ["mammography", "breast"],
  "x-ray": ["radiograph", "xray", "cxr"],
  pulmonology: ["pulmonary", "lung", "respiratory"],
  gastroenterology: ["gi", "hepatology", "liver"],
  nephrology: ["renal", "kidney"],
};

function expand(ws: string[]) {
  const out = new Set(ws);
  for (const w of ws) {
    for (const [k, syn] of Object.entries(SYNONYMS)) {
      if (w === k || syn.includes(w) || k.startsWith(w)) [k, ...syn].forEach((x) => out.add(x));
    }
  }
  return out;
}

// The open order that best fits the document, if any word in its title,
// modality, body part or source points to it. Nothing is guessed from type alone.
export function suggestOrder(d: Pick<DocDraft, "type" | "title" | "modality" | "bodyPart" | "organization" | "author" | "sections">, orders: OrderChoice[]): string | null {
  const choices = orderChoices(d.type, orders);
  const doc = expand(words([d.title, d.modality, d.bodyPart, d.organization, d.author, ...d.sections.map((s) => s.heading)].join(" ")));
  let best: { id: string; score: number } | null = null;
  for (const o of choices) {
    const score = [...expand(words(o.display))].filter((w) => doc.has(w)).length;
    if (score > 0 && (!best || score > best.score)) best = { id: o.id, score };
  }
  return best?.id ?? null;
}

const drugKey = (s: string) => s.toLowerCase().match(/[a-z][a-z-]{2,}/)?.[0] ?? "";

export type ProblemMatch = { kind: "same" | "related"; code: string; display: string } | null;

export function matchProblem(dx: Pick<DocDiagnosis, "text" | "icd10">, problems: ChartFacts["problems"]): ProblemMatch {
  const code = dx.icd10.trim().toUpperCase();
  if (code) {
    const same = problems.find((p) => p.code.toUpperCase() === code);
    if (same) return { kind: "same", ...same };
    const related = problems.find((p) => p.code.slice(0, 3).toUpperCase() === code.slice(0, 3));
    if (related) return { kind: "related", ...related };
  }
  const t = dx.text.trim().toLowerCase();
  const byName = problems.find((p) => p.display.toLowerCase() === t);
  return byName ? { kind: "same", ...byName } : null;
}

export function matchMed(m: Pick<DocMed, "drug" | "text">, meds: ChartFacts["meds"]): string | null {
  const key = drugKey(m.drug || m.text);
  if (!key) return null;
  return meds.find((x) => drugKey(x.drug) === key)?.drug ?? null;
}

export const ICD10 = /^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/;

// ---------- whole-draft checks ----------

export type DocAssessment = {
  identity: IdentityCheck;
  problems: Map<string, ProblemMatch>;
  meds: Map<string, string | null>; // matching med on the list
  medNotes: Map<string, string>; // something the reviewer should act on
  blockers: string[];
};

export function assessDocDraft(d: DocDraft, patient: PatientFacts, chart: ChartFacts, today = toLocalDate(new Date())): DocAssessment {
  const identity = checkIdentity({ ...d, collectedDate: d.serviceDate }, patient);
  const blockers: string[] = [];
  const problems = new Map(d.diagnoses.map((x) => [x.id, matchProblem(x, chart.problems)]));
  const meds = new Map(d.meds.map((m) => [m.id, matchMed(m, chart.meds)]));
  const medNotes = new Map<string, string>();
  for (const m of d.meds) {
    const on = meds.get(m.id);
    if (m.change === "stopped" && on) medNotes.set(m.id, `Stopped in this document but still active here as ${on}. Review it in Medications.`);
    else if ((m.change === "new" || m.change === "changed") && !on) medNotes.set(m.id, "Started or changed here and not on the medication list.");
    else if (m.change === "changed" && on) medNotes.set(m.id, `Dose changed in this document. The list has ${on}.`);
  }

  if (!d.title.trim()) blockers.push("Enter the document title.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.serviceDate)) blockers.push("Enter the document date.");
  else if (d.serviceDate > today) blockers.push("Document date is in the future.");
  if (d.admitDate && d.dischargeDate && d.admitDate > d.dischargeDate) blockers.push("Admission date is after the discharge date.");
  if (identity.status === "mismatch" && !d.identityConfirmed) blockers.push("Confirm this document belongs to this patient.");
  if (!d.impression.trim() && !d.sections.some((s) => s.text.trim())) blockers.push("The document has no text to file.");

  const adding = d.diagnoses.filter((x) => x.addToProblems);
  for (const x of adding) {
    if (!x.text.trim()) blockers.push("A diagnosis to add to the problem list has no name.");
    else if (x.icd10.trim() && !ICD10.test(x.icd10.trim().toUpperCase())) blockers.push(`"${x.icd10}" isn't an ICD-10 code (${x.text}).`);
    else if (problems.get(x.id)?.kind === "same") blockers.push(`${x.text} is already on the problem list.`);
  }
  for (const m of d.meds.filter((x) => x.addToList)) {
    if (!m.drug.trim()) blockers.push("A medication to add has no drug name.");
    else if (m.change === "stopped") blockers.push(`${m.drug} was stopped in this document; it can't be added as current.`);
    else if (meds.get(m.id)) blockers.push(`${m.drug} is already on the medication list (${meds.get(m.id)}).`);
  }
  if (d.orderId && !orderChoices(d.type, chart.orders).some((o) => o.id === d.orderId)) blockers.push("The linked order is no longer open. Choose another or none.");
  return { identity, problems, meds, medNotes, blockers };
}

// ---------- from Claude's transcription ----------

type Src = { file: number; box: { x0: number; y0: number; x1: number; y1: number } | null };

export type ExtractedDocument = {
  document_type: ClinicalDocType | "lab_report";
  title: string | null;
  organization: string | null;
  author: string | null;
  service_date: string | null;
  admission_date: string | null;
  discharge_date: string | null;
  patient_name: string | null;
  patient_dob: string | null;
  patient_age: string | null;
  patient_sex: string | null;
  patient_id: string | null;
  modality: string | null;
  body_part: string | null;
  impression: string | null;
  notes: string[];
  sections: ({ heading: string; text: string } & Src)[];
  diagnoses: ({ text: string; kind: keyof typeof DIAGNOSIS_KINDS; icd10: string | null } & Src)[];
  medications: ({ text: string; drug: string; dose: string | null; route: string | null; frequency: string | null; change: keyof typeof MED_CHANGES } & Src)[];
  follow_ups: ({ text: string; due: string | null } & Src)[];
};

const isoDate = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : "");

export function docDraftFromExtraction(x: ExtractedDocument, pages: PageSize[]): DocDraft {
  const src = (s: Src) => {
    const file = Math.min(Math.max(s.file - 1, 0), Math.max(pages.length - 1, 0));
    return { file, box: toFractionBox(s.box, pages[file]) };
  };
  const type: ClinicalDocType = x.document_type === "lab_report" ? "other" : x.document_type;
  return {
    type,
    detectedType: x.document_type,
    title: x.title ?? "",
    organization: x.organization ?? "",
    author: x.author ?? "",
    serviceDate: isoDate(x.service_date) || isoDate(x.discharge_date),
    admitDate: isoDate(x.admission_date),
    dischargeDate: isoDate(x.discharge_date),
    modality: x.modality ?? "",
    bodyPart: x.body_part ?? "",
    impression: x.impression ?? "",
    printedName: x.patient_name ?? "",
    printedDob: isoDate(x.patient_dob),
    printedAge: x.patient_age ?? "",
    printedSex: x.patient_sex ?? "",
    printedId: x.patient_id ?? "",
    identityConfirmed: false,
    notes: x.notes,
    sections: x.sections.map((s, i) => ({ id: `s${i + 1}`, heading: s.heading, text: s.text, ...src(s) })),
    diagnoses: x.diagnoses.map((d, i) => ({ id: `d${i + 1}`, text: d.text, kind: d.kind, icd10: (d.icd10 ?? "").toUpperCase(), addToProblems: false, ...src(d) })),
    meds: x.medications.map((m, i) => ({
      id: `m${i + 1}`,
      text: m.text,
      drug: m.drug,
      dose: m.dose ?? "",
      route: m.route ?? "",
      frequency: m.frequency ?? "",
      change: m.change,
      addToList: false,
      ...src(m),
    })),
    followUps: x.follow_ups.map((f, i) => ({ id: `f${i + 1}`, text: f.text, due: f.due ?? "", ...src(f) })),
    orderId: null,
  };
}

export function emptyDocDraft(): DocDraft {
  return {
    type: "other",
    detectedType: "",
    title: "",
    organization: "",
    author: "",
    serviceDate: "",
    admitDate: "",
    dischargeDate: "",
    modality: "",
    bodyPart: "",
    impression: "",
    printedName: "",
    printedDob: "",
    printedAge: "",
    printedSex: "",
    printedId: "",
    identityConfirmed: false,
    notes: [],
    sections: [{ id: "s1", heading: "", text: "", file: 0, box: null }],
    diagnoses: [],
    meds: [],
    followUps: [],
    orderId: null,
  };
}
