"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The chart's sections, as a row of tabs that scrolls sideways.
export function PhoneChartTabs({ patientId, clinical }: { patientId: string; clinical: boolean }) {
  const pathname = usePathname();
  const base = `/m/patients/${patientId}`;
  const tabs = [
    { href: base, label: "Summary" },
    ...(clinical
      ? [
          { href: `${base}/results`, label: "Results" },
          { href: `${base}/vitals`, label: "Vitals" },
          { href: `${base}/meds`, label: "Meds" },
          { href: `${base}/notes`, label: "Notes" },
          { href: `${base}/media`, label: "Media" },
        ]
      : []),
  ];
  const active = (href: string) => (href === base ? pathname === base : pathname.startsWith(href));
  return (
    <nav className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line bg-panel px-2" aria-label="Chart sections">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`shrink-0 border-b-2 px-3 py-2.5 text-[14px] font-medium ${active(t.href) ? "border-accent text-accent" : "border-transparent text-ink-2"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
