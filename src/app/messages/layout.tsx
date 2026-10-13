import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { myConversations } from "@/lib/chat/server";
import { conversationName, initials, isGroup } from "@/lib/chat/chat";
import { fmtShortDate, fmtTime, fullName } from "@/lib/format";
import { ConversationList, type ListItem } from "@/components/chat/conversation-list";
import { LiveRefresh } from "@/components/chat/live-refresh";
import { StatusPicker } from "@/components/chat/status-picker";

export const dynamic = "force-dynamic";

// How often an open Messages screen picks up new messages and read receipts.
const REFRESH_MS = 4000;

export default async function MessagesLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePermission("useChat");
  const [conversations, me] = await Promise.all([
    myConversations(user.id),
    db.practitioner.findUniqueOrThrow({ where: { id: user.id }, select: { chatStatus: true, chatStatusNote: true } }),
  ]);
  const today = new Date().toDateString();

  const items: ListItem[] = conversations.map((c) => {
    const name = conversationName(c.title, c.members, user.id);
    const last = c.messages[0];
    const group = isGroup(c.title, c.members);
    return {
      id: c.id,
      name,
      group,
      initials: initials(name.replace(/\+\d+$/, "")),
      patient: c.patient && { name: fullName(c.patient), mrn: c.patient.mrn },
      preview: last ? last.body.replace(/\s+/g, " ") : "",
      previewFrom: last && last.kind === "text" ? (last.senderId === user.id ? "You" : group ? last.sender.name.split(" ")[0] : null) : null,
      at: c.lastMessageAt.toISOString(),
      time: c.lastMessageAt.toDateString() === today ? fmtTime(c.lastMessageAt) : fmtShortDate(c.lastMessageAt),
      unread: c.unread,
      unreadUrgent: c.unreadUrgent,
      muted: c.members.find((m) => m.practitionerId === user.id)?.muted ?? false,
    };
  });

  return (
    <div className="flex h-full">
      <LiveRefresh intervalMs={REFRESH_MS} />
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2.5">
          <h1 className="text-[15px] font-semibold">Secure chat</h1>
          <Link href="/messages/new" className="ml-auto rounded border border-accent bg-accent px-2.5 py-1 text-[12.5px] font-medium text-white hover:bg-accent/90">
            New message
          </Link>
        </div>
        <div className="border-b border-line px-3 py-2">
          <StatusPicker key={`${me.chatStatus}:${me.chatStatusNote ?? ""}`} status={me.chatStatus} note={me.chatStatusNote} />
        </div>
        <ConversationList items={items} />
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">{children}</section>
    </div>
  );
}
