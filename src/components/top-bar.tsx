"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { closeOpenPatient, readOpenPatients, subscribeOpenPatients, type OpenPatient } from "@/lib/open-patients";
import { can, displayName, roleLabel, type SessionUser } from "@/lib/roles";
import { signOut } from "@/app/login/actions";
import { CommandPalette } from "@/components/command-palette";
import { BrandMark } from "@/components/brand-mark";
import { PatientHover } from "@/components/hover/patient-hover";
import { Arrange, Sortable } from "@/components/arrange";

const EMPTY: OpenPatient[] = [];

// `key` matches the "nav" area in src/lib/view-prefs.ts, where each person's order is kept.
const nav = [
  { key: "nav:home", href: "/", label: "My Day" },
  { key: "nav:schedule", href: "/schedule", label: "Schedule" },
  { key: "nav:inbox", href: "/inbox", label: "Inbox" },
  { key: "nav:messages", href: "/messages", label: "Messages" },
  { key: "nav:patients", href: "/patients", label: "Patient Lists" },
];

export type ChatBadge = { total: number; urgent: number; latestUrgent: { id: string; conversationId: string; from: string; preview: string } | null };

// How often every screen checks for new secure chat messages.
const CHAT_POLL_MS = 15_000;

// inboxCount is null for roles without an Inbox (front desk). dataLabel warns what data this
// system may hold ("Synthetic data", "Not for real patients"); null once cleared for real patients.
// `navOrder` is this person's order for the links (dragged into place unless `drag` is off).
export function TopBar({
  user,
  brand,
  inboxCount,
  chat: initialChat,
  dataLabel,
  navOrder,
  drag,
}: {
  user: SessionUser;
  brand: { name: string; logoUrl: string | null };
  inboxCount: number | null; chat: ChatBadge; dataLabel: string | null; navOrder: string[]; drag: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const open = useSyncExternalStore(subscribeOpenPatients, readOpenPatients, () => EMPTY);
  const chat = useChatBadge(initialChat);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const alert = chat.latestUrgent && chat.latestUrgent.id !== dismissed && pathname !== `/messages/${chat.latestUrgent.conversationId}` ? chat.latestUrgent : null;

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
      <CommandPalette clinical={can(user.role, "viewClinical")} canRegister={can(user.role, "registerPatients")} />
      <Link href="/" className="flex items-center gap-2 px-4 font-semibold tracking-wide">
        <BrandMark name={brand.name} logoUrl={brand.logoUrl} />
      </Link>
      <Arrange area="nav" order={navOrder} drag={drag}>
      <nav>
        <Sortable area="nav" label="Top bar" className="flex h-full items-stretch" items={nav.filter((n) => n.href !== "/inbox" || inboxCount !== null).map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname === n.href || pathname.startsWith(`${n.href}/`);
          const count = n.href === "/inbox" ? (inboxCount ?? 0) : n.href === "/messages" ? chat.total : 0;
          const urgent = n.href === "/messages" && chat.urgent > 0;
          return { key: n.key, className: "flex", node: (
            <Link
              href={n.href}
              draggable={false}
              className={`flex items-center px-3 text-[13px] ${active ? "bg-chrome-2 text-white" : "text-white/75 hover:bg-chrome-2/60 hover:text-white"}`}
            >
              {n.label}
              {count > 0 && (
                <span
                  className={`tabular ml-1.5 rounded-full px-1.5 text-[10.5px] font-semibold leading-4 text-white ${urgent ? "bg-crit ring-2 ring-white/70" : "bg-high"}`}
                  title={urgent ? `${chat.urgent} urgent` : undefined}
                >
                  {urgent && "! "}
                  {count}
                </span>
              )}
            </Link>
          ) };
        })} />
      </nav>
      </Arrange>
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
              <PatientHover id={p.id} className="truncate">
                {p.label}
              </PatientHover>
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
        {dataLabel && (
          <span className="rounded bg-warn px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-white">{dataLabel}</span>
        )}
        {/* Only on a narrow screen; the desktop top bar is unchanged. */}
        <a href="/view/phone" className="rounded px-1.5 py-0.5 text-[12px] hover:bg-white/10 hover:text-white md:hidden">
          Phone view
        </a>
        <Link
          href="/account/view"
          title="View options: hover cards, and what to show or hide"
          aria-label="View options"
          className={`rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-white ${pathname === "/account/view" ? "bg-white/10 text-white" : ""}`}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden className="inline-block align-[-2px]">
            <path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z" />
            <circle cx="8" cy="8" r="2" />
          </svg>
        </Link>
        {user.isAdmin && (
          <Link href="/admin/users" className={`rounded px-1.5 py-0.5 text-[12px] hover:bg-white/10 hover:text-white ${pathname.startsWith("/admin") ? "bg-white/10 text-white" : ""}`}>
            Admin
          </Link>
        )}
        <span className="leading-tight">
          <Link href="/account/password" className="block hover:underline" title="Change password">
            {displayName(user)}
          </Link>
          <span className="block text-[10.5px] text-white/55">{roleLabel[user.role]}</span>
        </span>
        <form action={signOut}>
          <button type="submit" className="rounded border border-white/15 px-2 py-0.5 text-[12px] text-white/75 hover:bg-white/10 hover:text-white">
            Sign out
          </button>
        </form>
      </div>
      {alert && (
        <div role="alert" className="fixed right-4 top-13 z-40 flex w-80 items-start gap-2 rounded-md border border-crit/40 bg-panel p-3 text-ink shadow-lg">
          <span className="mt-0.5 rounded bg-crit px-1 text-[10px] font-bold uppercase tracking-wide text-white">Urgent</span>
          <Link href={`/messages/${alert.conversationId}`} onClick={() => setDismissed(alert.id)} className="min-w-0 flex-1 hover:text-accent">
            <span className="block text-[12.5px] font-semibold">{alert.from}</span>
            <span className="line-clamp-2 block text-[12px] text-ink-2">{alert.preview}</span>
          </Link>
          <button aria-label="Dismiss" onClick={() => setDismissed(alert.id)} className="rounded px-1 leading-none text-ink-3 hover:bg-panel-muted">
            ×
          </button>
        </div>
      )}
    </header>
  );
}

// The server's count on each render, then polled so it stays live between navigations.
function useChatBadge(initial: ChatBadge) {
  const [polled, setPolled] = useState<{ base: ChatBadge; value: ChatBadge } | null>(null);
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/messages/unread", { cache: "no-store" });
        if (res.ok && !stop) {
          const value = (await res.json()) as ChatBadge;
          setPolled({ base: initial, value });
        }
      } catch {
        // Offline for a moment; the next tick tries again.
      }
    };
    const t = setInterval(tick, CHAT_POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [initial]);
  // A fresh server render wins over an older poll.
  return polled && polled.base === initial ? polled.value : initial;
}

