import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can, PERMISSIONS, type Permission } from "@/lib/roles";
import { latestVitals } from "@/lib/chart";
import { fullName } from "@/lib/format";
import { PatientRail } from "@/components/chart/patient-rail";
import { ChartTabs } from "@/components/chart/chart-tabs";
import { documentsWhere } from "@/lib/documents/server";
import { activeMembership } from "@/lib/chat/server";
import { conversationName } from "@/lib/chat/chat";
import { Suspense } from "react";
import { SearchHighlighter } from "@/components/search/search-highlighter";
import { getViewPrefs } from "@/lib/view-prefs-server";

export const dynamic = "force-dynamic";

export default async function ChartLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await requireUser();
  const allowed = (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(currentUser.role, p));
  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      pcp: true,
      allergies: { orderBy: { severity: "desc" } },
      conditions: { where: { status: "active" }, orderBy: { priority: "asc" } },
      encounters: { where: { start: { gte: new Date() }, status: { in: ["planned", "arrived"] } }, orderBy: { start: "asc" }, take: 1, include: { provider: true } },
    },
  });
  if (!patient) notFound();
  // A duplicate merged into another chart opens that chart instead.
  if (patient.mergedIntoId) redirect(`/patients/${patient.mergedIntoId}`);

  const [vitals, abnormal, drafts, toVerify, unsignedOrders, refillRequests, docsToReview, conversations] = await Promise.all([
    latestVitals(id),
    db.observation.count({
      where: {
        patientId: id,
        category: "laboratory",
        flag: { in: ["L", "H", "LL", "HH", "A"] },
        effectiveAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
      },
    }),
    // Notes waiting on the current user: their pended notes and notes to cosign.
    db.note.count({ where: { patientId: id, OR: [{ status: "draft", authorId: currentUser.id }, { status: "pending_cosign", cosignerId: currentUser.id }] } }),
    db.importJob.count({ where: { patientId: id, status: "needs_review" } }),
    db.serviceRequest.count({ where: { patientId: id, status: "pending" } }),
    db.refillRequest.count({ where: { patientId: id, status: { in: ["requested", "pended"] } } }),
    // Outside documents waiting on the current user's review.
    db.clinicalDocument.count({ where: { patientId: id, ...documentsWhere(currentUser.id) } }),
    // The current user's secure chat conversations about this patient.
    can(currentUser.role, "useChat")
      ? db.conversation.findMany({
          where: { patientId: id, ...activeMembership(currentUser.id) },
          orderBy: { lastMessageAt: "desc" },
          take: 3,
          include: { members: { include: { practitioner: { select: { id: true, name: true } } } } },
        })
      : [],
  ]);
  const prefs = await getViewPrefs();
  const chats = conversations.map((c) => ({ id: c.id, name: conversationName(c.title, c.members, currentUser.id), at: c.lastMessageAt }));

  return (
    <div className="flex h-full">
      <PatientRail patient={patient} vitals={vitals} clinical={allowed.includes("viewClinical")} chats={allowed.includes("useChat") ? chats : null} admin={currentUser.isAdmin} hidden={prefs.hidden} />
      <div className="flex min-w-0 flex-1 flex-col">
        <ChartTabs patientId={id} label={fullName(patient)} counts={{ results: abnormal, meds: refillRequests, notes: drafts, orders: unsignedOrders, documents: docsToReview, import: toVerify }} allowed={allowed} hidden={prefs.hidden} />
        <div id="chart-content" className="min-h-0 flex-1 overflow-auto">
          {children}
        </div>
        <Suspense>
          <SearchHighlighter rootId="chart-content" />
        </Suspense>
      </div>
    </div>
  );
}
