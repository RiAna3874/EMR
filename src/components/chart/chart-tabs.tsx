"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { touchOpenPatient } from "@/lib/open-patients";

import type { Permission } from "@/lib/roles";

// `needs` is the permission a tab's page checks; tabs the user lacks it for are hidden.
export const chartTabs: { slug: string; label: string; needs?: Permission }[] = [
  { slug: "", label: "Summary" },
  { slug: "results", label: "Results", needs: "viewClinical" },
  { slug: "vitals", label: "Vitals", needs: "viewClinical" },
  { slug: "meds", label: "Medications", needs: "viewClinical" },
  { slug: "problems", label: "Problems", needs: "viewClinical" },
  { slug: "allergies", label: "Allergies", needs: "viewClinical" },
  { slug: "notes", label: "Notes", needs: "viewClinical" },
  { slug: "orders", label: "Orders", needs: "viewClinical" },
  { slug: "import", label: "Import Report", needs: "importReports" },
  { slug: "appointments", label: "Appointments" },
];

export function ChartTabs({ patientId, label, counts, allowed }: { patientId: string; label: string; counts: Record<string, number>; allowed: Permission[] }) {
  const pathname = usePathname();
  const base = `/patients/${patientId}`;

  // Register this chart as an open tab and remember which activity was last used.
  useEffect(() => {
    touchOpenPatient({ id: patientId, label, lastPath: pathname });
  }, [patientId, label, pathname]);

  return (
    <nav className="flex shrink-0 gap-0.5 border-b border-line bg-panel px-3">
      {chartTabs.filter((t) => !t.needs || allowed.includes(t.needs)).map((t) => {
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
