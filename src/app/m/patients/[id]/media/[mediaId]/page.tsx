import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePhonePermission } from "@/lib/phone-session";
import { isMediaCategory, mediaCategoryLabel } from "@/lib/media/categories";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Photo" };

// One photo or scan, full width. Opening the file itself is logged by /media/[id].
export default async function PhoneMediaItem({ params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const { id, mediaId } = await params;
  await requirePhonePermission("viewClinical");
  const m = await db.mediaItem.findFirst({
    where: { id: mediaId, patientId: id },
    select: { id: true, title: true, category: true, bodySite: true, description: true, takenAt: true, mimeType: true, uploadedBy: { select: { name: true } } },
  });
  if (!m) notFound();
  return (
    <>
      <div className="mt-3 bg-[#1d2327]">
        {m.mimeType.startsWith("image/") ? (
          <a href={`/media/${m.id}`} target="_blank" rel="noreferrer" className="block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/media/${m.id}`} alt={m.title} className="mx-auto max-h-[70dvh] w-full object-contain" />
          </a>
        ) : (
          <a href={`/media/${m.id}`} target="_blank" rel="noreferrer" className="block py-10 text-center font-medium text-white underline">
            Open the PDF
          </a>
        )}
      </div>
      <div className="border-b border-line bg-panel px-4 py-3">
        <h2 className="text-[17px] font-semibold">{m.title}</h2>
        <p className="text-[13px] text-ink-3">
          {isMediaCategory(m.category) ? mediaCategoryLabel[m.category] : m.category}
          {m.bodySite && ` · ${m.bodySite}`} · {fmtDate(m.takenAt)} · added by {m.uploadedBy.name}
        </p>
        {m.description && <p className="mt-2 text-[14px]">{m.description}</p>}
      </div>
      <p className="px-4 pt-3 text-[13px]">
        <Link href={`/m/patients/${id}/media`} className="font-medium text-accent">
          Back to Media
        </Link>
      </p>
    </>
  );
}
