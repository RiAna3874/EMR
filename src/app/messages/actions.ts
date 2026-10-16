"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ChatStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { cleanBody, cleanTitle, MAX_MEMBERS, nextReadMarker, sameMembers } from "@/lib/chat/chat";
import { activeMembership } from "@/lib/chat/server";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const refresh = () => revalidatePath("/", "layout");

export type ChatState = { error?: string; sent?: number } | undefined;

// The user's active membership, or null: the only door into a conversation.
async function membership(conversationId: string, userId: string) {
  return db.conversationMember.findFirst({ where: { conversationId, practitionerId: userId, leftAt: null } });
}

// Active staff among the given ids, excluding the sender.
async function validRecipients(ids: string[], userId: string) {
  const unique = [...new Set(ids.filter((id) => id && id !== userId))];
  if (unique.length === 0) return [];
  return db.practitioner.findMany({ where: { id: { in: unique }, active: true }, select: { id: true, name: true } });
}

// Starts a conversation, or adds to the existing one when the same people are
// already talking about the same patient with no group name.
export async function startConversation(_prev: ChatState, form: FormData): Promise<ChatState> {
  const user = await requirePermission("useChat");
  const recipients = await validRecipients(form.getAll("to").map(String), user.id);
  if (recipients.length === 0) return { error: "Choose at least one person to message." };
  if (recipients.length + 1 > MAX_MEMBERS) return { error: `A conversation can have up to ${MAX_MEMBERS} people.` };
  const msg = cleanBody(form.get("body"));
  if (!msg.ok) return { error: msg.error };
  const patientId = str(form, "patientId") || null;
  if (patientId && !(await db.patient.findUnique({ where: { id: patientId }, select: { id: true } }))) return { error: "That patient no longer exists." };
  const title = recipients.length > 1 ? cleanTitle(form.get("title")) : null;
  const urgent = form.get("urgent") === "on";
  const memberIds = [user.id, ...recipients.map((r) => r.id)];

  let conversationId: string | null = null;
  if (!title) {
    const candidates = await db.conversation.findMany({
      where: { title: null, patientId, ...activeMembership(user.id) },
      include: { members: { where: { leftAt: null }, select: { practitionerId: true } } },
      orderBy: { lastMessageAt: "desc" },
    });
    conversationId = candidates.find((c) => sameMembers(c.members.map((m) => m.practitionerId), memberIds))?.id ?? null;
  }

  const now = new Date();
  if (conversationId) {
    await db.$transaction([
      db.chatMessage.create({ data: { conversationId, senderId: user.id, body: msg.body, urgent, createdAt: now } }),
      db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
      db.conversationMember.update({ where: { conversationId_practitionerId: { conversationId, practitionerId: user.id } }, data: { lastReadAt: now } }),
    ]);
  } else {
    const created = await db.conversation.create({
      data: {
        title,
        patientId,
        createdById: user.id,
        lastMessageAt: now,
        members: { create: memberIds.map((id) => ({ practitionerId: id, joinedAt: now, lastReadAt: id === user.id ? now : null })) },
        messages: { create: { senderId: user.id, body: msg.body, urgent, createdAt: now } },
      },
    });
    conversationId = created.id;
  }
  refresh();
  redirect(form.get("from") === "phone" ? `/m/chat/${conversationId}` : `/messages/${conversationId}`);
}

export async function sendMessage(conversationId: string, _prev: ChatState, form: FormData): Promise<ChatState> {
  const user = await requirePermission("useChat");
  if (!(await membership(conversationId, user.id))) return { error: "You're no longer in this conversation." };
  const msg = cleanBody(form.get("body"));
  if (!msg.ok) return { error: msg.error };
  const now = new Date();
  await db.$transaction([
    db.chatMessage.create({ data: { conversationId, senderId: user.id, body: msg.body, urgent: form.get("urgent") === "on", createdAt: now } }),
    db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: now } }),
    db.conversationMember.update({ where: { conversationId_practitionerId: { conversationId, practitionerId: user.id } }, data: { lastReadAt: now } }),
  ]);
  refresh();
  return { sent: now.getTime() };
}

// Called by the open conversation while it is on screen; upTo is the newest message shown.
export async function markRead(conversationId: string, upTo: string) {
  const user = await requirePermission("useChat");
  const m = await membership(conversationId, user.id);
  const at = new Date(upTo);
  if (!m || Number.isNaN(at.getTime())) return;
  const next = nextReadMarker(m.lastReadAt, at);
  if (m.lastReadAt && next.getTime() === m.lastReadAt.getTime()) return;
  await db.conversationMember.update({ where: { conversationId_practitionerId: { conversationId, practitionerId: user.id } }, data: { lastReadAt: next } });
  refresh();
}

const systemLine = (conversationId: string, senderId: string, body: string, at = new Date()) => [
  db.chatMessage.create({ data: { conversationId, senderId, body, kind: "system", createdAt: at } }),
  db.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: at } }),
];

// Adding people to a one-to-one starts a new group instead, so earlier private
// messages aren't shown to someone new. In a group, new members see its history.
export async function addMembers(conversationId: string, form: FormData) {
  const user = await requirePermission("useChat");
  if (!(await membership(conversationId, user.id))) redirect("/messages");
  const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { members: true } });
  const active = conv.members.filter((m) => !m.leftAt).map((m) => m.practitionerId);
  const adding = (await validRecipients(form.getAll("add").map(String), user.id)).filter((p) => !active.includes(p.id));
  if (adding.length === 0) redirect(`/messages/${conversationId}`);
  if (active.length + adding.length > MAX_MEMBERS) redirect(`/messages/${conversationId}?error=members`);
  const names = adding.map((p) => p.name).join(", ");
  const now = new Date();

  if (!conv.title && active.length <= 2) {
    const created = await db.conversation.create({
      data: {
        patientId: conv.patientId,
        createdById: user.id,
        lastMessageAt: now,
        members: { create: [...active, ...adding.map((p) => p.id)].map((id) => ({ practitionerId: id, joinedAt: now, lastReadAt: id === user.id ? now : null })) },
        messages: { create: { senderId: user.id, kind: "system", body: `${user.name} started a group with ${names}`, createdAt: now } },
      },
    });
    refresh();
    redirect(`/messages/${created.id}`);
  }

  await db.$transaction([
    ...adding.map((p) =>
      db.conversationMember.upsert({
        where: { conversationId_practitionerId: { conversationId, practitionerId: p.id } },
        create: { conversationId, practitionerId: p.id, joinedAt: now },
        update: { leftAt: null, joinedAt: now, lastReadAt: null, muted: false },
      }),
    ),
    ...systemLine(conversationId, user.id, `${user.name} added ${names}`, now),
  ]);
  refresh();
  redirect(`/messages/${conversationId}`);
}

export async function leaveConversation(conversationId: string) {
  const user = await requirePermission("useChat");
  if (await membership(conversationId, user.id)) {
    await db.$transaction([
      db.conversationMember.update({ where: { conversationId_practitionerId: { conversationId, practitionerId: user.id } }, data: { leftAt: new Date() } }),
      ...systemLine(conversationId, user.id, `${user.name} left the conversation`),
    ]);
  }
  refresh();
  redirect("/messages");
}

export async function toggleMute(conversationId: string) {
  const user = await requirePermission("useChat");
  const m = await membership(conversationId, user.id);
  if (!m) return;
  await db.conversationMember.update({ where: { conversationId_practitionerId: { conversationId, practitionerId: user.id } }, data: { muted: !m.muted } });
  refresh();
}

export async function renameConversation(conversationId: string, form: FormData) {
  const user = await requirePermission("useChat");
  if (!(await membership(conversationId, user.id))) redirect("/messages");
  const conv = await db.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { members: { where: { leftAt: null } } } });
  const title = cleanTitle(form.get("title"));
  // One-to-ones stay named after the other person.
  if ((conv.title || conv.members.length > 2) && title !== conv.title) {
    await db.$transaction([
      db.conversation.update({ where: { id: conversationId }, data: { title } }),
      ...systemLine(conversationId, user.id, title ? `${user.name} named the conversation "${title}"` : `${user.name} removed the conversation name`),
    ]);
  }
  refresh();
  redirect(`/messages/${conversationId}`);
}

const STATUSES: ChatStatus[] = ["available", "busy", "away"];

export async function setChatStatus(form: FormData) {
  const user = await requirePermission("useChat");
  const status = str(form, "status") as ChatStatus;
  if (!STATUSES.includes(status)) return;
  await db.practitioner.update({ where: { id: user.id }, data: { chatStatus: status, chatStatusNote: status === "available" ? null : str(form, "note").slice(0, 60) || null } });
  refresh();
}
