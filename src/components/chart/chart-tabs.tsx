"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { touchOpenPatient } from "@/lib/open-patients";

export const chartTabs = [
  { slug: "", label: "Summary" },
  { slug: "results", label: "Results" },
  { slug: "vitals", label: "Vitals" },
  { slug: "meds", label: "Medications" },
  { slug: "problems", label: "Problems" },
  { slug: "allergies", label: "Allergies" },
  { slug: "notes", label: "Notes" },
];

export function ChartTabs({ patientId, label, counts }: { patientId: string; label: string; counts: Record<string, number> }) {
  const pathname = usePathname();
  const base = `/patients/${patientId}`;

  // Register this chart as an open tab and remember which activity was last used.
  useEffect(() => {
    touchOpenPatient({ id: patientId, label, lastPath: pathname });
  }, [patientId, label, pathname]);

  return (
    <nav className="flex shrink-0 gap-0.5 border-b border-line bg-panel px-3">
      {chartTabs.map((t) => {
        const href = t.slug ? `${base}/${t.slug}` : base;
        const active = t.slug ? pathname.startsWith(href) : pathname === base;
        const count = counts[t.slug];
        return (
          <Link
            key={t.slug}
            href={href}
            className={`-mb-px border-b-2 px-3 py-2.5 text-[13px] ${
              active ? "border-accent font-semibold text-ink" : "border-transparent text-ink-2 hover:border-line hover:text-ink"
            }`}
          >
            {t.label}
            {count ? <span className="ml-1.5 rounded-full bg-high-soft px-1.5 text-[10.5px] font-semibold text-high">{count}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
