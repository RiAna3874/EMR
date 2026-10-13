import { NextResponse, type NextRequest } from "next/server";

// First line of defence: no session cookie, no app (except sign-in and first-run /setup). The cookie is only checked
// for presence here; pages, actions and routes validate it against the database.
const SESSION_COOKIE = "meridian_session";

export function middleware(req: NextRequest) {
  if (req.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const { pathname, search } = req.nextUrl;
  if (pathname.startsWith("/api/")) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!login|setup|_next/static|_next/image|favicon.ico).*)"],
};
