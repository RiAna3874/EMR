"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the server page on an interval while some background work runs.
export function RefreshWhile({ active, intervalMs }: { active: boolean; intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(t);
  }, [active, intervalMs, router]);
  return null;
}
