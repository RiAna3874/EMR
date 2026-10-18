"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { touchOpenPatient } from "@/lib/open-patients";

import type { Permission } from "@/lib/roles";
import { chartTabs, tabCountMeaning } from "@/lib/chart-tabs";
import { viewArea } from "@/lib/view-prefs";
import { Arrange, Sortable } from "@/components/arrange";
import { Hover } from "@/components/hover/hover-card";
import { HoverHint } from "@/components/hover/card-parts";
import { ViewMenu } from "@/components/view-menu";

// `hidden` holds the tabs this person chose to hide (View menu); the tab they're on always shows.
// `order` is their tab order (every tab key); tabs are dragged into place unless `drag` is off.
export function ChartTabs({
  patientId,
  label,
  counts,
  allowed,
  hidden,
  order,
  drag,
}: {
  patientId: string;
  label: string;
  counts: Record<string, number>;
  allowed: Permission[];
  hidden: string[];
  order: string[];
  drag: boolean;
}) {
  const pathname = usePathname();
  const base = `/patients/${patientId}`;
  const mine = chartTabs.filter((t) => !t.needs || allowed.includes(t.needs));
  const tabItems = viewArea("tab").items.filter((i) => i.key === "tab:summary" || mine.some((t) => `tab:${t.slug}` === i.key));

  // Register this chart as an open tab and remember which activity was last used.
  useEffect(() => {
    // Summary is reopened as Summary, even when this person's charts open on another tab.
    touchOpenPatient({ id: patientId, label, lastPath: pathname === base ? `${base}?tab=summary` : pathname });
  }, [patientId, label, pathname, base]);

  const tabs = mine.flatMap((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        const active = t.slug ? pathname.startsWith(href) : pathname === base;
        if (!active && t.slug && hidden.includes(`tab:${t.slug}`)) return [];
        const count = counts[t.slug];
        return [{ key: `tab:${t.slug || "summary"}`, node: (
          <Hover
            as="span"
            className="flex"
            card={
              <HoverHint title={t.label}>
                {t.about}
                {count ? (
                  <span className="mt-1 block font-medium text-high">
                    {count} {tabCountMeaning[t.slug]}
                  </span>
                ) : null}
              </HoverHint>
            }
          >
            <Link
              // The Summary tab always opens Summary, even when charts open on another tab.
              href={t.slug ? href : `${base}?tab=summary`}
              draggable={false}
              className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] ${
                active ? "border-accent font-semibold text-ink" : "border-transparent text-ink-2 hover:border-line hover:text-ink"
              }`}
            >
              {t.label}
              {count ? <span className="ml-1.5 rounded-full bg-high-soft px-1.5 text-[10.5px] font-semibold text-high">{count}</span> : null}
            </Link>
          </Hover>
        ) }];
      });

  return (
    <Arrange area="tab" order={order} drag={drag}>
    <nav className="flex shrink-0 border-b border-line bg-panel px-3">
      {/* Tabs scroll sideways on a narrow screen; the View menu and search stay put. */}
      <Sortable area="tab" label="Chart tabs" items={tabs} className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto [scrollbar-width:none]" />
      <div className="flex shrink-0 items-center pl-2">
        <ViewMenu label="Chart tabs" area="tab" items={tabItems} hidden={hidden} tone="subtle" />
      </div>
      {!pathname.startsWith(`${base}/search`) && <ChartSearchBox base={base} />}
    </nav>
    </Arrange>
  );
}

// Opens chart search (/patients/[id]/search). "/" jumps here from anywhere in the chart.
function ChartSearchBox({ base }: { base: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        input.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <form
      className="flex shrink-0 items-center py-1.5 pl-3"
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`${base}/search${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      }}
    >
      <input
        ref={input}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search chart  /"
        aria-label="Search this chart"
        className="w-44 rounded border border-line bg-panel-muted px-2.5 py-1 text-[12.5px] outline-none transition-[width] focus:w-64 focus:border-accent focus:bg-panel"
      />
    </form>
  );
}
