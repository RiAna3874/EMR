"use client";

import { useEffect, useState } from "react";
import type { DrugHit } from "@/lib/meds/drug-search";

// DGDA brands and worldwide generic names matching what's typed (Admin > Drug list).
export function useDrugSearch(q: string, enabled = true): DrugHit[] {
  const [hits, setHits] = useState<{ q: string; hits: DrugHit[] }>({ q: "", hits: [] });
  const query = q.trim();
  useEffect(() => {
    if (!enabled || query.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/drugs?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((h: DrugHit[]) => setHits({ q: query, hits: Array.isArray(h) ? h : [] }))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, enabled]);
  if (!enabled || query.length < 2) return [];
  if (hits.q === query) return hits.hits;
  // While the next answer loads, keep only the earlier hits that still match every
  // typed word, so the list doesn't flicker and never offers a drug that wasn't asked for.
  const words = query.toLowerCase().split(/\s+/);
  return hits.hits.filter((h) => words.every((w) => `${h.display} ${h.detail}`.toLowerCase().includes(w)));
}
