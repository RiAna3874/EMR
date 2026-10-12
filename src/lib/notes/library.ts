import type { NoteType } from "@prisma/client";
import type { Phrase } from "./smarttext";

export const noteTypes: { id: NoteType; label: string; short: string }[] = [
  { id: "progress", label: "Progress note", short: "Progress" },
  { id: "history_physical", label: "History and physical", short: "H&P" },
  { id: "consult", label: "Consult", short: "Consult" },
  { id: "procedure", label: "Procedure note", short: "Procedure" },
  { id: "phone", label: "Telephone encounter", short: "Phone" },
];
export const noteTypeLabel = Object.fromEntries(noteTypes.map((t) => [t.id, t.label])) as Record<NoteType, string>;
export const noteTypeShort = Object.fromEntries(noteTypes.map((t) => [t.id, t.short])) as Record<NoteType, string>;

// Live chart data a note can pull in. Values are computed per patient in
// src/lib/smart-text.ts; this list drives the editor's picker.
export const chartLinks: { name: string; description: string }[] = [
  { name: "NAME", description: "Patient name" },
  { name: "AGE", description: "Age in years" },
  { name: "SEX", description: "Sex" },
  { name: "DOB", description: "Date of birth" },
  { name: "MRN", description: "Medical record number" },
  { name: "PCP", description: "Primary care clinician" },
  { name: "CC", description: "Reason for today's visit" },
  { name: "TODAY", description: "Today's date" },
  { name: "ME", description: "You, with credentials" },
  { name: "VITALS", description: "Latest vital signs" },
  { name: "MEDS", description: "Active medications" },
  { name: "PROBLEMS", description: "Active problem list" },
  { name: "APPROBLEMS", description: "Assessment and plan, one block per active problem" },
  { name: "ALLERGIES", description: "Allergies" },
  { name: "LABS", description: "Latest labs from the last 6 months" },
  { name: "ABNLABS", description: "Abnormal labs from the last 6 months" },
];

// The shared phrase library. Clinicians add their own on the My phrases page;
// theirs win when a name matches.
export const systemPhrases: Phrase[] = [
  { name: "vitals", description: "Latest vitals", body: "@VITALS@" },
  { name: "meds", description: "Active medications", body: "@MEDS@" },
  { name: "problems", description: "Active problems", body: "@PROBLEMS@" },
  { name: "allergies", description: "Allergies", body: "@ALLERGIES@" },
  { name: "labs", description: "Recent labs", body: "@LABS@" },
  { name: "ap", description: "Problem-based assessment and plan", body: "@APPROBLEMS@" },
  {
    name: "hpi",
    description: "HPI scaffold for a new complaint",
    body:
      "@NAME@ is a @AGE@ y.o. @SEX@ presenting with ***. Onset {Onset:today|yesterday|several days ago|1 week ago|several weeks ago|months ago}. " +
      "Course has been {Course:improving|unchanged|worsening|intermittent}. Severity {Severity:mild|moderate|severe}. " +
      "Associated symptoms: ***. Tried *** with {Relief:no relief|partial relief|good relief}.",
  },
  {
    name: "ros",
    description: "Review of systems, pertinent negatives",
    body:
      "Constitutional: denies {Constitutional::fever|chills|night sweats|weight loss|fatigue}.\n" +
      "Cardiovascular: denies {Cardiovascular::chest pain|palpitations|leg swelling|orthopnea}.\n" +
      "Respiratory: denies {Respiratory::shortness of breath|cough|wheezing}.\n" +
      "GI: denies {GI::nausea|vomiting|abdominal pain|diarrhea|constipation|blood in stool}.\n" +
      "All other systems reviewed and negative except as noted in the HPI.",
  },
  {
    name: "pe",
    description: "Normal adult physical exam",
    body:
      "General: alert, oriented, in no acute distress.\n" +
      "HEENT: normocephalic, atraumatic. Oropharynx clear.\n" +
      "Neck: supple, no lymphadenopathy or thyromegaly.\n" +
      "Cardiovascular: regular rate and rhythm, no murmurs, rubs or gallops.\n" +
      "Lungs: clear to auscultation bilaterally, no wheezes or crackles.\n" +
      "Abdomen: soft, non-tender, non-distended, normal bowel sounds.\n" +
      "Extremities: {Edema:no edema|trace edema|1+ pitting edema|2+ pitting edema|3+ pitting edema}.\n" +
      "Skin: warm and dry, no rashes.\n" +
      "Neuro: no focal deficits. Gait normal.",
  },
  {
    name: "pefocused",
    description: "Focused exam, blanks to fill",
    body: "General: {General:well appearing|ill appearing|in mild distress|in moderate distress}.\nPertinent findings: ***",
  },
  {
    name: "dmplan",
    description: "Diabetes follow-up plan",
    body:
      "Diabetes: A1c ***, {Control:at goal|above goal|improving|worsening}. " +
      "{DM plan:Continue current regimen|Increase metformin|Start GLP-1 receptor agonist|Start SGLT2 inhibitor|Refer to diabetes education}. " +
      "Annual eye exam {Eye exam:up to date|due, referral placed}. Foot exam {Foot exam:done today, normal|done today, abnormal ***|deferred}. A1c in {Recheck:3 months|6 months}.",
  },
  {
    name: "htnplan",
    description: "Hypertension follow-up plan",
    body:
      "Hypertension: BP today ***, {Control:at goal (<130/80)|above goal|improving}. " +
      "{HTN plan:Continue current regimen|Increase dose of ***|Add amlodipine 5 mg daily|Add lisinopril 10 mg daily}. " +
      "Home BP log reviewed {Home BP:and consistent with office readings|and lower than office readings|not available}. Low-sodium diet discussed.",
  },
  {
    name: "rtc",
    description: "Return to clinic",
    body: "Return to clinic in {Return:1 week|2 weeks|1 month|3 months|6 months|1 year} or sooner as needed.",
  },
  {
    name: "edu",
    description: "Education and shared decision making",
    body: "Discussed diagnosis, treatment options, risks and benefits with {Who:patient|patient and family|caregiver}. Questions answered; patient {Agreement:agrees with the plan|will consider options and follow up}.",
  },
  {
    name: "time",
    description: "Time-based billing statement",
    body: "I spent *** minutes on the date of service on this patient's care, including record review, examination, counseling and documentation.",
  },
  {
    name: "medrec",
    description: "Medication reconciliation statement",
    body: "Medication list reviewed and reconciled with the patient today. {Med changes:No changes|Changes as noted in the plan}.",
  },
  {
    name: "consent",
    description: "Procedure consent",
    body:
      "Risks including bleeding, infection, pain and damage to surrounding structures, benefits and alternatives were discussed. " +
      "{Consent:Verbal|Written} informed consent obtained from {Consenter:the patient|the patient's guardian}. A time-out was performed confirming patient, site and procedure.",
  },
  {
    name: "attest",
    description: "Supervising physician attestation",
    body:
      "I {Seen:saw and examined the patient|discussed the patient with the resident|reviewed the resident's note} and agree with the findings and plan {Edits:as documented|with the following changes: ***}.",
  },
  {
    name: "phoneadvice",
    description: "Telephone advice and return precautions",
    body: "Advised ***. Patient verbalized understanding. Instructed to call back or seek care in person if symptoms {Precautions:worsen|do not improve in 48 hours|worsen or new symptoms develop}.",
  },
];

export type NoteTemplate = { id: string; type: NoteType; name: string; description: string; title: string; body: string };

export const templates: NoteTemplate[] = [
  {
    id: "progress_soap",
    type: "progress",
    name: "Office visit (SOAP)",
    description: "Subjective, objective, assessment and plan",
    title: "Office visit",
    body: [
      "CHIEF COMPLAINT",
      "@CC@",
      "",
      "SUBJECTIVE",
      "***",
      "",
      "OBJECTIVE",
      "@VITALS@",
      ".pefocused",
      "",
      "ASSESSMENT AND PLAN",
      "@APPROBLEMS@",
      "",
      ".rtc",
    ].join("\n"),
  },
  {
    id: "progress_chronic",
    type: "progress",
    name: "Chronic care follow-up",
    description: "Problem-based, with med reconciliation",
    title: "Chronic care follow-up",
    body: [
      "CHIEF COMPLAINT",
      "Follow-up of chronic conditions.",
      "",
      "INTERVAL HISTORY",
      "Since the last visit, @NAME@ reports ***. Taking medications {Adherence:as prescribed|with missed doses|inconsistently}. Side effects: {Side effects:none|***}.",
      "",
      "@MEDS@",
      ".medrec",
      "",
      "@ALLERGIES@",
      "",
      "OBJECTIVE",
      "@VITALS@",
      ".pe",
      "",
      "@ABNLABS@",
      "",
      "ASSESSMENT AND PLAN",
      "@APPROBLEMS@",
      "",
      ".rtc",
    ].join("\n"),
  },
  {
    id: "progress_wellness",
    type: "progress",
    name: "Annual wellness visit",
    description: "Preventive care and screening review",
    title: "Annual wellness visit",
    body: [
      "ANNUAL WELLNESS VISIT",
      "@NAME@ presents for an annual preventive visit.",
      "",
      "HEALTH MAINTENANCE",
      "Colorectal cancer screening: {CRC:up to date|due, ordered today|declined|not indicated}.",
      "Immunizations: influenza {Flu:given today|up to date|declined}; others ***.",
      "Tobacco: {Tobacco:never|former|current, cessation counseled}. Alcohol: ***.",
      "Falls in the past year: {Falls:none|one|two or more}.",
      "",
      ".ros",
      "",
      "OBJECTIVE",
      "@VITALS@",
      ".pe",
      "",
      "ASSESSMENT AND PLAN",
      "1. Encounter for preventive care (Z00.00): screening and immunizations as above.",
      "@APPROBLEMS@",
      "",
      ".rtc",
    ].join("\n"),
  },
  {
    id: "hp_new",
    type: "history_physical",
    name: "New patient H&P",
    description: "Complete history and physical",
    title: "History and physical",
    body: [
      "CHIEF COMPLAINT",
      "@CC@",
      "",
      "HISTORY OF PRESENT ILLNESS",
      ".hpi",
      "",
      "PAST MEDICAL HISTORY",
      "@PROBLEMS@",
      "",
      "@MEDS@",
      "",
      "@ALLERGIES@",
      "",
      "SOCIAL HISTORY",
      "Tobacco: {Tobacco:never|former|current}. Alcohol: {Alcohol:none|social|daily}. Occupation: ***.",
      "",
      "FAMILY HISTORY",
      "***",
      "",
      "REVIEW OF SYSTEMS",
      ".ros",
      "",
      "PHYSICAL EXAM",
      "@VITALS@",
      ".pe",
      "",
      "DATA REVIEWED",
      "@LABS@",
      "",
      "ASSESSMENT AND PLAN",
      "@APPROBLEMS@",
      "",
      ".edu",
      ".rtc",
    ].join("\n"),
  },
  {
    id: "consult",
    type: "consult",
    name: "Consultation",
    description: "Reason, findings, recommendations",
    title: "Consult",
    body: [
      "REASON FOR CONSULTATION",
      "Asked by @PCP@ to evaluate ***.",
      "",
      "HISTORY OF PRESENT ILLNESS",
      ".hpi",
      "",
      "@PROBLEMS@",
      "",
      "@MEDS@",
      "",
      "@ALLERGIES@",
      "",
      "EXAM",
      "@VITALS@",
      ".pefocused",
      "",
      "DATA REVIEWED",
      "@LABS@",
      "",
      "IMPRESSION",
      "***",
      "",
      "RECOMMENDATIONS",
      "1. ***",
      "",
      "Thank you for this consultation. We will {Follow:follow along|sign off; please call with questions|see the patient again in clinic in ***}.",
    ].join("\n"),
  },
  {
    id: "procedure_generic",
    type: "procedure",
    name: "Procedure note",
    description: "Any bedside or office procedure",
    title: "Procedure note",
    body: [
      "PROCEDURE",
      "***",
      "",
      "INDICATION",
      "***",
      "",
      "CONSENT",
      ".consent",
      "",
      "DESCRIPTION",
      "The site was prepped with {Prep:chlorhexidine|povidone-iodine|alcohol} and draped in sterile fashion. " +
        "Anesthesia: {Anesthesia:none|1% lidocaine without epinephrine|1% lidocaine with epinephrine|topical}. ***",
      "",
      "Estimated blood loss: {EBL:none|minimal|*** mL}.",
      "Specimens: {Specimens:none|sent to pathology}.",
      "Complications: {Complications:none|***}.",
      "The patient tolerated the procedure {Tolerance:well|fair} and was {Disposition:discharged home in stable condition|observed in clinic without issue}.",
      "",
      "Performed by @ME@.",
    ].join("\n"),
  },
  {
    id: "procedure_joint",
    type: "procedure",
    name: "Joint injection",
    description: "Corticosteroid injection, large joint",
    title: "Joint injection",
    body: [
      "PROCEDURE",
      "{Side:Right|Left} {Joint:knee|shoulder (subacromial)|trochanteric bursa} corticosteroid injection.",
      "",
      "INDICATION",
      "***",
      "",
      "CONSENT",
      ".consent",
      "",
      "DESCRIPTION",
      "Landmarks identified via {Guidance:palpation|ultrasound guidance}. The site was prepped with chlorhexidine. " +
        "Using a {Needle:22|25} gauge needle, {Drug:40 mg triamcinolone|80 mg methylprednisolone} mixed with {Lido:3|4|5} mL 1% lidocaine was injected without resistance.",
      "Complications: {Complications:none|***}. Patient tolerated the procedure well.",
      "",
      "AFTERCARE",
      "Ice as needed, avoid strenuous use for 48 hours. Watch for redness, warmth or fever. No repeat injection in this joint for at least 3 months.",
    ].join("\n"),
  },
  {
    id: "phone",
    type: "phone",
    name: "Telephone encounter",
    description: "Caller, reason, advice",
    title: "Telephone encounter",
    body: [
      "Caller: {Caller:patient|spouse|parent|caregiver|pharmacy}. Identity verified with two identifiers.",
      "Reason for call: ***",
      "",
      ".phoneadvice",
    ].join("\n"),
  },
];

export const blankTemplate = (type: NoteType): NoteTemplate => ({
  id: `blank_${type}`,
  type,
  name: "Blank",
  description: "Start from an empty note",
  title: noteTypeLabel[type],
  body: "",
});

export const templateById = (id: string | undefined | null) =>
  templates.find((t) => t.id === id) ?? (id?.startsWith("blank_") ? blankTemplate(id.slice(6) as NoteType) : undefined);
