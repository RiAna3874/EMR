"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// While a text shows "Sending", re-reads the page every few seconds so it turns to Sent or
// failed on its own. Gives up after about half a minute.
export function RefreshWhileSending({ sending }: { sending: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!sending) return;
    let tries = 0;
    const timer = setInterval(() => {
      if (++tries > 10) clearInterval(timer);
      else router.refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [sending, router]);
  return null;
}
