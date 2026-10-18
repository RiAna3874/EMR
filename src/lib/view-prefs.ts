import { chartTabs } from "@/lib/chart-tabs";

// Each person's view options, saved on their account (Practitioner.viewPrefs) so they follow
// them to any computer. Everything is shown by default; `hidden` lists what they turned off.
export type ViewPrefs = {
  hidden: string[];
  // Hover cards and tips. On unless turned off.
  hover: boolean;
  // Each area's items in the person's own order (area id -> keys). Missing means the standard order.
  order: Record<string, string[]>;
  // Drag tabs, sidebar sections, Summary panels and top bar links to move them. Off locks the layout.
  drag: boolean;
  // Summary panels made twice as wide.
  wide: string[];
  // Text size on every screen, in percent.
  textSize: number;
  // The chart tab a chart opens on ("" is Summary).
  startTab: string;
};

export const TEXT_SIZES = [90, 100, 110, 125] as const;

export const DEFAULT_PREFS: ViewPrefs = { hidden: [], hover: true, order: {}, drag: true, wide: [], textSize: 100, startTab: "" };

// `locked` items can't be hidden: safety information that must always be on screen.
// `pinned` items stay where they are when the rest are moved.
export type ViewItem = { key: string; label: string; locked?: string; pinned?: string };
// `reorder`: the items can be put in any order. `orderOnly`: they can be moved but not hidden.
export type ViewArea = { id: string; label: string; where: string; items: ViewItem[]; reorder?: boolean; orderOnly?: boolean };

const ALWAYS = "Always shown for safety";
const AT_TOP = "Always at the top of the sidebar";

export const VIEW_AREAS: ViewArea[] = [
  {
    id: "tab",
    label: "Chart tabs",
    where: "The tabs across the top of a chart",
    reorder: true,
    items: chartTabs.map((t) => (t.slug ? { key: `tab:${t.slug}`, label: t.label } : { key: "tab:summary", label: t.label, locked: "Always one click away" })),
  },
  {
    id: "rail",
    label: "Patient sidebar",
    where: "The column on the left of a chart",
    reorder: true,
    items: [
      { key: "rail:allergies", label: "Allergies", locked: ALWAYS, pinned: AT_TOP },
      { key: "rail:code", label: "Code status", locked: ALWAYS, pinned: AT_TOP },
      { key: "rail:details", label: "MRN, PCP, language, phone", pinned: AT_TOP },
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
    reorder: true,
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
    id: "nav",
    label: "Top bar",
    where: "The links across the dark bar at the top",
    reorder: true,
    orderOnly: true,
    items: [
      { key: "nav:home", label: "My Day" },
      { key: "nav:schedule", label: "Schedule" },
      { key: "nav:inbox", label: "Inbox" },
      { key: "nav:messages", label: "Messages" },
      { key: "nav:patients", label: "Patient Lists" },
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
const AREA_OF = new Map(VIEW_AREAS.flatMap((a) => a.items.map((i) => [i.key, a] as const)));

export const viewArea = (id: string) => VIEW_AREAS.find((a) => id === a.id)!;

// The items of an area that can be moved (pinned ones stay put).
export const movable = (area: ViewArea) => (area.reorder ? area.items.filter((i) => !i.pinned) : []);

const canHide = (k: string) => {
  const item = ALL_ITEMS.get(k);
  return !!item && !item.locked && !AREA_OF.get(k)!.orderOnly;
};
const canMove = (area: string, k: string) => {
  const a = AREA_OF.get(k);
  return !!a && a.id === area && !!a.reorder && !ALL_ITEMS.get(k)!.pinned;
};
const startTabs = new Set(chartTabs.map((t) => t.slug));

// Saved prefs from the database, cleaned: unknown and locked keys are dropped.
export function readPrefs(raw: unknown): ViewPrefs {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);
  const hidden = strings(o.hidden).filter(canHide);
  const order: Record<string, string[]> = {};
  const savedOrder = o.order && typeof o.order === "object" ? (o.order as Record<string, unknown>) : {};
  for (const a of VIEW_AREAS) {
    const keys = [...new Set(strings(savedOrder[a.id]).filter((k) => canMove(a.id, k)))];
    if (keys.length) order[a.id] = keys;
  }
  const wide = strings(o.wide).filter((k) => k.startsWith("summary:") && ALL_ITEMS.has(k));
  const textSize = (TEXT_SIZES as readonly number[]).includes(o.textSize as number) ? (o.textSize as number) : 100;
  const startTab = typeof o.startTab === "string" && startTabs.has(o.startTab) ? o.startTab : "";
  return { hidden: [...new Set(hidden)], hover: o.hover !== false, order, drag: o.drag !== false, wide: [...new Set(wide)], textSize, startTab };
}

export const isShown = (prefs: ViewPrefs, key: string) => !prefs.hidden.includes(key) || !!ALL_ITEMS.get(key)?.locked;

// A function that answers "is this shown?" for one area, so pages read `show("range")`.
export const shownIn = (prefs: ViewPrefs, area: string) => (item: string) => isShown(prefs, `${area}:${item}`);

export function withHidden(prefs: ViewPrefs, keys: string[], hidden: boolean): ViewPrefs {
  const set = new Set(prefs.hidden);
  for (const k of keys) {
    if (!canHide(k)) continue;
    if (hidden) set.add(k);
    else set.delete(k);
  }
  return { ...prefs, hidden: [...set] };
}

// Puts `things` (anything with a key) in the person's saved order for an area. Anything the saved
// order doesn't mention (a tab added later) keeps its place after the item it normally follows.
export function inOrder<T>(order: string[] | undefined, things: T[], keyOf: (t: T) => string): T[] {
  if (!order?.length) return things;
  const rank = new Map(order.map((k, i) => [k, i]));
  let last = -1;
  const at = new Map<T, number>();
  for (const t of things) {
    const r = rank.get(keyOf(t));
    last = r ?? last + 0.001;
    at.set(t, last);
  }
  return [...things].sort((a, b) => at.get(a)! - at.get(b)!);
}

// The movable keys of an area in the person's order.
export const movableOrder = (prefs: ViewPrefs, area: string) => inOrder(prefs.order[area], movable(viewArea(area)), (i) => i.key).map((i) => i.key);

// Saves a new order for an area. Back to the standard order is stored as no order at all.
export function withOrder(prefs: ViewPrefs, area: string, keys: string[]): ViewPrefs {
  const a = viewArea(area);
  if (!a?.reorder) return prefs;
  const clean = [...new Set(keys.filter((k) => canMove(area, k)))];
  const standard = a.items.filter((i) => !i.pinned).map((i) => i.key);
  const order = { ...prefs.order };
  if (clean.length === 0 || inOrder(clean, standard, (k) => k).every((k, i) => k === standard[i])) delete order[area];
  else order[area] = clean;
  return { ...prefs, order };
}

// Moves one key up (-1) or down (+1) among `keys`, the order as it is on screen now.
export function moved(keys: string[], key: string, by: number): string[] {
  const from = keys.indexOf(key);
  const to = from + by;
  if (from < 0 || to < 0 || to >= keys.length) return keys;
  const next = [...keys];
  next.splice(from, 1);
  next.splice(to, 0, key);
  return next;
}

// Everything in one area back as it came: all shown, standard order, normal width.
export function withAreaReset(prefs: ViewPrefs, area: string): ViewPrefs {
  const keys = viewArea(area).items.map((i) => i.key);
  const order = { ...prefs.order };
  delete order[area];
  return { ...withHidden(prefs, keys, false), order, wide: prefs.wide.filter((k) => !keys.includes(k)) };
}

export function withWide(prefs: ViewPrefs, key: string, wide: boolean): ViewPrefs {
  if (!key.startsWith("summary:") || !ALL_ITEMS.has(key)) return prefs;
  const rest = prefs.wide.filter((k) => k !== key);
  return { ...prefs, wide: wide ? [...rest, key] : rest };
}
