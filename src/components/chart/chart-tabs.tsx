"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { touchOpenPatient } from "@/lib/open-patients";

import type { Permission } from "@/lib/roles";

// `needs` is the permission a tab's page checks; tabs the user lacks it for are hidden.
export const chartTabs: { slug: string; label: string; needs?: Permission }[] = [
  { slug: "", label: "Summary" },
  { slug: "visit", label: "Visit", needs: "viewClinical" },
  { slug: "results", label: "Results", needs: "viewClinical" },
  { slug: "vitals", label: "Vitals", needs: "viewClinical" },
  { slug: "sugar", label: "Blood sugar", needs: "viewClinical" },
  { slug: "meds", label: "Medications", needs: "viewClinical" },
  { slug: "problems", label: "Problems", needs: "viewClinical" },
  { slug: "allergies", label: "Allergies", needs: "viewClinical" },
  { slug: "notes", label: "Notes", needs: "viewClinical" },
  { slug: "orders", label: "Orders", needs: "viewClinical" },
  { slug: "documents", label: "Documents", needs: "viewClinical" },
  { slug: "media", label: "Media", needs: "viewClinical" },
  { slug: "import", label: "Import", needs: "importReports" },
  { slug: "appointments", label: "Appointments" },
  { slug: "texts", label: "Texts", needs: "textPatients" },
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
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] ${
              active ? "border-accent font-semibold text-ink" : "border-transparent text-ink-2 hover:border-line hover:text-ink"
            }`}
          >
            {t.label}
            {count ? <span className="ml-1.5 rounded-full bg-high-soft px-1.5 text-[10.5px] font-semibold text-high">{count}</span> : null}
          </Link>
        );
      })}
      {!pathname.startsWith(`${base}/search`) && <ChartSearchBox base={base} />}
    </nav>
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
      className="ml-auto flex items-center py-1.5 pl-3"
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
