import type { Permission } from "@/lib/roles";

// `needs` is the permission a tab's page checks; tabs the user lacks it for are hidden.
// `about` is what the tab's hover card says it holds.
export const chartTabs: { slug: string; label: string; needs?: Permission; about: string }[] = [
  { slug: "", label: "Summary", about: "Problems, medications, allergies, vitals, abnormal results and recent notes on one page." },
  { slug: "visit", label: "Visit", needs: "viewClinical", about: "Today's visit: complaint, vitals, diagnoses, orders and the prescription to print or text." },
  { slug: "results", label: "Results", needs: "viewClinical", about: "Lab results by specialty and panel, with reports, trends and graphs." },
  { slug: "vitals", label: "Vitals", needs: "viewClinical", about: "Blood pressure, pulse, temperature, weight and other vitals over time." },
  { slug: "sugar", label: "Blood sugar", needs: "viewClinical", about: "Every blood sugar, lab and fingerstick, in one trend." },
  { slug: "meds", label: "Medications", needs: "viewClinical", about: "Current and past medications, prescribing and refill requests." },
  { slug: "problems", label: "Problems", needs: "viewClinical", about: "The problem list with ICD-10 codes." },
  { slug: "allergies", label: "Allergies", needs: "viewClinical", about: "Allergies and reactions, and when they were last reviewed." },
  { slug: "notes", label: "Notes", needs: "viewClinical", about: "Visit notes, pended drafts and notes waiting for a cosign." },
  { slug: "orders", label: "Orders", needs: "viewClinical", about: "Lab, imaging and other orders, signed and pending." },
  { slug: "documents", label: "Documents", needs: "viewClinical", about: "Outside records: discharge summaries, consult letters, imaging reports." },
  { slug: "media", label: "Media", needs: "viewClinical", about: "Photos and scans filed to the chart." },
  { slug: "import", label: "Import", needs: "importReports", about: "Photograph or upload a report and turn it into results." },
  { slug: "appointments", label: "Appointments", about: "Past and upcoming appointments." },
  { slug: "texts", label: "Texts", needs: "textPatients", about: "Text messages sent to the patient." },
];

// What a count badge on a tab means.
export const tabCountMeaning: Record<string, string> = {
  results: "abnormal results in the last 30 days",
  meds: "refill requests waiting",
  notes: "notes waiting on you (your drafts and cosigns)",
  orders: "orders not yet signed",
  documents: "outside documents waiting for your review",
  import: "imports waiting to be verified",
};
