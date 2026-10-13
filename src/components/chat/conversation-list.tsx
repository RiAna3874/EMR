"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { inputCls } from "@/components/form";

export type ListItem = {
  id: string;
  name: string;
  group: boolean;
  initials: string;
  patient: { name: string; mrn: string } | null;
  preview: string;
  previewFrom: string | null;
  at: string;
  time: string;
  unread: number;
  unreadUrgent: number;
  muted: boolean;
};

export function ConversationList({ items }: { items: ListItem[] }) {
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? items.filter((c) => [c.name, c.preview, c.patient?.name ?? "", c.patient?.mrn ?? ""].some((s) => s.toLowerCase().includes(needle)))
    : items;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-line px-3 py-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, patients, messages" aria-label="Search conversations" className={`${inputCls} w-full`} />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && <li className="px-3 py-4 text-ink-3">{items.length ? "No conversations match." : "No conversations yet."}</li>}
        {shown.map((c) => {
          const active = pathname === `/messages/${c.id}`;
          // The open conversation is being read right now.
          const unread = active ? 0 : c.unread;
          return (
            <li key={c.id} className="border-b border-line">
              <Link
                href={`/messages/${c.id}`}
                className={`flex gap-2.5 px-3 py-2.5 ${active ? "bg-accent-soft" : "hover:bg-panel-muted"} ${unread && c.unreadUrgent ? "border-l-4 border-crit pl-2" : ""}`}
              >
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${c.group ? "bg-accent" : "bg-chrome-2"}`} aria-hidden>
                  {c.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`truncate ${unread ? "font-semibold" : "font-medium"}`}>{c.name}</span>
                    {c.muted && <span className="text-[10.5px] text-ink-3" title="Muted">muted</span>}
                    <time className="ml-auto shrink-0 text-[11px] text-ink-3" dateTime={c.at}>
                      {c.time}
                    </time>
                  </span>
                  {c.patient && (
                    <span className="mt-0.5 inline-block max-w-full truncate rounded bg-low-soft px-1.5 text-[10.5px] font-medium text-low">
                      {c.patient.name} · {c.patient.mrn}
                    </span>
                  )}
                  <span className="flex items-center gap-2">
                    <span className={`line-clamp-1 flex-1 text-[12px] ${unread ? "text-ink" : "text-ink-3"}`}>
                      {c.previewFrom && <span className="font-medium">{c.previewFrom}: </span>}
                      {c.preview}
                    </span>
                    {unread > 0 && (
                      <span className={`tabular shrink-0 rounded-full px-1.5 text-[10.5px] font-semibold leading-4 text-white ${c.unreadUrgent ? "bg-crit" : "bg-accent"}`}>
                        {c.unreadUrgent ? "! " : ""}
                        {unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
