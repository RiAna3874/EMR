// What can be filed in a chart's Media tab, and the checks on a media item's details.
// Pure: used by the add form in the browser and by the server actions.

export const MEDIA_CATEGORIES = [
  { id: "clinical_photo", label: "Clinical photo", hint: "A finding: hands, eyes, swelling, a rash" },
  { id: "wound", label: "Wound or ulcer", hint: "Track healing over time" },
  { id: "skin", label: "Skin lesion", hint: "Mole, rash or lesion to compare later" },
  { id: "outside_report", label: "Report (as is)", hint: "A report kept as an image; use Import to read it into the chart" },
  { id: "ecg", label: "ECG tracing", hint: "Photo or scan of the strip" },
  { id: "film", label: "X-ray film or image", hint: "Photo of a film, CD screen or scan image" },
  { id: "prescription", label: "Old prescription", hint: "Another doctor's prescription" },
  { id: "consent", label: "Consent form", hint: "Signed consent" },
  { id: "id_card", label: "ID or insurance card", hint: "NID, passport, insurance card" },
  { id: "other", label: "Other", hint: "Anything else to keep with the chart" },
] as const;

export type MediaCategory = (typeof MEDIA_CATEGORIES)[number]["id"];
export const mediaCategoryLabel = Object.fromEntries(MEDIA_CATEGORIES.map((c) => [c.id, c.label])) as Record<MediaCategory, string>;
export const isMediaCategory = (s: string): s is MediaCategory => MEDIA_CATEGORIES.some((c) => c.id === s);

// Offered as suggestions; any text is allowed.
export const BODY_SITES = [
  "Right hand", "Left hand", "Both hands", "Right foot", "Left foot", "Both feet", "Face", "Right eye", "Left eye", "Mouth / tongue",
  "Neck", "Chest", "Back", "Abdomen", "Right arm", "Left arm", "Right leg", "Left leg", "Right knee", "Left knee", "Scalp", "Groin", "Nails",
];

// Photos that show the body get a site; paperwork doesn't.
export const takesBodySite = (c: MediaCategory) => c === "clinical_photo" || c === "wound" || c === "skin" || c === "other";

export const MAX_MEDIA_FILES = 12;
export const MAX_MEDIA_IMAGE_BYTES = 5 * 1024 * 1024; // after the browser shrinks it; also Claude's image limit for Import
export const MAX_MEDIA_PDF_BYTES = 20 * 1024 * 1024;
export const MEDIA_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

// A name staff can recognize in the grid: "Clinical photo, right hand".
export function suggestedTitle(category: MediaCategory, bodySite = ""): string {
  const label = mediaCategoryLabel[category];
  return bodySite.trim() ? `${label}, ${bodySite.trim().toLowerCase()}` : label;
}

export type MediaDetails = { title: string; category: string; bodySite: string; description: string; takenOn: string };

// Problems with a media item's details, or [] when it can be saved.
export function checkMediaDetails(d: MediaDetails, today: string): string[] {
  const errors: string[] = [];
  if (!d.title.trim()) errors.push("Give it a name.");
  else if (d.title.trim().length > 120) errors.push("Keep the name under 120 characters.");
  if (!isMediaCategory(d.category)) errors.push("Choose what it is.");
  if (d.bodySite.length > 80) errors.push("Keep the body site under 80 characters.");
  if (d.description.length > 2000) errors.push("Keep the description under 2000 characters.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.takenOn)) errors.push("Enter the date it was taken.");
  else if (d.takenOn > today) errors.push("The date taken is in the future.");
  return errors;
}
