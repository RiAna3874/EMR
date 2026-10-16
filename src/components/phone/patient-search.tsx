"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Chevron } from "./header";

type Match = { id: string; name: string; detail: string };
type Recent = { id: string; name: string; detail: string };

const RECENT_KEY = "meridian.phoneRecent";
const MAX_RECENT = 10;

function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as Recent[];
  } catch {
    return [];
  }
}

// Remembers a chart opened on this phone, for the Recent list. Names only, never clinical data.
export function RememberPatient({ patient }: { patient: Recent }) {
  useEffect(() => {
    try {
      const list = [patient, ...readRecent().filter((p) => p.id !== patient.id)].slice(0, MAX_RECENT);
      localStorage.setItem(RECENT_KEY, JSON.stringify(list));
    } catch {
      // Storage unavailable (private mode); there's just no Recent list.
    }
  }, [patient]);
  return null;
}

// Search by name, MRN, date of birth or phone number (the same lookup as Ctrl+K on the full site),
// and below it the charts recently opened on this phone.
export function PatientSearch({ autoFocus = false }: { autoFocus?: boolean }) {
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);

  useEffect(() => setRecent(readRecent()), []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setMatches(null);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/patients?q=${encodeURIComponent(term)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then(setMatches)
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  return (
    <>
      <div className="border-b border-line bg-bg px-4 py-2.5">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Name, MRN, birth date or phone"
          aria-label="Find a patient"
          enterKeyHint="search"
          autoComplete="off"
          autoFocus={autoFocus}
          className="w-full rounded-lg border border-line bg-panel px-3 py-2.5 text-[16px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
        />
      </div>
      {matches !== null ? (
        <List title="Search results" items={matches} empty="No patients match." />
      ) : (
        recent.length > 0 && <List title="Recent on this phone" items={recent} />
      )}
    </>
  );
}

function List({ title, items, empty }: { title: string; items: Match[]; empty?: string }) {
  return (
    <section className="mt-4">
      <h2 className="px-4 pb-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
      <div className="border-y border-line bg-panel">
        {items.length === 0 && <p className="px-4 py-4 text-ink-3">{empty}</p>}
        {items.map((p) => (
          <Link key={p.id} href={`/m/patients/${p.id}`} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0 active:bg-accent-soft/60">
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{p.name}</div>
              <div className="truncate text-[13px] text-ink-3">{p.detail}</div>
            </div>
            <Chevron />
          </Link>
        ))}
      </div>
    </section>
  );
}
