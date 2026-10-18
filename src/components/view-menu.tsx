"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { setHidden } from "@/app/account/view/actions";
import type { ViewItem } from "@/lib/view-prefs";

// A small "View" button that shows or hides the parts of one screen. Choices are saved to
// the person's account (src/lib/view-prefs.ts), so they stay on any computer.
export function ViewMenu({
  label,
  items,
  hidden,
  align = "right",
  tone = "light",
}: {
  label: string;
  items: ViewItem[];
  hidden: string[];
  align?: "left" | "right";
  tone?: "light" | "subtle";
}) {
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const [shownHidden, setShownHidden] = useOptimistic(hidden, (cur: string[], change: { keys: string[]; hide: boolean }) =>
    change.hide ? [...new Set([...cur, ...change.keys])] : cur.filter((k) => !change.keys.includes(k)),
  );
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  function change(keys: string[], hide: boolean) {
    startTransition(async () => {
      setShownHidden({ keys, hide });
      await setHidden(keys, hide);
    });
  }
  const hideable = items.filter((i) => !i.locked);
  const hiddenHere = hideable.filter((i) => shownHidden.includes(i.key));

  return (
    <div ref={box} className="relative print:hidden" data-view-menu>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        title={`Show or hide ${label.toLowerCase()}`}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11.5px] font-medium normal-case tracking-normal ${
          tone === "subtle" ? "text-ink-3 hover:bg-panel-muted hover:text-ink" : "border border-line bg-panel text-ink-2 hover:border-accent hover:text-accent"
        } ${hiddenHere.length ? "text-accent" : ""}`}
      >
        <EyeIcon />
        View
        {hiddenHere.length > 0 && <span className="tabular rounded-full bg-accent-soft px-1 text-[10px] text-accent">{hiddenHere.length} hidden</span>}
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute top-full z-40 mt-1 w-64 rounded-md border border-line bg-panel py-1 text-[12.5px] font-normal normal-case tracking-normal text-ink shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</div>
          {items.map((i) => {
            const shown = i.locked ? true : !shownHidden.includes(i.key);
            return (
              <label
                key={i.key}
                role="menuitemcheckbox"
                aria-checked={shown}
                className={`flex items-center gap-2 px-3 py-1 ${i.locked ? "text-ink-3" : "cursor-pointer hover:bg-accent-soft/50"}`}
                title={i.locked}
              >
                <input type="checkbox" checked={shown} disabled={!!i.locked} onChange={(e) => change([i.key], !e.target.checked)} className="accent-[var(--accent)]" />
                <span className="flex-1">{i.label}</span>
                {i.locked && <LockIcon />}
              </label>
            );
          })}
          <div className="mt-1 flex items-center justify-between border-t border-line px-3 pt-1.5 text-[12px]">
            <button
              type="button"
              disabled={hiddenHere.length === 0}
              onClick={() => change(hideable.map((i) => i.key), false)}
              className="text-accent hover:underline disabled:text-ink-3 disabled:no-underline"
            >
              Show all
            </button>
            <Link href="/account/view" className="text-ink-3 hover:text-accent hover:underline" onClick={() => setOpen(false)}>
              All view options
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <rect x="3" y="7" width="10" height="7" rx="1.5" />
      <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
    </svg>
  );
}
