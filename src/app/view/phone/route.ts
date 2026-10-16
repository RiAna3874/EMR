import { NextResponse } from "next/server";
import { VIEW_COOKIE } from "@/lib/phone-view";

// "Phone view" on the full site: forget a "full site" choice and open /m.
export function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/m", req.url));
  res.cookies.delete(VIEW_COOKIE);
  return res;
}
