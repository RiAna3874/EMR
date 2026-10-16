import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePhonePermission } from "@/lib/phone-session";
import { conversationFor } from "@/lib/chat/server";
import { activeMembers, conversationName, isGroup, isUnread, readBy, statusLabel } from "@/lib/chat/chat";
import { age, fmtDate, fmtTime, fullName, sexShort } from "@/lib/format";
import { LiveRefresh } from "@/components/chat/live-refresh";
import { MarkRead } from "@/components/chat/mark-read";
import { PhoneHeader } from "@/components/phone/header";
import { PhoneComposer } from "@/components/phone/chat-forms";
import { ScrollToBottom } from "@/components/phone/scroll-to-bottom";

export const metadata = { title: "Chat" };

const GROUP_MS = 5 * 60_000;

// One conversation, like a phone messaging app: bubbles, read receipts, a reply box above the tabs.
// Adding people, renaming and leaving are on the full site.
export default async function PhoneConversation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePhonePermission("useChat");
  const conv = await conversationFor(id, user.id);
  if (!conv) notFound();
  const me = conv.members.find((m) => m.practitionerId === user.id)!;
  const others = activeMembers(conv.members).filter((m) => m.practitionerId !== user.id);
  const group = isGroup(conv.title, conv.members);
  const last = conv.messages.at(-1);
  const lastMine = [...conv.messages].reverse().find((m) => m.senderId === user.id && m.kind === "text");
  const unavailable = others.filter((m) => m.practitioner.chatStatus !== "available");
  const awayNote = unavailable.length
    ? unavailable.map((m) => `${m.practitioner.name} is ${statusLabel[m.practitioner.chatStatus].toLowerCase()}${m.practitioner.chatStatusNote ? ` (${m.practitioner.chatStatusNote})` : ""}`).join(". ") + "."
    : null;
  const p = conv.patient;

  return (
    <>
      <PhoneHeader title={conversationName(conv.title, conv.members, user.id)} sub={group ? `${others.length + 1} people` : undefined} back="/m/chat" />
      <LiveRefresh intervalMs={4000} />
      {p && (
        <div className="flex items-center gap-2 border-b border-low/20 bg-low-soft px-4 py-2 text-[13px]">
          <div className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{fullName(p)}</span>
            <span className="text-ink-2">
              {" "}
              {age(p.dob)} y {sexShort(p.sex)} · {p.mrn}
            </span>
          </div>
          <Link href={`/m/patients/${p.id}`} className="shrink-0 font-semibold text-low">
            Chart
          </Link>
        </div>
      )}
      <ol className="flex flex-col gap-0.5 px-3 pb-32 pt-2">
        {conv.messages.map((m, i) => {
          const prev = conv.messages[i - 1];
          const newDay = !prev || prev.createdAt.toDateString() !== m.createdAt.toDateString();
          const day = newDay && (
            <li key={`d-${m.id}`} className="my-3 text-center text-[12px] font-medium text-ink-3">
              {fmtDate(m.createdAt)}
            </li>
          );
          if (m.kind === "system") {
            return [
              day,
              <li key={m.id} className="my-1.5 text-center text-[12px] text-ink-3">
                {m.body} · {fmtTime(m.createdAt)}
              </li>,
            ];
          }
          const mine = m.senderId === user.id;
          const continued = !newDay && prev?.kind === "text" && prev.senderId === m.senderId && m.createdAt.getTime() - prev.createdAt.getTime() < GROUP_MS;
          const readers = mine ? readBy(m, conv.members) : [];
          return [
            day,
            <li key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"} ${continued ? "" : "mt-2.5"}`}>
              {!continued && (
                <span className="mb-0.5 px-1 text-[11.5px] text-ink-3">
                  {mine ? "You" : m.sender.name} · {fmtTime(m.createdAt)}
                </span>
              )}
              <div
                className={`max-w-[82%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                  m.urgent ? "border-2 border-crit bg-crit-soft" : mine ? "bg-accent text-white" : "border border-line bg-panel"
                }`}
              >
                {m.urgent && <span className="mb-0.5 block text-[10.5px] font-bold uppercase tracking-wide text-crit">Urgent</span>}
                {m.body}
              </div>
              {m.id === lastMine?.id && (
                <span className={`mt-0.5 px-1 text-[11.5px] ${readers.length ? "text-accent" : "text-ink-3"}`}>
                  {others.length === 0
                    ? "Sent"
                    : readers.length === 0
                      ? "Not read yet"
                      : !group
                        ? `Read ${fmtTime(readers[0].lastReadAt!)}`
                        : readers.length === others.length
                          ? "Read by everyone"
                          : `Read by ${readers.length} of ${others.length}`}
                </span>
              )}
            </li>,
          ];
        })}
      </ol>
      <ScrollToBottom lastId={last?.id ?? ""} />
      {last && <MarkRead conversationId={conv.id} upTo={last.createdAt.toISOString()} unread={conv.messages.some((m) => isUnread(m, me))} />}
      <PhoneComposer key={conv.id} conversationId={conv.id} awayNote={awayNote} />
    </>
  );
}
