"use client";

import { useEffect, useState } from "react";
import type { RegisteredHit } from "@/lib/meds/dgda";

// Brands from the DGDA registered drug list matching what's typed (Admin > Drug list).
export function useRegisteredDrugs(q: string, enabled = true): RegisteredHit[] {
  const [hits, setHits] = useState<{ q: string; hits: RegisteredHit[] }>({ q: "", hits: [] });
  const query = q.trim();
  useEffect(() => {
    if (!enabled || query.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/drugs?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((h: RegisteredHit[]) => setHits({ q: query, hits: Array.isArray(h) ? h : [] }))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, enabled]);
  // The last answer stays up while the next one loads, so the list doesn't flicker.
  return enabled && query.length >= 2 ? hits.hits : [];
}
