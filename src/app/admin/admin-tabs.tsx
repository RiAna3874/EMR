"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/admin/users", label: "Staff accounts" },
  { href: "/admin/access-log", label: "Access log" },
  { href: "/admin/texts", label: "Text messages" },
];

export function AdminTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-line bg-panel px-6 text-[12.5px]">
      {tabs.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`-mb-px border-b-2 px-3 py-2 ${pathname.startsWith(t.href) ? "border-accent font-medium text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
