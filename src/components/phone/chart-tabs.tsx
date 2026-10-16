"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// The chart's sections, as a row of tabs that scrolls sideways; the open one is kept in view.
export function PhoneChartTabs({ patientId, clinical }: { patientId: string; clinical: boolean }) {
  const pathname = usePathname();
  const row = useRef<HTMLElement>(null);
  const base = `/m/patients/${patientId}`;
  const tabs = [
    { href: base, label: "Summary" },
    ...(clinical
      ? [
          { href: `${base}/results`, label: "Results" },
          { href: `${base}/vitals`, label: "Vitals" },
          { href: `${base}/sugar`, label: "Sugar" },
          { href: `${base}/meds`, label: "Meds" },
          { href: `${base}/notes`, label: "Notes" },
          { href: `${base}/media`, label: "Media" },
        ]
      : []),
  ];
  const active = (href: string) => (href === base ? pathname === base || pathname === `${base}/import` : pathname.startsWith(href));

  useEffect(() => {
    const el = row.current?.querySelector<HTMLElement>("[aria-current=page]");
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [pathname]);

  return (
    <nav ref={row} className="no-scrollbar flex overflow-x-auto border-b border-line bg-panel" aria-label="Chart sections">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          aria-current={active(t.href) ? "page" : undefined}
          className={`flex-1 shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-center text-[14px] font-medium transition-colors ${active(t.href) ? "border-accent text-accent" : "border-transparent text-ink-2 active:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
