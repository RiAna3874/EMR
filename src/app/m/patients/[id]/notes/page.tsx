import { db } from "@/lib/db";
import { requirePhonePermission } from "@/lib/phone-session";
import { logChartView } from "@/lib/audit/server";
import { noteTypeLabel } from "@/lib/notes/library";
import { fmtDate } from "@/lib/format";
import { NoteStatusChip } from "@/components/notes/note-view";
import { PhoneEmpty, PhoneSection, RowLink } from "@/components/phone/header";

export const metadata = { title: "Notes" };

// Notes newest first, to read on the phone. Writing and signing stay on the full site.
export default async function PhoneNotes({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePhonePermission("viewClinical");
  await logChartView(id, "Notes (phone)");
  const notes = await db.note.findMany({
    where: { patientId: id },
    orderBy: [{ serviceAt: "desc" }, { createdAt: "desc" }],
    take: 100,
    include: { author: true, _count: { select: { addenda: true } } },
  });
  return (
    <PhoneSection title="Notes">
      {notes.length === 0 && <PhoneEmpty>No notes.</PhoneEmpty>}
      {notes.map((n) => (
        <RowLink key={n.id} href={`/m/patients/${id}/notes/${n.id}`}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate font-medium">{n.title}</span>
            <NoteStatusChip status={n.status} addenda={n._count.addenda} />
          </div>
          <div className="truncate text-[13px] text-ink-3">
            {fmtDate(n.serviceAt)} · {noteTypeLabel[n.type]} · {n.author.name}
          </div>
        </RowLink>
      ))}
    </PhoneSection>
  );
}
