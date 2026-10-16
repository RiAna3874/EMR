// The phone view (/m), like Epic Haiku: shared by the middleware, the root layout and the /m pages.

// Set by the middleware on /m requests so the root layout leaves out the desktop top bar.
export const PHONE_VIEW_HEADER = "x-meridian-phone";
// "desktop" when someone on a phone chose the full site (/view/full-site); /view/phone clears it.
export const VIEW_COOKIE = "meridian_view";

export const isPhonePath = (p: string) => p === "/m" || p.startsWith("/m/");

// Phones, not tablets: an iPad or Android tablet gets the full site.
export const isPhone = (userAgent: string) => /iPhone|iPod|Android.*Mobile|Mobile.*Firefox|Windows Phone|Opera Mini/i.test(userAgent);

// Pages a phone opens as they are: sign-in steps, files, printouts and the switches themselves.
const KEEP = /^\/(m|login|lock|account|setup|api|media|documents|print|view|app-icon|_next)(\/|$)/;
const CHART_SECTIONS = new Set(["results", "vitals", "sugar", "meds", "notes", "media", "import"]);

// The phone view's screen for a full-site address, so a link, bookmark or old tab opened on a
// phone lands in the phone view. Pages with no phone screen go to the nearest one (a chart
// section to the chart, the schedule or inbox to Today). null: open it as it is.
export function phoneEquivalent(pathname: string, search: URLSearchParams): string | null {
  if (KEEP.test(pathname) || /\.[a-z0-9]+$/i.test(pathname)) return null;
  const parts = pathname.split("/").filter(Boolean);
  const id = (s: string | null) => (s && /^[\w-]+$/.test(s) ? s : null);
  if (parts[0] === "patients") {
    const patient = id(parts[1] ?? null);
    if (!patient || patient === "new") return "/m/patients";
    const base = `/m/patients/${patient}`;
    const section = parts[2];
    if (!section || !CHART_SECTIONS.has(section)) return base;
    if (section === "notes" && id(search.get("note"))) return `${base}/notes/${search.get("note")}`;
    if (section === "media" && search.get("add") === "1") return `${base}/media?add=1`;
    if (section === "media" && id(search.get("item"))) return `${base}/media/${search.get("item")}`;
    return `${base}/${section}`;
  }
  if (parts[0] === "messages") {
    if (parts[1] === "new") return id(search.get("patient")) ? `/m/chat/new?patient=${search.get("patient")}` : "/m/chat/new";
    return id(parts[1] ?? null) ? `/m/chat/${parts[1]}` : "/m/chat";
  }
  return "/m";
}
