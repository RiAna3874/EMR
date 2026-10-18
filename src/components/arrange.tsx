"use client";

import { createContext, useContext, useOptimistic, useRef, useState, useTransition } from "react";
import { setOrder, setWide } from "@/app/account/view/actions";
import { moved } from "@/lib/view-prefs";

// Moving things around on one screen area (chart tabs, sidebar sections, Summary panels, top bar).
// The provider holds the area's order so the View menu and the dragged items stay in step; the
// order is saved to the person's account (src/lib/view-prefs.ts).
type Arrangement = {
  area: string;
  // Every movable key in the area, hidden ones included, in the person's order.
  order: string[];
  drag: boolean;
  wide: string[];
  move: (order: string[]) => void;
  setWide: (key: string, wide: boolean) => void;
};

const Ctx = createContext<Arrangement | null>(null);

export const useArrangement = (area: string) => {
  const a = useContext(Ctx);
  return a?.area === area ? a : null;
};

type Change = { order: string[] } | { key: string; wide: boolean };

export function Arrange({ area, order, drag, wide = [], children }: { area: string; order: string[]; drag: boolean; wide?: string[]; children: React.ReactNode }) {
  const [, startTransition] = useTransition();
  const [now, apply] = useOptimistic({ order, wide }, (cur, c: Change) =>
    "order" in c ? { ...cur, order: c.order } : { ...cur, wide: c.wide ? [...cur.wide.filter((k) => k !== c.key), c.key] : cur.wide.filter((k) => k !== c.key) },
  );
  const value: Arrangement = {
    area,
    order: now.order,
    drag,
    wide: now.wide,
    move: (next) =>
      startTransition(async () => {
        apply({ order: next });
        await setOrder(area, next);
      }),
    setWide: (key, w) =>
      startTransition(async () => {
        apply({ key, wide: w });
        await setWide(key, w);
      }),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export type SortItem = { key: string; node: React.ReactNode; className?: string };

// Draggable items in the area's order. Drag an item (or its grip, with `grip`) onto another to
// move it there; Alt + an arrow key moves the focused item. With dragging turned off it's a plain list.
// `grip` "left" sits in the item's left padding; "top" is a bar centred on its top edge (panels).
export function Sortable({
  area,
  items,
  className = "",
  grip = false,
  vertical = false,
  label,
}: {
  area: string;
  items: SortItem[];
  className?: string;
  grip?: false | "left" | "top";
  vertical?: boolean;
  label: string;
}) {
  const a = useArrangement(area);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const lastTarget = useRef<string | null>(null);
  const els = useRef(new Map<string, HTMLElement>());

  const order = preview ?? a?.order ?? items.map((i) => i.key);
  const rank = new Map(order.map((k, n) => [k, n]));
  const shown = [...items].sort((x, y) => (rank.get(x.key) ?? 999) - (rank.get(y.key) ?? 999));
  const on = !!a?.drag;

  function over(target: string) {
    if (!dragging || target === dragging || target === lastTarget.current) return;
    lastTarget.current = target;
    const cur = preview ?? a!.order;
    setPreview(moved(cur, dragging, cur.indexOf(target) - cur.indexOf(dragging)));
  }
  function end(commit: boolean) {
    if (commit && preview && a && preview.join() !== a.order.join()) a.move(preview);
    setPreview(null);
    setDragging(null);
    setArmed(null);
    lastTarget.current = null;
  }
  // Alt + arrow moves the item past its visible neighbour (hidden items keep their places).
  function keyMove(e: React.KeyboardEvent, key: string) {
    if (!on || !e.altKey) return;
    const back = vertical ? e.key === "ArrowUp" : e.key === "ArrowLeft";
    const fwd = vertical ? e.key === "ArrowDown" : e.key === "ArrowRight";
    if (!back && !fwd) return;
    e.preventDefault();
    const i = shown.findIndex((s) => s.key === key);
    const neighbour = shown[i + (back ? -1 : 1)];
    if (!neighbour) return;
    a!.move(moved(a!.order, key, a!.order.indexOf(neighbour.key) - a!.order.indexOf(key)));
  }

  return (
    <div
      className={className}
      onDragOver={(e) => dragging && e.preventDefault()}
      onDrop={(e) => dragging && e.preventDefault()}
      role={on ? "list" : undefined} aria-label={on ? `${label}. Drag to move, or Alt and an arrow key.` : undefined}>
      {shown.map((it) => (
        <div
          key={it.key}
          ref={(el) => {
            if (el) els.current.set(it.key, el);
            else els.current.delete(it.key);
          }}
          role={on ? "listitem" : undefined}
          data-sort-key={it.key}
          draggable={on && (!grip || armed === it.key)}
          onDragStart={(e) => {
            if (!on) return;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", it.key);
            const el = els.current.get(it.key);
            if (el) e.dataTransfer.setDragImage(el, 12, 12);
            setDragging(it.key);
          }}
          onDragEnter={() => over(it.key)}
          onDragOver={(e) => {
            if (!dragging) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            over(it.key);
          }}
          onDrop={(e) => dragging && e.preventDefault()}
          // Dropped anywhere in the list keeps the new place; Esc puts it back.
          onDragEnd={(e) => end(e.dataTransfer.dropEffect !== "none")}
          onKeyDown={(e) => keyMove(e, it.key)}
          className={`group/sort relative ${it.className ?? ""} ${dragging === it.key ? "opacity-40" : ""} ${on && !grip ? "cursor-grab active:cursor-grabbing" : ""}`}
        >
          {on && grip && (
            <button
              type="button"
              aria-label={`Move ${label.toLowerCase()} item`}
              title="Drag to move"
              onPointerDown={() => setArmed(it.key)}
              onPointerUp={() => setArmed(null)}
              className={`absolute z-10 flex cursor-grab items-center justify-center rounded text-ink-3 opacity-0 hover:bg-panel-muted hover:text-ink focus:opacity-100 active:cursor-grabbing group-hover/sort:opacity-100 print:hidden ${
                grip === "top" ? "left-1/2 top-0 h-3.5 w-8 -translate-x-1/2" : "left-0.5 top-2 h-5 w-3.5"
              }`}
              tabIndex={-1}
            >
              <span className={grip === "top" ? "rotate-90" : ""}>
                <GripIcon />
              </span>
            </button>
          )}
          {it.node}
        </div>
      ))}
    </div>
  );
}

export function GripIcon() {
  return (
    <svg width="8" height="12" viewBox="0 0 8 12" fill="currentColor" aria-hidden>
      {[1.5, 6, 10.5].flatMap((y) => [<circle key={`a${y}`} cx="2" cy={y} r="1.1" />, <circle key={`b${y}`} cx="6" cy={y} r="1.1" />])}
    </svg>
  );
}
