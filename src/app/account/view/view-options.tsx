"use client";

import { useOptimistic, useTransition } from "react";
import type { ViewArea, ViewPrefs } from "@/lib/view-prefs";
import { resetView, setHidden, setHover } from "./actions";

type Change = { keys: string[]; hide: boolean } | { hover: boolean } | "reset";

export function ViewOptions({ areas, prefs }: { areas: ViewArea[]; prefs: ViewPrefs }) {
  const [, startTransition] = useTransition();
  const [shown, apply] = useOptimistic(prefs, (cur: ViewPrefs, c: Change): ViewPrefs => {
    if (c === "reset") return { hidden: [], hover: true };
    if ("hover" in c) return { ...cur, hover: c.hover };
    return { ...cur, hidden: c.hide ? [...new Set([...cur.hidden, ...c.keys])] : cur.hidden.filter((k) => !c.keys.includes(k)) };
  });
  const run = (c: Change, action: () => Promise<void>) =>
    startTransition(async () => {
      apply(c);
      await action();
    });

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-line bg-panel">
        <header className="border-b border-line px-4 py-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Hover cards</h2>
        </header>
        <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
          <input
            type="checkbox"
            checked={shown.hover}
            onChange={(e) => run({ hover: e.target.checked }, () => setHover(e.target.checked))}
            className="mt-0.5 accent-[var(--accent)]"
          />
          <span>
            <span className="block font-medium">Show details when I rest the mouse on something</span>
            <span className="block text-[12.5px] text-ink-2">
              Results, medications, problems, allergies, notes, orders, visits and patient names open a card with the details behind them. Buttons and badges say what they do. Keyboard users get the same card by tabbing to the item; Esc closes it.
            </span>
          </span>
        </label>
      </section>

      {areas.map((a) => {
        const hideable = a.items.filter((i) => !i.locked);
        const hiddenHere = hideable.filter((i) => shown.hidden.includes(i.key));
        return (
          <section key={a.id} className="rounded-md border border-line bg-panel">
            <header className="flex items-baseline gap-3 border-b border-line px-4 py-2">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">{a.label}</h2>
              <span className="text-[12px] text-ink-3">{a.where}</span>
              <button
                type="button"
                disabled={hiddenHere.length === 0}
                onClick={() => run({ keys: hideable.map((i) => i.key), hide: false }, () => setHidden(hideable.map((i) => i.key), false))}
                className="ml-auto text-[12px] text-accent hover:underline disabled:text-ink-3 disabled:no-underline"
              >
                Show all
              </button>
            </header>
            <div className="grid grid-cols-1 gap-x-4 px-4 py-2 sm:grid-cols-2">
              {a.items.map((i) => {
                const on = i.locked ? true : !shown.hidden.includes(i.key);
                return (
                  <label key={i.key} className={`flex items-center gap-2 py-1 ${i.locked ? "text-ink-3" : "cursor-pointer"}`} title={i.locked}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!!i.locked}
                      onChange={(e) => run({ keys: [i.key], hide: !e.target.checked }, () => setHidden([i.key], !e.target.checked))}
                      className="accent-[var(--accent)]"
                    />
                    {i.label}
                    {i.locked && <span className="text-[11.5px]">({i.locked.toLowerCase()})</span>}
                  </label>
                );
              })}
            </div>
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => run("reset", () => resetView())}
        className="rounded border border-line bg-panel px-3 py-1.5 text-[12.5px] font-medium hover:border-accent hover:text-accent"
      >
        Show everything again
      </button>
    </div>
  );
}
