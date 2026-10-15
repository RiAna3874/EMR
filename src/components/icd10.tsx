"use client";

import { useEffect, useMemo, useState } from "react";
import { Field, inputCls } from "@/components/form";
import { PickInput } from "@/components/pick-input";
import type { PickOption } from "@/lib/meds/dosing";
import { DIAGNOSES } from "@/lib/visits/diagnoses";
import { normalizeIcd10, type Icd10Check, type Icd10Hit } from "@/lib/icd10/format";

// Diagnosis pickers backed by the ICD-10-CM code table (/api/icd10): search the whole
// table, and check any typed code against it, showing its official description.

const checked = new Map<string, Promise<Icd10Check | null>>();

function fetchChecks(codes: string[]) {
  const todo = codes.filter((c) => !checked.has(c));
  if (todo.length) {
    const all = fetch(`/api/icd10?codes=${encodeURIComponent(todo.join(","))}`)
      .then((r) => (r.ok ? (r.json() as Promise<Record<string, Icd10Check>>) : {}))
      .catch(() => ({}) as Record<string, Icd10Check>);
    for (const c of todo) {
      const one = all.then((m) => (m as Record<string, Icd10Check>)[c] ?? null);
      // A failed lookup is asked again next time.
      one.then((v) => v ?? checked.delete(c));
      checked.set(c, one);
    }
  }
  return Promise.all(codes.map((c) => checked.get(c)!));
}

// Checks for each code (normalized, e.g. "e119" → "E11.9"); undefined while loading or blank.
export function useIcd10Checks(codes: string[]): Record<string, Icd10Check | undefined> {
  const list = useMemo(() => [...new Set(codes.map(normalizeIcd10).filter(Boolean))].sort(), [codes]);
  const key = list.join(",");
  const [result, setResult] = useState<Record<string, Icd10Check>>({});
  useEffect(() => {
    if (!key) return;
    let live = true;
    const t = setTimeout(() => {
      fetchChecks(key.split(",")).then((found) => {
        if (!live) return;
        setResult((r) => {
          const next = { ...r };
          found.forEach((f) => f && (next[f.code] = f));
          return next;
        });
      });
    }, 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [key]);
  return result;
}

export function useIcd10Check(code: string): Icd10Check | undefined {
  const codes = useMemo(() => [code], [code]);
  const n = normalizeIcd10(code);
  return useIcd10Checks(codes)[n];
}

function useIcd10Search(q: string): Icd10Hit[] {
  const [hits, setHits] = useState<{ q: string; hits: Icd10Hit[] }>({ q: "", hits: [] });
  const query = q.trim();
  useEffect(() => {
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/icd10?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : []))
        .then((h: Icd10Hit[]) => setHits({ q: query, hits: Array.isArray(h) ? h : [] }))
        .catch(() => {});
    }, 150);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);
  return query.length < 2 ? [] : hits.hits;
}

// Under a code box: what the code means, or why it can't be used and what to pick instead.
export function Icd10Status({ code, check, onPick, className = "" }: { code: string; check: Icd10Check | undefined; onPick?: (hit: Icd10Hit) => void; className?: string }) {
  if (!code.trim()) return null;
  if (!check) return <div className={`text-[11.5px] text-ink-3 ${className}`}>Checking {normalizeIcd10(code)}…</div>;
  if (check.status === "ok")
    return (
      <div className={`text-[11.5px] text-ink-2 ${className}`}>
        <span className="text-ok">✓</span> <span className="font-mono">{check.code}</span> {check.title}
      </div>
    );
  return (
    <div className={`text-[11.5px] ${className}`}>
      <span className="text-crit">
        {check.status === "partial" ? (
          <>
            ✕ <span className="font-mono">{check.code}</span> ({check.title}) isn&apos;t a complete ICD-10-CM code.
          </>
        ) : (
          <>
            ✕ <span className="font-mono">{check.code}</span> isn&apos;t an ICD-10-CM code.
          </>
        )}
      </span>
      {check.options.length > 0 && (
        <>
          {" "}
          <span className="text-ink-3">{check.status === "partial" ? "Pick one:" : "Did you mean:"}</span>
          <span className="mt-0.5 flex flex-wrap gap-1">
            {check.options.map((o) => (
              <button
                key={o.code}
                type="button"
                disabled={!onPick}
                onClick={(e) => {
                  e.stopPropagation();
                  onPick?.(o);
                }}
                className="rounded border border-line bg-panel px-1.5 py-0.5 text-left text-ink-2 hover:border-accent hover:text-accent"
              >
                <span className="font-mono">{o.code}</span> {o.title}
              </button>
            ))}
            {check.more > 0 && <span className="self-center text-ink-3">and {check.more} more (search by code)</span>}
          </span>
        </>
      )}
    </div>
  );
}

const COMMON_CODES = new Set(DIAGNOSES.map((d) => d.code));

// Diagnosis name and ICD-10-CM code. Searching the name offers the common list first,
// then the whole code table; picking one fills both. A typed code is checked as you go.
export function DiagnosisPicker({
  display,
  code,
  onChange,
  label = "Diagnosis",
  placeholder = "Search: fever, I10, dengue, sugar…",
  codePlaceholder = "optional",
  children,
}: {
  display: string;
  code: string;
  onChange: (display: string, code: string) => void;
  label?: string;
  placeholder?: string;
  codePlaceholder?: string;
  // More fields and the button, on the same row; blocked while the code can't be saved.
  children?: (blocked: boolean) => React.ReactNode;
}) {
  const hits = useIcd10Search(display);
  const check = useIcd10Check(code);
  // Official descriptions seen so far, so a name picked for one code isn't saved with another.
  const [titles] = useState(() => new Map(DIAGNOSES.map((d) => [d.value.toLowerCase(), d.code])));
  hits.forEach((h) => titles.set(h.title.toLowerCase(), h.code));
  const nameCode = titles.get(display.trim().toLowerCase());
  const mismatch = check?.status === "ok" && nameCode && nameCode !== check.code ? nameCode : null;
  const blocked = codeBlocksSave(code, check) || !!mismatch;
  const options = useMemo<PickOption[]>(() => {
    const q = display.trim().toLowerCase();
    const more = hits
      .filter((h) => !COMMON_CODES.has(h.code))
      // The table already matched these to what's typed, so they pass the list's own filter.
      .map((h) => ({ value: h.title, hint: h.code, keywords: [q] }));
    return [...DIAGNOSES, ...more];
  }, [hits, display]);

  return (
    <>
      <Field label={label} className="min-w-72 flex-1">
        <PickInput
          name="display"
          value={display}
          options={options}
          showAllOnFocus={false}
          placeholder={placeholder}
          ariaLabel={label}
          required
          onChange={(v, picked) => onChange(v, picked ? (picked.hint ?? "") : code)}
        />
      </Field>
      <Field label="ICD-10-CM">
        <input
          name="code"
          value={code}
          onChange={(e) => onChange(display, e.target.value.toUpperCase())}
          onBlur={() => code && onChange(display, normalizeIcd10(code))}
          placeholder={codePlaceholder}
          aria-label="ICD-10-CM code"
          className={`${inputCls} w-28 font-mono uppercase`}
        />
      </Field>
      {children?.(blocked)}
      <Icd10Status code={code} check={check} onPick={(o) => onChange(display.trim() && !nameCode ? display : o.title, o.code)} className="basis-full" />
      {mismatch && (
        <div className="basis-full text-[11.5px] text-crit">
          ✕ &ldquo;{display}&rdquo; is the description of <span className="font-mono">{mismatch}</span>, not {check?.code}. Pick the diagnosis again, or change the name or the code.
        </div>
      )}
    </>
  );
}

export function codeBlocksSave(code: string, check: Icd10Check | undefined) {
  return !!code.trim() && check?.status !== "ok";
}
