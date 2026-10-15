// What chart search returns to the page and the ⌘K palette. Pure, shared by server and browser.
import type { Flag } from "@prisma/client";
import type { Snippet } from "./text";

export const HIT_KINDS = [
  { id: "lab", label: "Lab tests", one: "Lab test" },
  { id: "panel", label: "Lab reports", one: "Lab report" },
  { id: "vital", label: "Vitals", one: "Vital sign" },
  { id: "imaging", label: "Imaging", one: "Imaging report" },
  { id: "measurement", label: "Measurements", one: "Measurement" },
  { id: "document", label: "Outside documents", one: "Outside document" },
  { id: "note", label: "Notes", one: "Note" },
  { id: "problem", label: "Problems", one: "Problem" },
  { id: "med", label: "Medications", one: "Medication" },
  { id: "order", label: "Orders", one: "Order" },
  { id: "allergy", label: "Allergies", one: "Allergy" },
  { id: "visit", label: "Visits", one: "Visit" },
  { id: "media", label: "Media", one: "Photo or scan" },
  { id: "message", label: "Secure chat", one: "Chat message" },
  { id: "text", label: "Texts", one: "Text to patient" },
] as const;

export type HitKind = (typeof HIT_KINDS)[number]["id"];
export const isHitKind = (s: string): s is HitKind => HIT_KINDS.some((k) => k.id === s);
export const kindLabel = Object.fromEntries(HIT_KINDS.map((k) => [k.id, k.one])) as Record<HitKind, string>;

// One value in a result's history, oldest first. `v` is null for a text result ("Positive").
export type SeriesPoint = { t: number; v: number | null; text: string; flag: Flag | null; href: string; imported?: boolean; source?: string };
export type HitSeries = { unit: string; refLow: number | null; refHigh: number | null; refText: string | null; points: SeriesPoint[]; graphHref?: string };

export type SearchHit = {
  key: string;
  kind: HitKind;
  title: string;
  subtitle: string;
  at: number | null;
  href: string; // the source, with the matched words to highlight there
  snippet: Snippet | null;
  series?: HitSeries;
  links?: { label: string; href: string }[]; // e.g. every report of a lab panel
  thumb?: string;
  flag?: Flag | null; // the latest value's flag, for labs and vitals
  status?: string; // e.g. "Discontinued", "Pended", "Entered in error"
};

export type SearchResult = {
  query: string;
  hits: SearchHit[];
  total: number;
  counts: Partial<Record<HitKind, number>>;
  partial: boolean; // nothing had every word; these are the closest matches
  ms: number;
};

// Adds the words to highlight at the source (src/components/search-highlighter.tsx).
export function withHighlight(href: string, terms: string[]): string {
  if (!terms.length) return href;
  const [path, hash] = href.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}hl=${encodeURIComponent(terms.join("|"))}${hash ? `#${hash}` : ""}`;
}
