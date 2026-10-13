import type { ChatStatus, Role } from "@prisma/client";

// Pure secure-chat rules, shared by the server, the UI and the tests.

export const MAX_BODY = 2000;
export const MAX_TITLE = 60;
export const MAX_MEMBERS = 20;

export const DISCLAIMER = "Secure chat is for working communication between staff. It is not part of the patient's legal record: document clinical decisions in the chart, and call for emergencies.";

// A message body as sent, or why it can't be.
export function cleanBody(raw: unknown): { ok: true; body: string } | { ok: false; error: string } {
  const body = typeof raw === "string" ? raw.replace(/\r\n/g, "\n").trim() : "";
  if (!body) return { ok: false, error: "Type a message first." };
  if (body.length > MAX_BODY) return { ok: false, error: `Messages are limited to ${MAX_BODY} characters (this one is ${body.length}).` };
  return { ok: true, body };
}

export function cleanTitle(raw: unknown): string | null {
  const t = typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE) : "";
  return t || null;
}

type Person = { id: string; name: string; credentials?: string | null };
type Member = { practitionerId: string; practitioner: Person; lastReadAt: Date | null; leftAt: Date | null };

export const activeMembers = <M extends Pick<Member, "leftAt">>(members: M[]) => members.filter((m) => !m.leftAt);

// What a conversation is called in the viewer's list: its group name, or the
// other people in it ("Kirsten Lund" or "Kirsten Lund, Leo Brandt +2").
export function conversationName(title: string | null, members: Pick<Member, "practitionerId" | "practitioner" | "leftAt">[], viewerId: string) {
  if (title) return title;
  const others = activeMembers(members).filter((m) => m.practitionerId !== viewerId).map((m) => m.practitioner.name);
  if (others.length === 0) return "Just you";
  if (others.length <= 3) return others.join(", ");
  return `${others.slice(0, 2).join(", ")} +${others.length - 2}`;
}

export const isGroup = (title: string | null, members: Pick<Member, "leftAt">[]) => !!title || activeMembers(members).length > 2;

// Who, other than the sender, has read a message: their read marker is at or past it.
export function readBy<M extends Member>(message: { senderId: string; createdAt: Date }, members: M[]): M[] {
  return activeMembers(members).filter((m) => m.practitionerId !== message.senderId && !!m.lastReadAt && m.lastReadAt >= message.createdAt);
}

// Unread for a member: text from someone else after their read marker (or after
// they joined, so history from before isn't counted as new).
export function isUnread(message: { senderId: string; createdAt: Date; kind: string }, member: { practitionerId: string; joinedAt: Date; lastReadAt: Date | null }) {
  if (message.kind !== "text" || message.senderId === member.practitionerId) return false;
  const since = member.lastReadAt && member.lastReadAt > member.joinedAt ? member.lastReadAt : member.joinedAt;
  return message.createdAt > since;
}

// A muted conversation stays out of the top-bar count unless the message is urgent.
export const countsTowardBadge = (muted: boolean, urgent: boolean) => !muted || urgent;

// Two member lists name the same people (order and duplicates ignored).
export function sameMembers(a: string[], b: string[]) {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((id) => y.has(id));
}

// Read markers only move forward, and never past the present.
export function nextReadMarker(current: Date | null, upTo: Date, now = new Date()) {
  const target = upTo > now ? now : upTo;
  return current && current >= target ? current : target;
}

export const statusLabel: Record<ChatStatus, string> = { available: "Available", busy: "Busy", away: "Away" };
export const statusDot: Record<ChatStatus, string> = { available: "bg-ok", busy: "bg-high", away: "bg-ink-3" };

export const roleOrder: Role[] = ["physician", "resident", "nurse", "front_desk"];

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
