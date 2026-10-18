"use client";

import { createContext, createElement, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// Epic-style hover cards: rest the mouse on something (or tab to it) and a card says what it is
// and the details behind it. Each person can turn them off (View options, /account/view).
const HoverOn = createContext(false);

export function HoverProvider({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <HoverOn.Provider value={on}>{children}</HoverOn.Provider>;
}

export const useHoverOn = () => useContext(HoverOn);

const OPEN_MS = 350;
const CLOSE_MS = 120;
const GAP = 6;

// Only one card is open at a time.
let closeOpen: (() => void) | null = null;

type Tag = "span" | "div" | "li" | "tr" | "td" | "th" | "dd";
type Anchor = { x: number; top: number; bottom: number };

export function Hover({
  as = "span",
  card,
  className,
  children,
  width = 300,
  ...rest
}: {
  as?: Tag;
  card: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  width?: number;
} & Omit<React.HTMLAttributes<HTMLElement>, "children">) {
  const on = useHoverOn();
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const id = useId();

  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (!anchor) return;
    const close = () => setAnchor(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
    };
  }, [anchor]);

  if (!on || card === null || card === undefined || card === false) return createElement(as, { className, ...rest }, children);

  function show(el: HTMLElement, x?: number) {
    window.clearTimeout(timer.current);
    const r = el.getBoundingClientRect();
    if (closeOpen) closeOpen();
    closeOpen = () => setAnchor(null);
    // A wide row puts the card under the pointer; anything narrower lines up with its left edge.
    setAnchor({ x: x !== undefined && r.width > width ? x - 24 : r.left, top: r.top, bottom: r.bottom });
  }
  function later(fn: () => void, ms: number) {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(fn, ms);
  }
  const hide = () => later(() => setAnchor(null), CLOSE_MS);

  return (
    <>
      {createElement(
        as,
        {
          ...rest,
          className,
          "aria-describedby": anchor ? id : undefined,
          onPointerEnter: (e: React.PointerEvent<HTMLElement>) => {
            if (e.pointerType === "touch") return;
            const el = e.currentTarget;
            const x = e.clientX;
            later(() => show(el, x), anchor ? 0 : OPEN_MS);
          },
          onPointerLeave: hide,
          onFocus: (e: React.FocusEvent<HTMLElement>) => {
            if (e.target.matches(":focus-visible")) show(e.currentTarget);
          },
          onBlur: hide,
        },
        children,
      )}
      {anchor &&
        createPortal(
          <Card id={id} anchor={anchor} width={width} onEnter={() => window.clearTimeout(timer.current)} onLeave={hide}>
            {card}
          </Card>,
          document.body,
        )}
    </>
  );
}

function Card({ id, anchor, width, onEnter, onLeave, children }: { id: string; anchor: Anchor; width: number; onEnter: () => void; onLeave: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // Below the item when it fits, otherwise above; never off the side of the screen.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const h = el.offsetHeight;
    const w = el.offsetWidth;
    const below = anchor.bottom + GAP;
    const top = below + h > window.innerHeight - 8 && anchor.top - GAP - h > 8 ? anchor.top - GAP - h : Math.max(8, Math.min(below, window.innerHeight - h - 8));
    const left = Math.max(8, Math.min(anchor.x, window.innerWidth - w - 8));
    setPos({ left, top });
  }, [anchor]);
  return (
    <div
      ref={ref}
      id={id}
      role="tooltip"
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      style={{ left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.bottom + GAP, maxWidth: width, visibility: pos ? "visible" : "hidden" }}
      className="fixed z-50 min-w-48 overflow-hidden rounded-md border border-line bg-panel text-left text-[12.5px] font-normal normal-case tracking-normal text-ink shadow-lg print:hidden"
    >
      {children}
    </div>
  );
}
