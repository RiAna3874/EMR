import { NextResponse, type NextRequest } from "next/server";
import { isPhonePath, PHONE_VIEW_HEADER } from "@/lib/phone-view";

// First line of defence: no session cookie, no app (except sign-in and first-run /setup). The cookie is only checked
// for presence here; pages, actions and routes validate it against the database.
const SESSION_COOKIE = "meridian_session";

export function middleware(req: NextRequest) {
  if (!req.cookies.has(SESSION_COOKIE)) {
    const { pathname, search } = req.nextUrl;
    if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname + search);
    return NextResponse.redirect(url);
  }
  // The phone view has its own header and tabs; this tells the root layout to leave out the desktop top bar.
  if (isPhonePath(req.nextUrl.pathname)) {
    const headers = new Headers(req.headers);
    headers.set(PHONE_VIEW_HEADER, "1");
    return NextResponse.next({ request: { headers } });
  }
  return NextResponse.next();
}

export const config = {
  // The web app manifest and its icons are fetched without cookies when the phone view is installed.
  matcher: ["/((?!login|setup|_next/static|_next/image|favicon.ico|manifest.webmanifest|app-icon).*)"],
};
