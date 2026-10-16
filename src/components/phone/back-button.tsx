"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

// How many screens deep this visit to the phone view is, so Back returns to the very screen (and
// scroll position) it came from. Opened fresh from a link or the home screen, Back goes up to `href`
// instead, so it never leaves the app. The browser's own back (a swipe) counts as going back.
let depth = 0;
let lastPath: string | null = null;
let popped = false;

export function TrackPhoneHistory() {
  const pathname = usePathname();
  useEffect(() => {
    const onPop = () => (popped = true);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  useEffect(() => {
    if (lastPath !== null && lastPath !== pathname) depth = popped ? Math.max(0, depth - 1) : depth + 1;
    popped = false;
    lastPath = pathname;
  }, [pathname]);
  return null;
}

export function BackButton({ href }: { href: string }) {
  const router = useRouter();
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (depth > 0) router.back();
        else router.push(href);
      }}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors active:bg-white/15"
      aria-label="Back"
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="m15 5-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}
