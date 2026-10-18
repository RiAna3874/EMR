"use client";

import { useOptimistic, useTransition } from "react";
import { DEFAULT_PREFS, movableOrder, moved, TEXT_SIZES, type ViewArea, type ViewItem, type ViewPrefs } from "@/lib/view-prefs";
import { Arrange, Sortable, useArrangement } from "@/components/arrange";
import { MoveButton } from "@/components/view-menu";
import { resetArea, resetView, setDrag, setHidden, setHover, setStartTab, setTextSize } from "./actions";

type Change = { keys: string[]; hide: boolean } | { set: Partial<ViewPrefs> } | "reset";

const SIZE_LABEL: Record<number, string> = { 90: "Smaller", 100: "Normal", 110: "Larger", 125: "Largest" };

// `startTabs` are the chart tabs this person can open, for "Open charts on".
export function ViewOptions({ areas, prefs, startTabs }: { areas: ViewArea[]; prefs: ViewPrefs; startTabs: { slug: string; label: string }[] }) {
  const [, startTransition] = useTransition();
  const [shown, apply] = useOptimistic(prefs, (cur: ViewPrefs, c: Change): ViewPrefs => {
    if (c === "reset") return DEFAULT_PREFS;
    if ("set" in c) return { ...cur, ...c.set };
    return { ...cur, hidden: c.hide ? [...new Set([...cur.hidden, ...c.keys])] : cur.hidden.filter((k) => !c.keys.includes(k)) };
  });
  const run = (c: Change, action: () => Promise<void>) =>
    startTransition(async () => {
      apply(c);
      await action();
    });
  const hide = (keys: string[], hidden: boolean) => run({ keys, hide: hidden }, () => setHidden(keys, hidden));

  return (
    <div className="space-y-4">
      <section className="rounded-md border border-line bg-panel">
        <header className="border-b border-line px-4 py-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Layout</h2>
        </header>
        <div className="divide-y divide-line">
          <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
            <input
              type="checkbox"
              checked={shown.drag}
              onChange={(e) => run({ set: { drag: e.target.checked } }, () => setDrag(e.target.checked))}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="block font-medium">Let me drag things to move them</span>
              <span className="block text-[12.5px] text-ink-2">
                Drag chart tabs and top bar links sideways, and sidebar sections and Summary panels by the grip that appears when you point at them. Alt and an arrow key moves the one you&apos;re on. Turn this off to lock the layout; the arrows below and in each View menu still work.
              </span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="min-w-40">
              <span className="block font-medium">Text size</span>
              <span className="block text-[12.5px] text-ink-2">Everything below the top bar.</span>
            </span>
            <div role="radiogroup" aria-label="Text size" className="flex overflow-hidden rounded border border-line">
              {TEXT_SIZES.map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={shown.textSize === n}
                  onClick={() => run({ set: { textSize: n } }, () => setTextSize(n))}
                  className={`border-l border-line px-3 py-1 first:border-l-0 ${shown.textSize === n ? "bg-accent font-medium text-white" : "hover:bg-accent-soft/50"}`}
                  style={{ fontSize: `${(12.5 * n) / 100}px` }}
                >
                  {SIZE_LABEL[n]}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
            <span className="min-w-40">
              <span className="block font-medium">Open charts on</span>
              <span className="block text-[12.5px] text-ink-2">The tab you land on when you open a patient. The Summary tab is always one click away.</span>
            </span>
            <select
              value={shown.startTab}
              onChange={(e) => run({ set: { startTab: e.target.value } }, () => setStartTab(e.target.value))}
              className="rounded border border-line bg-panel px-2 py-1"
            >
              {startTabs.map((t) => (
                <option key={t.slug} value={t.slug}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-md border border-line bg-panel">
        <header className="border-b border-line px-4 py-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Hover cards</h2>
        </header>
        <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
          <input
            type="checkbox"
            checked={shown.hover}
            onChange={(e) => run({ set: { hover: e.target.checked } }, () => setHover(e.target.checked))}
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
        const hideable = a.orderOnly ? [] : a.items.filter((i) => !i.locked);
        const hiddenHere = hideable.filter((i) => shown.hidden.includes(i.key));
        if (a.reorder)
          return (
            <Arrange key={a.id} area={a.id} order={movableOrder(prefs, a.id)} drag wide={prefs.wide}>
              <OrderedArea area={a} hidden={shown.hidden} hide={hide} hiddenCount={hiddenHere.length} />
            </Arrange>
          );
        return (
          <section key={a.id} className="rounded-md border border-line bg-panel">
            <header className="flex items-baseline gap-3 border-b border-line px-4 py-2">
              <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">{a.label}</h2>
              <span className="text-[12px] text-ink-3">{a.where}</span>
              <button
                type="button"
                disabled={hiddenHere.length === 0}
                onClick={() => hide(hideable.map((i) => i.key), false)}
                className="ml-auto text-[12px] text-accent hover:underline disabled:text-ink-3 disabled:no-underline"
              >
                Show all
              </button>
            </header>
            <div className="grid grid-cols-1 gap-x-4 px-4 py-2 sm:grid-cols-2">
              {a.items.map((i) => (
                <ItemCheck key={i.key} item={i} on={i.locked ? true : !shown.hidden.includes(i.key)} hide={hide} />
              ))}
            </div>
          </section>
        );
      })}

      <button
        type="button"
        onClick={() => run("reset", () => resetView())}
        className="rounded border border-line bg-panel px-3 py-1.5 text-[12.5px] font-medium hover:border-accent hover:text-accent"
      >
        Put everything back as it came
      </button>
    </div>
  );
}

function ItemCheck({ item: i, on, hide }: { item: ViewItem; on: boolean; hide: (keys: string[], hidden: boolean) => void }) {
  return (
    <label className={`flex min-w-0 flex-1 items-center gap-2 py-1 ${i.locked ? "text-ink-3" : "cursor-pointer"}`} title={i.locked}>
      <input type="checkbox" checked={on} disabled={!!i.locked} onChange={(e) => hide([i.key], !e.target.checked)} className="accent-[var(--accent)]" />
      {i.label}
      {i.locked && <span className="text-[11.5px]">({i.locked.toLowerCase()})</span>}
    </label>
  );
}

// An area whose items can be put in order: pinned ones first, then the rest with a grip and arrows.
function OrderedArea({ area: a, hidden, hide, hiddenCount }: { area: ViewArea; hidden: string[]; hide: (keys: string[], hidden: boolean) => void; hiddenCount: number }) {
  const [, startTransition] = useTransition();
  const arr = useArrangement(a.id)!;
  const pinned = a.items.filter((i) => i.pinned);
  const standard = a.items.filter((i) => !i.pinned).map((i) => i.key);
  const changed = hiddenCount > 0 || arr.order.join() !== standard.join() || (a.id === "summary" && arr.wide.length > 0);
  const byKey = new Map(a.items.map((i) => [i.key, i]));
  return (
    <section className="rounded-md border border-line bg-panel">
      <header className="flex items-baseline gap-3 border-b border-line px-4 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">{a.label}</h2>
        <span className="text-[12px] text-ink-3">{a.where}</span>
        <button
          type="button"
          disabled={!changed}
          onClick={() => startTransition(() => resetArea(a.id))}
          title={a.orderOnly ? "Back to the standard order" : "Show everything here in the standard order"}
          className="ml-auto text-[12px] text-accent hover:underline disabled:text-ink-3 disabled:no-underline"
        >
          Reset
        </button>
      </header>
      <div className="px-4 py-2">
        {pinned.map((i) => (
          <div key={i.key} className="flex items-center gap-2 py-1 pl-5 text-ink-3" title={i.pinned}>
            <ItemCheck item={i} on={i.locked ? true : !hidden.includes(i.key)} hide={hide} />
            <span className="text-[11.5px]">{i.pinned}</span>
          </div>
        ))}
        <Sortable
          area={a.id}
          label={a.label}
          vertical
          grip="left"
          items={arr.order.map((k, n) => {
            const i = byKey.get(k)!;
            const wide = arr.wide.includes(k);
            return {
              key: k,
              className: "rounded hover:bg-accent-soft/40",
              node: (
                <div className="flex items-center gap-1 py-0.5 pl-5 pr-1">
                  {a.orderOnly ? <span className="flex-1 py-1">{i.label}</span> : <ItemCheck item={i} on={!hidden.includes(k)} hide={hide} />}
                  {a.id === "summary" && (
                    <button
                      type="button"
                      onClick={() => arr.setWide(k, !wide)}
                      aria-pressed={wide}
                      title={wide ? "Make this panel normal width" : "Make this panel twice as wide"}
                      className={`rounded px-1.5 text-[11.5px] ${wide ? "bg-accent-soft font-medium text-accent" : "text-ink-3 hover:text-ink"}`}
                    >
                      Wide
                    </button>
                  )}
                  <MoveButton dir="up" label={i.label} disabled={n === 0} onClick={() => arr.move(moved(arr.order, k, -1))} />
                  <MoveButton dir="down" label={i.label} disabled={n === arr.order.length - 1} onClick={() => arr.move(moved(arr.order, k, 1))} />
                </div>
              ),
            };
          })}
        />
      </div>
    </section>
  );
}
