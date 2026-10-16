import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePhonePermission } from "@/lib/phone-session";
import { logChartView } from "@/lib/audit/server";
import { NoteDocument } from "@/components/notes/note-view";

export const metadata = { title: "Note" };

export default async function PhoneNote({ params }: { params: Promise<{ id: string; noteId: string }> }) {
  const { id, noteId } = await params;
  await requirePhonePermission("viewClinical");
  const note = await db.note.findFirst({
    where: { id: noteId, patientId: id },
    include: {
      author: true,
      cosigner: true,
      editedBy: true,
      encounter: true,
      addenda: { include: { author: true }, orderBy: { signedAt: "asc" } },
      versions: { include: { signedBy: true }, orderBy: { number: "asc" } },
    },
  });
  if (!note) notFound();
  await logChartView(id, "Notes (phone)");
  return (
    <div className="mt-3 border-y border-line bg-panel px-4 py-4">
      <NoteDocument note={note} />
    </div>
  );
}
