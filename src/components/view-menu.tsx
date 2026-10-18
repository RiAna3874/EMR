"use client";

import Link from "next/link";
import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { resetArea, setHidden } from "@/app/account/view/actions";
import { moved, type ViewItem } from "@/lib/view-prefs";
import { useArrangement } from "@/components/arrange";

// A small "View" button that shows or hides the parts of one screen. Choices are saved to
// the person's account (src/lib/view-prefs.ts), so they stay on any computer. Inside an
// <Arrange> for `area`, it also moves items up and down (and makes Summary panels wide).
export function ViewMenu({
  label,
  items,
  hidden,
  area,
  align = "right",
  tone = "light",
}: {
  label: string;
  items: ViewItem[];
  hidden: string[];
  area?: string;
  align?: "left" | "right";
  tone?: "light" | "subtle";
}) {
  const arr = useArrangement(area ?? "");
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
  // Pinned items first, then the rest in the person's order.
  const rank = new Map((arr?.order ?? []).map((k, n) => [k, n]));
  const listed = arr ? [...items.filter((i) => i.pinned), ...items.filter((i) => !i.pinned).sort((x, y) => (rank.get(x.key) ?? 999) - (rank.get(y.key) ?? 999))] : items;
  const movableHere = listed.filter((i) => !i.pinned).map((i) => i.key);
  const customised = hiddenHere.length > 0 || (!!arr && (arr.wide.length > 0 || arr.order.join() !== items.filter((i) => !i.pinned).map((i) => i.key).join()));
  // Up/down skips past items this role never sees, so one press always moves it on screen.
  function step(key: string, by: number) {
    const n = movableHere.indexOf(key) + by;
    if (!arr || n < 0 || n >= movableHere.length) return;
    arr.move(moved(arr.order, key, arr.order.indexOf(movableHere[n]) - arr.order.indexOf(key)));
  }

  return (
    <div ref={box} className="relative print:hidden" data-view-menu>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="true"
        title={`${arr ? "Show, hide or move" : "Show or hide"} ${label.toLowerCase()}`}
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
          className={`absolute top-full z-40 mt-1 ${arr ? "w-80" : "w-64"} rounded-md border border-line bg-panel py-1 text-[12.5px] font-normal normal-case tracking-normal text-ink shadow-lg ${align === "right" ? "right-0" : "left-0"}`}
        >
          <div className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{label}</div>
          {arr && <div className="px-3 pb-1 text-[11.5px] text-ink-3">{arr.drag ? "Drag them on the screen, or use the arrows here." : "Use the arrows to move them."}</div>}
          {listed.map((i) => {
            const shown = i.locked ? true : !shownHidden.includes(i.key);
            const at = movableHere.indexOf(i.key);
            const wide = arr?.wide.includes(i.key);
            return (
              <div key={i.key} className={`flex items-center gap-1 pr-2 ${i.locked ? "" : "hover:bg-accent-soft/50"}`}>
                <label
                  role="menuitemcheckbox"
                  aria-checked={shown}
                  className={`flex min-w-0 flex-1 items-center gap-2 py-1 pl-3 ${i.locked ? "text-ink-3" : "cursor-pointer"}`}
                  title={i.locked ?? i.pinned}
                >
                  <input type="checkbox" checked={shown} disabled={!!i.locked} onChange={(e) => change([i.key], !e.target.checked)} className="accent-[var(--accent)]" />
                  <span className="flex-1 truncate">{i.label}</span>
                  {i.locked && <LockIcon />}
                </label>
                {arr && area === "summary" && (
                  <button
                    type="button"
                    onClick={() => arr.setWide(i.key, !wide)}
                    aria-pressed={wide}
                    title={wide ? "Make this panel normal width" : "Make this panel twice as wide"}
                    className={`rounded px-1 text-[11px] ${wide ? "bg-accent-soft font-medium text-accent" : "text-ink-3 hover:text-ink"}`}
                  >
                    Wide
                  </button>
                )}
                {arr && !i.pinned && (
                  <>
                    <MoveButton dir="up" label={i.label} disabled={at === 0} onClick={() => step(i.key, -1)} />
                    <MoveButton dir="down" label={i.label} disabled={at === movableHere.length - 1} onClick={() => step(i.key, 1)} />
                  </>
                )}
              </div>
            );
          })}
          <div className="mt-1 flex items-center justify-between gap-3 border-t border-line px-3 pt-1.5 text-[12px]">
            <button
              type="button"
              disabled={hiddenHere.length === 0}
              onClick={() => change(hideable.map((i) => i.key), false)}
              className="text-accent hover:underline disabled:text-ink-3 disabled:no-underline"
            >
              Show all
            </button>
            {arr && (
              <button
                type="button"
                disabled={!customised}
                onClick={() => startTransition(() => resetArea(arr.area))}
                title="Show everything here in the standard order"
                className="text-accent hover:underline disabled:text-ink-3 disabled:no-underline"
              >
                Reset
              </button>
            )}
            <span className="flex-1" />
            <Link href="/account/view" className="text-ink-3 hover:text-accent hover:underline" onClick={() => setOpen(false)}>
              All view options
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export function MoveButton({ dir, label, disabled, onClick }: { dir: "up" | "down"; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={`Move ${label} ${dir}`}
      title={dir === "up" ? "Move up (earlier)" : "Move down (later)"}
      className="flex h-5 w-5 items-center justify-center rounded text-ink-3 hover:bg-panel-muted hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent"
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
        <path d={dir === "up" ? "M2 6.5l3-3 3 3" : "M2 3.5l3 3 3-3"} />
      </svg>
    </button>
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
