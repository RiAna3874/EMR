import { chartTabs } from "@/lib/chart-tabs";

// Each person's view options, saved on their account (Practitioner.viewPrefs) so they follow
// them to any computer. Everything is shown by default; `hidden` lists what they turned off.
export type ViewPrefs = {
  hidden: string[];
  // Hover cards and tips. On unless turned off.
  hover: boolean;
};

export const DEFAULT_PREFS: ViewPrefs = { hidden: [], hover: true };

// `locked` items can't be hidden: safety information that must always be on screen.
export type ViewItem = { key: string; label: string; locked?: string };
export type ViewArea = { id: string; label: string; where: string; items: ViewItem[] };

const ALWAYS = "Always shown for safety";

export const VIEW_AREAS: ViewArea[] = [
  {
    id: "tab",
    label: "Chart tabs",
    where: "The tabs across the top of a chart",
    items: chartTabs.map((t) => (t.slug ? { key: `tab:${t.slug}`, label: t.label } : { key: "tab:summary", label: t.label, locked: "The chart opens here" })),
  },
  {
    id: "rail",
    label: "Patient sidebar",
    where: "The column on the left of a chart",
    items: [
      { key: "rail:allergies", label: "Allergies", locked: ALWAYS },
      { key: "rail:code", label: "Code status", locked: ALWAYS },
      { key: "rail:details", label: "MRN, PCP, language, phone" },
      { key: "rail:problems", label: "Active problems" },
      { key: "rail:vitals", label: "Last vitals" },
      { key: "rail:next", label: "Next appointment" },
      { key: "rail:chat", label: "Secure chat" },
    ],
  },
  {
    id: "summary",
    label: "Chart summary",
    where: "Panels on a chart's Summary tab",
    items: [
      { key: "summary:problems", label: "Active problems" },
      { key: "summary:meds", label: "Active medications" },
      { key: "summary:allergies", label: "Allergies" },
      { key: "summary:upcoming", label: "Upcoming" },
      { key: "summary:vitals", label: "Vitals trend" },
      { key: "summary:abnormal", label: "Recent abnormal results" },
      { key: "summary:notes", label: "Recent notes" },
      { key: "summary:outside", label: "Outside records" },
    ],
  },
  {
    id: "results",
    label: "Results table",
    where: "Columns on the Results tab",
    items: [
      { key: "results:range", label: "Range" },
      { key: "results:units", label: "Units" },
      { key: "results:trend", label: "Trend line" },
    ],
  },
  {
    id: "myday",
    label: "My Day",
    where: "The home screen",
    items: [
      { key: "myday:stats", label: "Counts at the top" },
      { key: "myday:visit", label: "Schedule: visit column" },
      { key: "myday:room", label: "Schedule: room column" },
      { key: "myday:abnormal", label: "Abnormal results" },
    ],
  },
  {
    id: "patients",
    label: "Patient lists",
    where: "Columns on Patient Lists",
    items: [
      { key: "patients:age", label: "Age" },
      { key: "patients:mrn", label: "MRN" },
      { key: "patients:dob", label: "DOB" },
      { key: "patients:appt", label: "Appointment" },
      { key: "patients:problems", label: "Top problems" },
      { key: "patients:pcp", label: "PCP" },
      { key: "patients:alerts", label: "Alerts" },
    ],
  },
];

const ALL_ITEMS = new Map(VIEW_AREAS.flatMap((a) => a.items.map((i) => [i.key, i] as const)));

export const viewArea = (id: string) => VIEW_AREAS.find((a) => a.id === id)!;

// Saved prefs from the database, cleaned: unknown and locked keys are dropped.
export function readPrefs(raw: unknown): ViewPrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const hidden = Array.isArray(o.hidden) ? o.hidden.filter((k): k is string => typeof k === "string" && !!ALL_ITEMS.get(k) && !ALL_ITEMS.get(k)!.locked) : [];
  return { hidden: [...new Set(hidden)], hover: o.hover !== false };
}

export const isShown = (prefs: ViewPrefs, key: string) => !prefs.hidden.includes(key) || !!ALL_ITEMS.get(key)?.locked;

// A function that answers "is this shown?" for one area, so pages read `show("range")`.
export const shownIn = (prefs: ViewPrefs, area: string) => (item: string) => isShown(prefs, `${area}:${item}`);

export function withHidden(prefs: ViewPrefs, keys: string[], hidden: boolean): ViewPrefs {
  const set = new Set(prefs.hidden);
  for (const k of keys) {
    if (!ALL_ITEMS.has(k) || ALL_ITEMS.get(k)!.locked) continue;
    if (hidden) set.add(k);
    else set.delete(k);
  }
  return { ...prefs, hidden: [...set] };
}
