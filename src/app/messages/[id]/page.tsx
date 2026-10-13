import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/session";
import { roleLabel } from "@/lib/roles";
import { conversationFor, staffDirectory } from "@/lib/chat/server";
import { activeMembers, conversationName, DISCLAIMER, isGroup, isUnread, MAX_TITLE, readBy, statusDot, statusLabel } from "@/lib/chat/chat";
import { age, fmtDate, fmtDob, fmtTime, fullName, sexShort } from "@/lib/format";
import { ActionButton } from "@/components/action-button";
import { Button, inputCls } from "@/components/form";
import { Composer } from "@/components/chat/composer";
import { MarkRead } from "@/components/chat/mark-read";
import { ScrollToEnd } from "@/components/chat/scroll-to-end";
import { addMembers, leaveConversation, renameConversation, toggleMute } from "../actions";

export const dynamic = "force-dynamic";

// Messages from one sender this close together read as one block.
const GROUP_MS = 5 * 60_000;

export default async function Conversation({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  const user = await requirePermission("useChat");
  // Not a member (or never existed): the same 404 either way.
  const conv = await conversationFor(id, user.id);
  if (!conv) notFound();

  const me = conv.members.find((m) => m.practitionerId === user.id)!;
  const active = activeMembers(conv.members);
  const others = active.filter((m) => m.practitionerId !== user.id);
  const group = isGroup(conv.title, conv.members);
  const name = conversationName(conv.title, conv.members, user.id);
  const staff = (await staffDirectory()).filter((s) => !active.some((m) => m.practitionerId === s.id));
  const last = conv.messages.at(-1);
  const hasUnread = conv.messages.some((m) => isUnread(m, me));
  const lastMine = [...conv.messages].reverse().find((m) => m.senderId === user.id && m.kind === "text");
  const unavailable = others.filter((m) => m.practitioner.chatStatus !== "available");
  const awayNote = unavailable.length
    ? unavailable.map((m) => `${m.practitioner.name} is ${statusLabel[m.practitioner.chatStatus].toLowerCase()}${m.practitioner.chatStatusNote ? ` (${m.practitioner.chatStatusNote})` : ""}`).join(". ") + "."
    : null;
  const p = conv.patient;

  return (
    <>
      <header className="border-b border-line bg-panel px-4 py-2.5">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold">{name}</h2>
            <ul className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-2">
              {active.map((m) => (
                <li key={m.practitionerId} className="flex items-center gap-1" title={`${statusLabel[m.practitioner.chatStatus]}${m.practitioner.chatStatusNote ? `: ${m.practitioner.chatStatusNote}` : ""}`}>
                  <span className={`h-2 w-2 rounded-full ${statusDot[m.practitioner.chatStatus]}`} aria-hidden />
                  {m.practitionerId === user.id ? "You" : m.practitioner.name}
                  <span className="text-ink-3">· {roleLabel[m.practitioner.role]}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Popover label="Add people">
              {staff.length === 0 ? (
                <p className="text-ink-3">Everyone is already here.</p>
              ) : (
                <form action={addMembers.bind(null, conv.id)} className="flex flex-col gap-1">
                  {!group && <p className="mb-1 text-[11.5px] text-ink-3">This starts a new group. They won&apos;t see this one-to-one conversation.</p>}
                  <div className="max-h-60 overflow-y-auto">
                    {staff.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-panel-muted">
                        <input type="checkbox" name="add" value={s.id} />
                        {s.name}
                        <span className="text-[11px] text-ink-3">{roleLabel[s.role]}</span>
                      </label>
                    ))}
                  </div>
                  <Button type="submit" className="mt-1 self-start">
                    Add
                  </Button>
                </form>
              )}
            </Popover>
            {group && (
              <Popover label="Rename">
                <form action={renameConversation.bind(null, conv.id)} className="flex gap-1.5">
                  <input name="title" defaultValue={conv.title ?? ""} maxLength={MAX_TITLE} placeholder="Group name" aria-label="Group name" className={inputCls} />
                  <Button type="submit">Save</Button>
                </form>
              </Popover>
            )}
            <ActionButton action={toggleMute.bind(null, conv.id)} variant="secondary">
              {me.muted ? "Unmute" : "Mute"}
            </ActionButton>
            <ActionButton action={leaveConversation.bind(null, conv.id)} variant="danger" confirm="Leave this conversation? It will disappear from your list until someone adds you back.">
              Leave
            </ActionButton>
          </div>
        </div>
        {error === "members" && <p className="mt-1 text-[12px] text-crit">A conversation can have up to 20 people.</p>}
      </header>

      {p && (
        <div className="flex items-center gap-3 border-b border-low/20 bg-low-soft px-4 py-1.5 text-[12.5px]">
          <span className="text-[10.5px] font-semibold uppercase tracking-wide text-low">Patient</span>
          <span className="font-semibold">{fullName(p)}</span>
          <span className="text-ink-2">
            {age(p.dob)} y {sexShort(p.sex)} · DOB {fmtDob(p.dob)} · MRN <span className="font-mono">{p.mrn}</span>
          </span>
          <Link href={`/patients/${p.id}`} className="ml-auto font-medium text-low hover:underline">
            Open chart
          </Link>
        </div>
      )}

      <ScrollToEnd lastId={last?.id ?? ""}>
        <ol className="mx-auto flex max-w-3xl flex-col gap-0.5">
          {conv.messages.map((m, i) => {
            const prev = conv.messages[i - 1];
            const newDay = !prev || prev.createdAt.toDateString() !== m.createdAt.toDateString();
            const day = newDay && (
              <li key={`d-${m.id}`} className="my-3 flex items-center gap-3 text-[11px] font-medium text-ink-3">
                <span className="h-px flex-1 bg-line" />
                {fmtDate(m.createdAt)}
                <span className="h-px flex-1 bg-line" />
              </li>
            );
            if (m.kind === "system") {
              return [
                day,
                <li key={m.id} className="my-1.5 text-center text-[11.5px] text-ink-3">
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
                  <span className="mb-0.5 px-1 text-[11px] text-ink-3">
                    {mine ? "You" : `${m.sender.name}${m.sender.credentials ? `, ${m.sender.credentials}` : ""}`} · {fmtTime(m.createdAt)}
                  </span>
                )}
                <div
                  className={`max-w-[75%] whitespace-pre-wrap break-words rounded-lg px-3 py-1.5 text-[13px] leading-snug ${
                    m.urgent ? "border-2 border-crit bg-crit-soft" : mine ? "bg-accent-soft" : "border border-line bg-panel"
                  }`}
                  title={mine ? (readers.length ? `Read by ${readers.map((r) => r.practitioner.name).join(", ")}` : "Not read yet") : fmtTime(m.createdAt)}
                >
                  {m.urgent && <span className="mb-0.5 block text-[10px] font-bold uppercase tracking-wide text-crit">Urgent</span>}
                  {m.body}
                </div>
                {m.id === lastMine?.id && <Receipt readers={readers.map((r) => ({ name: r.practitioner.name, at: r.lastReadAt! }))} total={others.length} group={group} />}
              </li>,
            ];
          })}
        </ol>
      </ScrollToEnd>

      {last && <MarkRead conversationId={conv.id} upTo={last.createdAt.toISOString()} unread={hasUnread} />}
      <Composer key={conv.id} conversationId={conv.id} awayNote={awayNote} />
      <p className="bg-panel px-4 pb-2 text-[11px] text-ink-3">{DISCLAIMER}</p>
    </>
  );
}

// Under the user's latest message: who has seen it.
function Receipt({ readers, total, group }: { readers: { name: string; at: Date }[]; total: number; group: boolean }) {
  let text: string;
  if (total === 0) text = "Sent";
  else if (readers.length === 0) text = "Sent · not read yet";
  else if (!group) text = `Read ${fmtTime(readers[0].at)}`;
  else if (readers.length === total) text = "Read by everyone";
  else text = `Read by ${readers.map((r) => r.name.split(" ")[0]).join(", ")} (${readers.length} of ${total})`;
  return <span className={`mt-0.5 px-1 text-[11px] ${readers.length ? "text-accent" : "text-ink-3"}`}>{text}</span>;
}

function Popover({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none rounded border border-line bg-panel px-2.5 py-1 text-[12.5px] font-medium hover:bg-panel-muted">{label}</summary>
      <div className="absolute right-0 z-20 mt-1 w-72 rounded-md border border-line bg-panel p-2.5 text-[12.5px] shadow-lg">{children}</div>
    </details>
  );
}
