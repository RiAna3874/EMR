"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// When a search result opens its source (?hl=word|other words), the words are
// highlighted on the page and the first one scrolled into view, with a small bar
// to step through them. Uses the CSS Custom Highlight API, so the page's own
// markup is never changed; browsers without it simply open the page.

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

type HighlightRegistry = { set(name: string, h: unknown): void; delete(name: string): void };
const registry = () => (typeof CSS !== "undefined" && "highlights" in CSS ? (CSS as unknown as { highlights: HighlightRegistry }).highlights : null);

function findRanges(root: HTMLElement, terms: string[]): Range[] {
  const find = (patterns: string[]) => {
    const re = new RegExp(patterns.map(escape).sort((a, b) => b.length - a.length).join("|"), "giu");
    const ranges: Range[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const p = n.parentElement;
        if (!p || p.closest("script,style,[data-search-highlight-bar],[aria-hidden=true]") || !p.getClientRects().length) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.nodeValue ?? "";
      for (const m of text.matchAll(re)) {
        const r = document.createRange();
        r.setStart(n, m.index!);
        r.setEnd(n, m.index! + m[0].length);
        ranges.push(r);
      }
    }
    return ranges;
  };
  const ranges = find(terms);
  if (ranges.length) return ranges;
  // A phrase split across elements on the page: highlight its words instead.
  const parts = [...new Set(terms.flatMap((t) => t.split(/\s+/)).filter((w) => w.length >= 3))];
  return parts.length ? find(parts) : [];
}

export function SearchHighlighter({ rootId }: { rootId: string }) {
  const hl = useSearchParams().get("hl");
  const [ranges, setRanges] = useState<Range[]>([]);
  const [current, setCurrent] = useState(0);
  const [closed, setClosed] = useState(false);
  const scrolled = useRef(false);

  useEffect(() => {
    setClosed(false);
    scrolled.current = false;
    const reg = registry();
    const root = document.getElementById(rootId);
    const terms = (hl ?? "").split("|").map((t) => t.trim()).filter(Boolean).slice(0, 12);
    if (!reg || !root || !terms.length) {
      setRanges([]);
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      const found = findRanges(root, terms);
      setRanges(found);
      setCurrent(0);
      const HighlightCtor = (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
      reg.set("search-hit", new HighlightCtor(...found));
      if (found.length && !scrolled.current) {
        scrolled.current = true;
        found[0].startContainer.parentElement?.scrollIntoView({ block: "center" });
        reg.set("search-hit-current", new HighlightCtor(found[0]));
      }
    };
    run();
    // The page may still be filling in (streamed sections, client components).
    const mo = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(run, 120);
    });
    mo.observe(root, { childList: true, subtree: true, characterData: true });
    const stop = setTimeout(() => mo.disconnect(), 4000);
    return () => {
      mo.disconnect();
      clearTimeout(timer);
      clearTimeout(stop);
      reg.delete("search-hit");
      reg.delete("search-hit-current");
    };
  }, [hl, rootId]);

  const go = useCallback(
    (i: number) => {
      if (!ranges.length) return;
      const next = (i + ranges.length) % ranges.length;
      setCurrent(next);
      const reg = registry();
      const HighlightCtor = (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight;
      reg?.set("search-hit-current", new HighlightCtor(ranges[next]));
      ranges[next].startContainer.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    },
    [ranges],
  );

  function close() {
    setClosed(true);
    registry()?.delete("search-hit");
    registry()?.delete("search-hit-current");
    const url = new URL(window.location.href);
    url.searchParams.delete("hl");
    window.history.replaceState(null, "", url);
  }

  if (!hl || closed || !ranges.length) return null;
  return (
    <div data-search-highlight-bar className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1.5 text-[12px] text-ink-2 shadow-lg print:hidden">
      <span>
        Found <b className="text-ink">{hl.split("|").slice(0, 3).join(", ")}</b> · {current + 1} of {ranges.length}
      </span>
      <button onClick={() => go(current - 1)} className="rounded px-1.5 hover:bg-panel-muted" aria-label="Previous match">
        ↑
      </button>
      <button onClick={() => go(current + 1)} className="rounded px-1.5 hover:bg-panel-muted" aria-label="Next match">
        ↓
      </button>
      <button onClick={close} className="rounded px-1.5 hover:bg-panel-muted" aria-label="Clear highlighting">
        ✕
      </button>
    </div>
  );
}
