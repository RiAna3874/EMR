"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useHoverOn } from "./hover-card";

const OPEN_MS = 300;

// Every element across the app with a `title` gets a quick, readable tip instead of the
// browser's slow grey one. Mounted once in the root layout; off when hover cards are off.
export function Tips() {
  const on = useHoverOn();
  const [tip, setTip] = useState<{ text: string; x: number; top: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!on) return;
    let current: HTMLElement | null = null;
    let timer: number | undefined;

    function restore() {
      window.clearTimeout(timer);
      if (current?.dataset.tipTitle !== undefined) {
        current.setAttribute("title", current.dataset.tipTitle);
        delete current.dataset.tipTitle;
      }
      current = null;
      setTip(null);
    }
    function start(el: HTMLElement, now: boolean) {
      if (el === current) return;
      restore();
      const text = el.getAttribute("title");
      if (!text) return;
      current = el;
      // Keep the words for screen readers, and stop the browser's own tip from showing too.
      if (!el.hasAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", text);
      el.dataset.tipTitle = text;
      el.removeAttribute("title");
      const open = () => {
        if (current !== el || !el.isConnected) return;
        const r = el.getBoundingClientRect();
        setTip({ text, x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
      };
      if (now) open();
      else timer = window.setTimeout(open, OPEN_MS);
    }
    const titled = (t: EventTarget | null) => (t instanceof Element ? (t.closest("[title]") as HTMLElement | null) : null);

    function over(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      const el = titled(e.target);
      if (el && !(el instanceof SVGElement)) start(el, false);
      else if (current && !(e.target instanceof Node && current.contains(e.target))) restore();
    }
    function focus(e: FocusEvent) {
      const el = titled(e.target);
      if (el && el === e.target && el.matches(":focus-visible")) start(el, true);
    }
    const leave = (e: Event) => current && e.target instanceof Node && current === e.target && restore();

    document.addEventListener("pointerover", over, true);
    document.addEventListener("focusin", focus, true);
    document.addEventListener("focusout", leave, true);
    document.addEventListener("pointerdown", restore, true);
    window.addEventListener("scroll", restore, true);
    window.addEventListener("keydown", restore, true);
    return () => {
      restore();
      document.removeEventListener("pointerover", over, true);
      document.removeEventListener("focusin", focus, true);
      document.removeEventListener("focusout", leave, true);
      document.removeEventListener("pointerdown", restore, true);
      window.removeEventListener("scroll", restore, true);
      window.removeEventListener("keydown", restore, true);
    };
  }, [on]);

  return tip && <Bubble {...tip} />;
}

// Centred under the element (above it near the bottom of the screen), kept on screen.
function Bubble({ text, x, top, bottom }: { text: string; x: number; top: number; bottom: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const above = bottom + 6 + h > window.innerHeight - 8;
    setPos({ left: Math.max(8, Math.min(x - w / 2, window.innerWidth - w - 8)), top: above ? top - 6 - h : bottom + 6 });
  }, [text, x, top, bottom]);
  return (
    <div
      ref={ref}
      role="tooltip"
      style={{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
      className="pointer-events-none fixed z-[60] max-w-72 rounded bg-ink px-2 py-1 text-[12px] leading-snug text-white shadow-md print:hidden"
    >
      {text}
    </div>
  );
}
