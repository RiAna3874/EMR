"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { closeOpenPatient, readOpenPatients, subscribeOpenPatients, type OpenPatient } from "@/lib/open-patients";
import { can, displayName, roleLabel, type SessionUser } from "@/lib/roles";
import { signOut } from "@/app/login/actions";
import { CommandPalette } from "@/components/command-palette";

const EMPTY: OpenPatient[] = [];

const nav = [
  { href: "/", label: "My Day" },
  { href: "/inbox", label: "Inbox" },
  { href: "/patients", label: "Patient Lists" },
];

// inboxCount is null for roles without an Inbox (front desk).
export function TopBar({ user, inboxCount }: { user: SessionUser; inboxCount: number | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const open = useSyncExternalStore(subscribeOpenPatients, readOpenPatients, () => EMPTY);

  function close(e: React.MouseEvent, p: OpenPatient) {
    e.preventDefault();
    e.stopPropagation();
    closeOpenPatient(p.id);
    if (pathname.startsWith(`/patients/${p.id}`)) {
      const rest = open.filter((x) => x.id !== p.id);
      router.push(rest.length ? rest[rest.length - 1].lastPath : "/patients");
    }
  }

  return (
    <header className="flex h-11 shrink-0 items-stretch bg-chrome text-white print:hidden">
      <CommandPalette clinical={can(user.role, "viewClinical")} />
      <Link href="/" className="flex items-center gap-2 px-4 font-semibold tracking-wide">
        <Logo />
        <span>Meridian</span>
      </Link>
      <nav className="flex items-stretch">
        {nav.filter((n) => n.href !== "/inbox" || inboxCount !== null).map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname === n.href;
          const count = n.href === "/inbox" ? (inboxCount ?? 0) : 0;
          return (
            <Link
              key={n.href}
              href={n.href}
              className={`flex items-center px-3 text-[13px] ${active ? "bg-chrome-2 text-white" : "text-white/75 hover:bg-chrome-2/60 hover:text-white"}`}
            >
              {n.label}
              {count > 0 && <span className="tabular ml-1.5 rounded-full bg-high px-1.5 text-[10.5px] font-semibold leading-4 text-white">{count}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mx-2 my-2 w-px bg-white/15" />
      <div className="flex min-w-0 flex-1 items-end gap-1 overflow-x-auto pt-1.5">
        {open.map((p) => {
          const active = pathname.startsWith(`/patients/${p.id}`);
          return (
            <Link
              key={p.id}
              href={p.lastPath}
              className={`group flex h-full max-w-56 shrink-0 items-center gap-2 rounded-t-md px-3 text-[12.5px] ${
                active ? "bg-bg text-ink" : "bg-chrome-2 text-white/85 hover:bg-chrome-2/80"
              }`}
            >
              <span className="truncate">{p.label}</span>
              <button
                aria-label={`Close ${p.label}`}
                onClick={(e) => close(e, p)}
                className={`rounded px-1 leading-none ${active ? "text-ink-3 hover:bg-line" : "text-white/60 hover:bg-white/15"}`}
              >
                ×
              </button>
            </Link>
          );
        })}
      </div>
      <button
        onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
        className="my-2 flex items-center gap-2 rounded border border-white/15 bg-chrome-2/60 px-2.5 text-[12px] text-white/70 hover:text-white"
        title="Search patients and commands"
      >
        Search
        <kbd className="rounded bg-white/10 px-1 font-sans text-[10.5px]">⌘/Ctrl K</kbd>
      </button>
      <div className="flex items-center gap-3 px-4 text-[12.5px] text-white/80">
        <span className="rounded bg-warn px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-white">
          Synthetic data
        </span>
        <span className="leading-tight">
          <span className="block">{displayName(user)}</span>
          <span className="block text-[10.5px] text-white/55">{roleLabel[user.role]}</span>
        </span>
        <form action={signOut}>
          <button type="submit" className="rounded border border-white/15 px-2 py-0.5 text-[12px] text-white/75 hover:bg-white/10 hover:text-white">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden>
      <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
      <path d="M10 1.5v17" stroke="#5eead4" strokeWidth="2" />
      <path d="M4 10h3l1.5-3 2.5 6 1.5-3H16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
