"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

type Tab = { href: string; label: string; icon: React.ReactNode; badge?: number; urgent?: boolean };

// The phone view's bottom tabs. The current tab is the one whose path the screen is under.
export function TabBar({ chatUnread, chatUrgent, showChat }: { chatUnread: number; chatUrgent: number; showChat: boolean }) {
  const pathname = usePathname();
  const chat = useChatCount(showChat, { total: chatUnread, urgent: chatUrgent });
  const tabs: Tab[] = [
    { href: "/m", label: "Today", icon: <CalendarIcon /> },
    { href: "/m/patients", label: "Patients", icon: <PeopleIcon /> },
    ...(showChat ? [{ href: "/m/chat", label: "Chat", icon: <ChatIcon />, badge: chat.total, urgent: chat.urgent > 0 }] : []),
    { href: "/m/more", label: "More", icon: <MoreIcon /> },
  ];
  const active = (href: string) => (href === "/m" ? pathname === "/m" : pathname.startsWith(href));
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-panel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur" aria-label="Phone view">
      <ul className="flex">
        {tabs.map((t) => (
          <li key={t.href} className="flex-1">
            <Link href={t.href} className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${active(t.href) ? "text-accent" : "text-ink-3"}`}>
              {t.icon}
              {t.label}
              {!!t.badge && (
                <span className={`tabular absolute left-1/2 top-1.5 ml-2 min-w-[18px] rounded-full px-1 text-center text-[10.5px] font-semibold leading-[18px] text-white ${t.urgent ? "bg-crit" : "bg-accent"}`}>
                  {t.badge > 99 ? "99+" : t.badge}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

type Count = { total: number; urgent: number };
const POLL_MS = 15_000;

// The server's count on each render, then polled (as the full site's top bar does) so the Chat badge stays live.
function useChatCount(enabled: boolean, initial: Count) {
  const [polled, setPolled] = useState<{ base: Count; value: Count } | null>(null);
  const { total, urgent } = initial;
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const base = { total, urgent };
    const t = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/api/messages/unread", { cache: "no-store" });
        if (res.ok && !stop) {
          const v = (await res.json()) as Count;
          setPolled({ base, value: { total: v.total, urgent: v.urgent } });
        }
      } catch {
        // Offline for a moment; the next tick tries again.
      }
    }, POLL_MS);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [enabled, total, urgent]);
  return polled && polled.base.total === total && polled.base.urgent === urgent ? polled.value : initial;
}

const icon = (d: React.ReactNode) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const CalendarIcon = () =>
  icon(
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </>,
  );
const PeopleIcon = () =>
  icon(
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.5 3.3-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.8c1.8.8 3 2.6 3.5 5.2" />
    </>,
  );
const ChatIcon = () => icon(<path d="M4 5.5h16v11H9l-5 4v-15Z" />);
const MoreIcon = () =>
  icon(
    <>
      <circle cx="5.5" cy="12" r="1.2" />
      <circle cx="12" cy="12" r="1.2" />
      <circle cx="18.5" cy="12" r="1.2" />
    </>,
  );
