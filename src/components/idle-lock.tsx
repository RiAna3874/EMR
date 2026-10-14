"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { lockScreen } from "@/app/lock/actions";

const KEY = "meridian:last-activity";
const EVENTS = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart", "scroll"] as const;

// Locks the screen after `afterMs` with no typing, clicking or scrolling, so a chart isn't
// left open on a shared desk or nursing PC. Activity in any tab of this browser counts.
export function IdleLock({ afterMs }: { afterMs: number }) {
  const pathname = usePathname();
  const [locking, setLocking] = useState(false);

  useEffect(() => {
    const read = () => {
      try {
        return Number(localStorage.getItem(KEY)) || 0;
      } catch {
        return 0;
      }
    };
    let last = Date.now();
    let written = 0;
    const touch = () => {
      last = Date.now();
      // At most once every few seconds, so pointermove doesn't hammer storage.
      if (last - written > 5000) {
        written = last;
        try {
          localStorage.setItem(KEY, String(last));
        } catch {}
      }
    };
    touch();
    for (const e of EVENTS) window.addEventListener(e, touch, { passive: true });
    const timer = window.setInterval(() => {
      if (Date.now() - Math.max(last, read()) < afterMs) return;
      window.clearInterval(timer);
      setLocking(true);
      lockScreen(`${location.pathname}${location.search}`);
    }, 15_000);
    return () => {
      window.clearInterval(timer);
      for (const e of EVENTS) window.removeEventListener(e, touch);
    };
  }, [afterMs, pathname]);

  // Cover the chart straight away; the lock page replaces it a moment later.
  return locking ? <div className="fixed inset-0 z-[100] bg-chrome" aria-hidden /> : null;
}
