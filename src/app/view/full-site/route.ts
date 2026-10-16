import { NextResponse } from "next/server";
import { VIEW_COOKIE } from "@/lib/phone-view";

// "Open the full site" in the phone view: remember the choice so My Day stops sending this
// phone to /m. "Phone view" on the full site (/view/phone) clears it.
export function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/", req.url));
  res.cookies.set(VIEW_COOKIE, "desktop", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  return res;
}
