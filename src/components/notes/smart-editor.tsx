"use client";

import { forwardRef, useImperativeHandle, useMemo, useRef, useState } from "react";
import { chartLinks } from "@/lib/notes/library";
import { expand, findMarkers, markerAt, nextMarker, resolvePick, segments, type Marker, type Phrase } from "@/lib/notes/smarttext";

type Suggest = { trigger: "." | "@"; start: number; query: string; active: number };
type PickState = { start: number; active: number; chosen: number[] };
type Item = { key: string; label: string; description: string; preview?: string; text: string };

export type SmartEditorHandle = {
  insert(text: string, opts?: { block?: boolean; gap?: boolean }): void;
  next(back?: boolean): void;
  focus(): void;
};

// A plain-text note editor that understands smart text: "." and "@" open
// phrase and chart-data suggestions, F2 / Shift+F2 walk the *** blanks and
// pick lists, and picking from a list replaces it with the chosen text.
// The textarea sits over a mirror that paints the highlights, so typing stays
// native (spellcheck, undo, selection) while markers stay visible.
export const SmartEditor = forwardRef<SmartEditorHandle, {
  name: string;
  value: string;
  onChange: (v: string) => void;
  phrases: Phrase[];
  links: Record<string, string>;
  placeholder?: string;
  autoFocus?: boolean;
}>(function SmartEditor({ name, value, onChange, phrases, links, placeholder, autoFocus }, ref) {
  const ta = useRef<HTMLTextAreaElement>(null);
  const mirror = useRef<HTMLDivElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const quiet = useRef(false);
  const [suggest, setSuggest] = useState<Suggest | null>(null);
  const [pick, setPick] = useState<PickState | null>(null);
  const [popup, setPopup] = useState<{ top?: number; bottom?: number; left: number } | null>(null);

  const ctx = useMemo(() => ({ phrases: Object.fromEntries(phrases.map((p) => [p.name, p])), links }), [phrases, links]);

  const items: Item[] = useMemo(() => {
    if (!suggest) return [];
    const q = suggest.query.toLowerCase();
    if (suggest.trigger === ".") {
      const starts = phrases.filter((p) => p.name.startsWith(q));
      const contains = phrases.filter((p) => !p.name.startsWith(q) && (p.name.includes(q) || p.description.toLowerCase().includes(q)));
      return [...starts, ...contains].slice(0, 8).map((p) => ({
        key: p.name,
        label: `.${p.name}`,
        description: p.description + (p.mine ? " · mine" : ""),
        text: expand(p.body, ctx),
      }));
    }
    return chartLinks
      .filter((l) => l.name.toLowerCase().startsWith(q) || (q.length > 1 && l.description.toLowerCase().includes(q)))
      .slice(0, 8)
      .map((l) => ({ key: l.name, label: `@${l.name}@`, description: l.description, preview: links[l.name]?.split("\n")[0], text: links[l.name] ?? `@${l.name}@` }));
  }, [suggest, phrases, links, ctx]);

  const pickMarker = useMemo(() => {
    if (!pick) return null;
    const m = findMarkers(value).find((x) => x.start === pick.start);
    return m?.kind === "pick" ? m : null;
  }, [pick, value]);

  function place(pos: number) {
    const el = ta.current!;
    const c = caretCoords(el, pos);
    // Keep the caret in view, then anchor the popup under it.
    if (c.top < el.scrollTop || c.top + c.height > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, c.top - el.clientHeight / 3);
    syncScroll();
    const width = wrap.current?.clientWidth ?? 600;
    const height = wrap.current?.clientHeight ?? 400;
    const y = c.top - el.scrollTop;
    const left = Math.max(8, Math.min(c.left, width - 340));
    // Open below the line, or above it when the line is near the bottom.
    setPopup(y + c.height + 280 > height && y > 200 ? { bottom: height - y + 4, left } : { top: y + c.height + 4, left });
  }

  function select(m: Marker) {
    const el = ta.current!;
    el.focus();
    el.setSelectionRange(m.start, m.end);
    setSuggest(null);
    if (m.kind === "pick") {
      setPick({ start: m.start, active: 0, chosen: [] });
      place(m.start);
    } else {
      setPick(null);
      place(m.start);
      setPopup(null);
    }
  }

  // Replace a range through the browser's own editing command so undo keeps working.
  function replace(start: number, end: number, text: string) {
    const el = ta.current!;
    el.focus();
    el.setSelectionRange(start, end);
    quiet.current = true;
    let ok = false;
    try {
      ok = text.length > 0 && document.execCommand("insertText", false, text);
    } catch {
      ok = false;
    }
    quiet.current = false;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    if (!ok) onChange(next);
    setSuggest(null);
    setPick(null);
    setPopup(null);
    const inside = findMarkers(next).find((m) => m.start >= start && m.end <= start + text.length);
    requestAnimationFrame(() => {
      if (inside) select(inside);
      else {
        el.setSelectionRange(start + text.length, start + text.length);
        place(start + text.length);
        setPopup(null);
      }
    });
  }

  useImperativeHandle(ref, () => ({
    insert(text, opts) {
      const el = ta.current!;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      let t = expand(text, ctx);
      if (opts?.block) {
        if (start > 0 && el.value[start - 1] !== "\n") t = "\n" + t;
        // gap: keep a blank line between blocks, as between problems in an A&P.
        if (opts.gap && start > 1 && el.value.slice(0, start).trimEnd() && !el.value.slice(0, start).endsWith("\n\n")) t = "\n" + t;
        if (el.value[end] !== "\n") t += "\n";
      }
      replace(start, end, t);
    },
    next(back) {
      const el = ta.current!;
      const m = nextMarker(el.value, back ? el.selectionStart : el.selectionEnd, back);
      if (m) select(m);
      else el.focus();
    },
    focus() {
      ta.current?.focus();
    },
  }));

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const el = e.target;
    const v = el.value;
    onChange(v);
    if (quiet.current) return;
    setPick(null);
    const caret = el.selectionStart;
    const before = v.slice(0, caret);

    // ".name" + space/Enter expands at once; so does a completed "@NAME@".
    const ph = before.match(/(^|[\s(])\.([a-z][a-z0-9_]*)([ \n])$/i);
    if (ph && ctx.phrases[ph[2].toLowerCase()]) {
      const start = caret - ph[2].length - 2;
      const text = expand(ctx.phrases[ph[2].toLowerCase()].body, ctx) + ph[3];
      requestAnimationFrame(() => replace(start, caret, text));
      return;
    }
    const ln = before.match(/@([A-Z][A-Z0-9_]*)@$/);
    if (ln && links[ln[1]] !== undefined) {
      const start = caret - ln[0].length;
      requestAnimationFrame(() => replace(start, caret, links[ln[1]]));
      return;
    }

    const s = before.match(/(^|[\s(])([.@])([A-Za-z][\w]*)?$/);
    if (s && (s[2] === "@" || s[3])) {
      const start = caret - (s[3]?.length ?? 0) - 1;
      setSuggest({ trigger: s[2] as "." | "@", start, query: s[3] ?? "", active: 0 });
      place(start);
    } else {
      setSuggest(null);
      setPopup(null);
    }
  }

  function applyPick(chosen: number[], m = pickMarker) {
    if (!m || !chosen.length) return;
    replace(m.start, m.end, resolvePick(m, chosen));
  }

  // A pick list that is selected but whose popup was closed (focus moved away
  // and back) still answers to number keys rather than being typed over.
  function selectedPick(el: HTMLTextAreaElement) {
    const m = markerAt(el.value, el.selectionStart);
    return m?.kind === "pick" && el.selectionStart === m.start && el.selectionEnd === m.end ? m : null;
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    let activePick = pick;
    let activeMarker = pickMarker;
    if (!activeMarker && !suggest) {
      const m = selectedPick(el);
      if (m) {
        activePick = { start: m.start, active: 0, chosen: [] };
        activeMarker = m;
        setPick(activePick);
        place(m.start);
      }
    }
    if (suggest && items.length) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const d = e.key === "ArrowDown" ? 1 : -1;
        setSuggest({ ...suggest, active: (suggest.active + d + items.length) % items.length });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        replace(suggest.start, el.selectionStart, items[suggest.active].text);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggest(null);
        setPopup(null);
        return;
      }
    }
    if (activePick && activeMarker) {
      const n = activeMarker.options.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setPick({ ...activePick, active: (activePick.active + (e.key === "ArrowDown" ? 1 : -1) + n) % n });
        return;
      }
      const digit = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
      if (digit >= 0 && digit < n) {
        e.preventDefault();
        if (activeMarker.multi) setPick({ ...activePick, active: digit, chosen: toggle(activePick.chosen, digit) });
        else applyPick([digit], activeMarker);
        return;
      }
      if (e.key === " " && activeMarker.multi) {
        e.preventDefault();
        setPick({ ...activePick, chosen: toggle(activePick.chosen, activePick.active) });
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        applyPick(activeMarker.multi && activePick.chosen.length ? activePick.chosen : [activePick.active], activeMarker);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        el.setSelectionRange(activeMarker.end, activeMarker.end);
        setPick(null);
        setPopup(null);
        return;
      }
    }
    if (e.key === "F2") {
      e.preventDefault();
      const m = nextMarker(el.value, e.shiftKey ? el.selectionStart : el.selectionEnd, e.shiftKey);
      if (m) select(m);
    }
  }

  // Clicking a marker selects it (and opens a pick list) so it can be answered straight away.
  function onClick(e: React.MouseEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    if (el.selectionStart !== el.selectionEnd) return;
    const m = markerAt(el.value, el.selectionStart);
    if (m && el.selectionStart > m.start && el.selectionStart < m.end) select(m);
    else {
      setPick(null);
      setSuggest(null);
      setPopup(null);
    }
  }

  function syncScroll() {
    if (mirror.current && ta.current) mirror.current.scrollTop = ta.current.scrollTop;
  }

  const textCls = "absolute inset-0 overflow-y-scroll whitespace-pre-wrap break-words px-5 py-4 font-mono text-[13px] leading-[1.65]";

  return (
    <div ref={wrap} className="relative min-h-0 flex-1 bg-panel">
      <div ref={mirror} aria-hidden className={`${textCls} pointer-events-none text-transparent`}>
        {segments(value).map((s, i) =>
          s.marker ? (
            <mark
              key={i}
              className={`rounded-[3px] text-transparent ${
                s.marker.kind === "blank" ? "bg-warn-soft outline outline-1 outline-warn/50" : "bg-accent-soft outline outline-1 outline-accent/50"
              }`}
            >
              {s.text}
            </mark>
          ) : (
            <span key={i}>{s.text}</span>
          ),
        )}
        {"\n "}
      </div>
      <textarea
        ref={ta}
        name={name}
        value={value}
        onChange={handleChange}
        onKeyDown={onKeyDown}
        onClick={onClick}
        onScroll={syncScroll}
        onFocus={(e) => {
          const m = selectedPick(e.currentTarget);
          if (m && !pick) {
            setPick({ start: m.start, active: 0, chosen: [] });
            place(m.start);
          }
        }}
        onBlur={() => {
          setSuggest(null);
          setPick(null);
          setPopup(null);
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        spellCheck
        className={`${textCls} h-full w-full resize-none bg-transparent text-ink caret-ink outline-none`}
      />

      {popup && suggest && items.length > 0 && (
        <div style={popup} className="absolute z-20 w-[340px] overflow-hidden rounded-md border border-line bg-panel shadow-lg">
          <div className="border-b border-line bg-panel-muted px-2.5 py-1 text-[11px] text-ink-3">
            {suggest.trigger === "." ? "Phrases" : "Chart data"} · ↑↓ to move, Enter to insert
          </div>
          <ul>
            {items.map((it, i) => (
              <li key={it.key}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    replace(suggest.start, ta.current!.selectionStart, it.text);
                  }}
                  className={`block w-full px-2.5 py-1.5 text-left ${i === suggest.active ? "bg-accent-soft" : "hover:bg-panel-muted"}`}
                >
                  <span className="font-mono text-[12px] font-semibold text-accent">{it.label}</span>
                  <span className="ml-2 text-[12px] text-ink-2">{it.description}</span>
                  {it.preview && <span className="block truncate text-[11.5px] text-ink-3">{it.preview}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {popup && pick && pickMarker && (
        <div style={popup} className="absolute z-20 w-[300px] overflow-hidden rounded-md border border-line bg-panel shadow-lg">
          <div className="flex items-center justify-between border-b border-line bg-panel-muted px-2.5 py-1 text-[11.5px]">
            <span className="font-semibold text-ink-2">{pickMarker.label}</span>
            <span className="text-ink-3">{pickMarker.multi ? "Choose any" : "Choose one"}</span>
          </div>
          <ul className="max-h-64 overflow-y-auto py-0.5">
            {pickMarker.options.map((o, i) => {
              const on = pick.chosen.includes(i);
              return (
                <li key={i}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      if (pickMarker.multi) setPick({ ...pick, active: i, chosen: toggle(pick.chosen, i) });
                      else applyPick([i]);
                    }}
                    className={`flex w-full items-center gap-2 px-2.5 py-1 text-left text-[12.5px] ${i === pick.active ? "bg-accent-soft" : "hover:bg-panel-muted"}`}
                  >
                    <span className="w-4 shrink-0 text-right font-mono text-[11px] text-ink-3">{i < 9 ? i + 1 : ""}</span>
                    {pickMarker.multi && (
                      <span className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm border text-[10px] ${on ? "border-accent bg-accent text-white" : "border-line"}`}>{on ? "✓" : ""}</span>
                    )}
                    <span>{o}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-center justify-between border-t border-line bg-panel-muted px-2.5 py-1 text-[11px] text-ink-3">
            <span>{pickMarker.multi ? "Number or Space to toggle, Enter to accept" : "Number or Enter to choose"}</span>
            {pickMarker.multi && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  applyPick(pick.chosen.length ? pick.chosen : [pick.active]);
                }}
                className="rounded bg-accent px-1.5 py-0.5 font-medium text-white"
              >
                Accept
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

const toggle = (list: number[], i: number) => (list.includes(i) ? list.filter((x) => x !== i) : [...list, i]);

// Pixel position of a character in a textarea, measured with an off-screen copy.
function caretCoords(el: HTMLTextAreaElement, pos: number) {
  const style = getComputedStyle(el);
  const div = document.createElement("div");
  const props = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing", "tabSize", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"] as const;
  for (const p of props) div.style[p] = style[p];
  Object.assign(div.style, {
    position: "absolute",
    visibility: "hidden",
    top: "0",
    left: "-9999px",
    boxSizing: "border-box",
    width: `${el.clientWidth}px`,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
  });
  div.textContent = el.value.slice(0, pos);
  const span = document.createElement("span");
  span.textContent = el.value.slice(pos, pos + 1) || ".";
  div.appendChild(span);
  document.body.appendChild(div);
  const out = { top: span.offsetTop, left: span.offsetLeft, height: parseFloat(style.lineHeight) || 20 };
  document.body.removeChild(div);
  return out;
}
