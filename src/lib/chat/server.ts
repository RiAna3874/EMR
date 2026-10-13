import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

// Data access for secure chat. Every read goes through membership: a
// conversation exists, for a user, only while they are an active member of it.

const memberInclude = { practitioner: { select: { id: true, name: true, credentials: true, role: true, chatStatus: true, chatStatusNote: true } } } as const;

export const activeMembership = (userId: string): Prisma.ConversationWhereInput => ({ members: { some: { practitionerId: userId, leftAt: null } } });

// Messages that are unread for the member: someone else's text after their read marker (or join).
const UNREAD_SQL = `
  FROM "ChatMessage" m
  JOIN "ConversationMember" cm ON cm."conversationId" = m."conversationId"
  WHERE cm."practitionerId" = $1 AND cm."leftAt" IS NULL
    AND m."senderId" <> $1 AND m.kind = 'text'
    AND m."createdAt" > GREATEST(cm."joinedAt", COALESCE(cm."lastReadAt", cm."joinedAt"))`;

// For the top bar: unread messages, leaving out muted conversations unless urgent.
export async function chatUnread(userId: string) {
  const [row] = await db.$queryRawUnsafe<{ total: number; urgent: number }[]>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE m.urgent)::int AS urgent ${UNREAD_SQL} AND (NOT cm.muted OR m.urgent)`,
    userId,
  );
  return row ?? { total: 0, urgent: 0 };
}

// The newest unread urgent message, for the top-bar alert.
export async function latestUrgent(userId: string) {
  const [row] = await db.$queryRawUnsafe<{ id: string; conversationId: string; body: string; sender: string }[]>(
    `SELECT m.id, m."conversationId", m.body, p.name AS sender ${UNREAD_SQL.replace('FROM "ChatMessage" m', 'FROM "ChatMessage" m JOIN "Practitioner" p ON p.id = m."senderId"')} AND m.urgent ORDER BY m."createdAt" DESC LIMIT 1`,
    userId,
  );
  return row ?? null;
}

// The top bar's Messages badge and urgent alert.
export async function chatBadge(userId: string) {
  const [counts, urgent] = await Promise.all([chatUnread(userId), latestUrgent(userId)]);
  return { ...counts, latestUrgent: urgent && { id: urgent.id, conversationId: urgent.conversationId, from: urgent.sender, preview: urgent.body.slice(0, 120) } };
}

export async function unreadByConversation(userId: string) {
  const rows = await db.$queryRawUnsafe<{ conversationId: string; n: number; urgent: number }[]>(
    `SELECT m."conversationId", count(*)::int AS n, count(*) FILTER (WHERE m.urgent)::int AS urgent ${UNREAD_SQL} GROUP BY m."conversationId"`,
    userId,
  );
  return new Map(rows.map((r) => [r.conversationId, r]));
}

export async function myConversations(userId: string, where: Prisma.ConversationWhereInput = {}) {
  const [conversations, unread] = await Promise.all([
    db.conversation.findMany({
      where: { AND: [activeMembership(userId), where] },
      orderBy: { lastMessageAt: "desc" },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true, mrn: true } },
        members: { include: memberInclude },
        messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { name: true } } } },
      },
    }),
    unreadByConversation(userId),
  ]);
  return conversations.map((c) => ({ ...c, unread: unread.get(c.id)?.n ?? 0, unreadUrgent: unread.get(c.id)?.urgent ?? 0 }));
}

// The conversation with its messages, or null when the user isn't in it.
export async function conversationFor(id: string, userId: string) {
  return db.conversation.findFirst({
    where: { id, ...activeMembership(userId) },
    include: {
      patient: true,
      members: { include: memberInclude, orderBy: { joinedAt: "asc" } },
      messages: { orderBy: { createdAt: "asc" }, include: { sender: { select: { id: true, name: true, credentials: true } } } },
    },
  });
}

export const staffDirectory = () =>
  db.practitioner.findMany({
    where: { active: true },
    orderBy: [{ name: "asc" }],
    select: { id: true, name: true, credentials: true, role: true, chatStatus: true, chatStatusNote: true },
  });
