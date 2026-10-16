import Link from "next/link";
import { requirePhonePermission } from "@/lib/phone-session";
import { myConversations } from "@/lib/chat/server";
import { conversationName, initials, isGroup } from "@/lib/chat/chat";
import { fmtShortDate, fmtTime, fullName } from "@/lib/format";
import { LiveRefresh } from "@/components/chat/live-refresh";
import { PhoneEmpty, PhoneHeader } from "@/components/phone/header";

export const metadata = { title: "Chat" };

// Secure chat conversations, newest first, unread in bold and urgent in red.
export default async function PhoneChat() {
  const user = await requirePhonePermission("useChat");
  const conversations = await myConversations(user.id);
  const today = new Date().toDateString();
  return (
    <>
      <PhoneHeader
        title="Secure chat"
        action={
          <Link href="/m/chat/new" className="rounded-full bg-white/15 px-3 py-1.5 text-[14px] font-semibold active:bg-white/25">
            New
          </Link>
        }
      />
      <LiveRefresh intervalMs={6000} />
      <ul className="border-b border-line bg-panel">
        {conversations.length === 0 && <PhoneEmpty>No conversations yet.</PhoneEmpty>}
        {conversations.map((c) => {
          const name = conversationName(c.title, c.members, user.id);
          const group = isGroup(c.title, c.members);
          const last = c.messages[0];
          const from = last && last.kind === "text" ? (last.senderId === user.id ? "You" : group ? last.sender.name.split(" ")[0] : null) : null;
          return (
            <li key={c.id} className="border-b border-line last:border-b-0">
              <Link href={`/m/chat/${c.id}`} className={`flex gap-3 px-4 py-3 active:bg-accent-soft/60 ${c.unread && c.unreadUrgent ? "border-l-4 border-crit pl-3" : ""}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white ${group ? "bg-accent" : "bg-chrome-2"}`} aria-hidden>
                  {initials(name.replace(/\+\d+$/, ""))}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`truncate ${c.unread ? "font-bold" : "font-medium"}`}>{name}</span>
                    <time className="ml-auto shrink-0 text-[12px] text-ink-3">{c.lastMessageAt.toDateString() === today ? fmtTime(c.lastMessageAt) : fmtShortDate(c.lastMessageAt)}</time>
                  </span>
                  {c.patient && (
                    <span className="mt-0.5 inline-block max-w-full truncate rounded bg-low-soft px-1.5 text-[11.5px] font-medium text-low">
                      {fullName(c.patient)} · {c.patient.mrn}
                    </span>
                  )}
                  <span className="flex items-center gap-2">
                    <span className={`line-clamp-1 flex-1 text-[13.5px] ${c.unread ? "text-ink" : "text-ink-3"}`}>
                      {from && <span className="font-medium">{from}: </span>}
                      {last?.body.replace(/\s+/g, " ")}
                    </span>
                    {c.unread > 0 && (
                      <span className={`tabular shrink-0 rounded-full px-1.5 text-[11px] font-semibold leading-5 text-white ${c.unreadUrgent ? "bg-crit" : "bg-accent"}`}>
                        {c.unreadUrgent ? "! " : ""}
                        {c.unread}
                      </span>
                    )}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
