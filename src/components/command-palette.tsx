"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { searchOrderables } from "@/lib/orders/catalog";

type Command = { id: string; label: string; hint?: string; group: string; href: string };

const GLOBAL: Command[] = [
  { id: "home", label: "My Day", group: "Go to", href: "/", hint: "g h" },
  { id: "inbox", label: "Inbox", group: "Go to", href: "/inbox", hint: "g i" },
  { id: "lists", label: "Patient Lists", group: "Go to", href: "/patients", hint: "g l" },
  { id: "phrases", label: "My phrases", group: "Go to", href: "/phrases" },
];

const CHART: { slug: string; label: string; key?: string }[] = [
  { slug: "", label: "Summary", key: "s" },
  { slug: "results", label: "Results", key: "r" },
  { slug: "results?view=graph", label: "Results graph" },
  { slug: "vitals", label: "Vitals", key: "v" },
  { slug: "meds", label: "Medications", key: "m" },
  { slug: "problems", label: "Problems", key: "p" },
  { slug: "allergies", label: "Allergies", key: "a" },
  { slug: "notes", label: "Notes", key: "n" },
  { slug: "notes?new=1", label: "New note" },
  { slug: "notes?new=1&template=progress_soap", label: "New office visit note" },
  { slug: "notes?status=cosign", label: "Notes needing cosign" },
  { slug: "orders", label: "Orders", key: "o" },
  { slug: "import", label: "Import report" },
];

const globalKeys: Record<string, string> = { h: "/", i: "/inbox", l: "/patients" };

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
}

// ⌘K / Ctrl+K: find a patient, jump to a chart activity, or start an order.
// "g" then a letter jumps directly (g r = Results, g o = Orders, g i = Inbox...).
// `clinical` false (front desk) limits it to finding patients and their Summary.
export function CommandPalette({ clinical }: { clinical: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [patients, setPatients] = useState<Command[]>([]);
  const chartId = pathname.match(/^\/patients\/([^/]+)/)?.[1];

  useEffect(() => {
    let pendingG = 0;
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
        setQ("");
        setActive(0);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "g") {
        pendingG = Date.now();
        return;
      }
      if (Date.now() - pendingG < 1200) {
        pendingG = 0;
        const tab = CHART.find((c) => c.key === e.key);
        if (chartId && tab) router.push(`/patients/${chartId}${tab.slug ? `/${tab.slug}` : ""}`);
        else if (globalKeys[e.key]) router.push(globalKeys[e.key]);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chartId, router]);

  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setPatients([]);
      return;
    }
    const ctl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/patients?q=${encodeURIComponent(q.trim())}`, { signal: ctl.signal })
        .then((r) => r.json())
        .then((rows: { id: string; name: string; detail: string }[]) =>
          setPatients(rows.map((p) => ({ id: `p:${p.id}`, label: p.name, hint: p.detail, group: "Patients", href: `/patients/${p.id}` }))),
        )
        .catch(() => {});
    }, 120);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q, open]);

  const commands = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (c: Command) => !needle || c.label.toLowerCase().includes(needle);
    const chart: Command[] = chartId
      ? CHART.filter((c) => clinical || c.slug === "").map((c) => ({
          id: `c:${c.slug}`,
          label: c.label,
          group: "This chart",
          href: `/patients/${chartId}${c.slug ? `/${c.slug}` : ""}`,
          hint: c.key ? `g ${c.key}` : undefined,
        }))
      : [];
    const orderQuery = needle.replace(/^order\s+/, "");
    const orders: Command[] =
      clinical && chartId && orderQuery.length >= 2
        ? searchOrderables(orderQuery, 5).map((o) => ({ id: `o:${o.code}`, label: `Order ${o.display}`, group: "Order", href: `/patients/${chartId}/orders?add=${encodeURIComponent(o.code)}` }))
        : [];
    const global = GLOBAL.filter((c) => clinical || (c.id !== "inbox" && c.id !== "phrases"));
    return [...chart.filter(match), ...patients, ...orders, ...global.filter(match)];
  }, [q, chartId, patients, clinical]);

  function go(c: Command | undefined) {
    if (!c) return;
    setOpen(false);
    router.push(c.href);
  }

  if (!open) return null;
  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-chrome/40 pt-[12vh] print:hidden" onMouseDown={() => setOpen(false)}>
      <div className="w-[560px] max-w-[92vw] overflow-hidden rounded-lg border border-line bg-panel text-[13px] text-ink shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            else if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, commands.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === "Enter") go(commands[active]);
          }}
          placeholder={chartId ? "Find a patient, open part of this chart, or type “order cbc”…" : "Find a patient by name, MRN or DOB…"}
          className="w-full border-b border-line px-4 py-3 text-[15px] outline-none"
          aria-label="Command"
        />
        <ul className="max-h-[50vh] overflow-y-auto py-1">
          {commands.length === 0 && <li className="px-4 py-3 text-ink-3">No matches.</li>}
          {commands.map((c, i) => {
            const header = c.group !== lastGroup ? c.group : null;
            lastGroup = c.group;
            return (
              <li key={c.id}>
                {header && <div className="px-4 pb-0.5 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-ink-3">{header}</div>}
                <button
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(c)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-1.5 text-left ${i === active ? "bg-accent-soft" : ""}`}
                >
                  <span className="truncate">{c.label}</span>
                  {c.hint && <span className="shrink-0 font-mono text-[11px] text-ink-3">{c.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="flex gap-4 border-t border-line bg-panel-muted px-4 py-1.5 text-[11px] text-ink-3">
          <span>↑↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
