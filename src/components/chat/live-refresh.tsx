"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Keeps an open chat current: re-renders the server page on an interval while
// the tab is visible, and at once when the user comes back to it.
export function LiveRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const tick = () => document.visibilityState === "visible" && router.refresh();
    const t = setInterval(tick, intervalMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [intervalMs, router]);
  return null;
}
