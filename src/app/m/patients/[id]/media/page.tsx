import Link from "next/link";
import { db } from "@/lib/db";
import { requirePhonePermission } from "@/lib/phone-session";
import { can } from "@/lib/roles";
import { logChartView } from "@/lib/audit/server";
import { isMediaCategory, mediaCategoryLabel } from "@/lib/media/categories";
import { fmtShortDate } from "@/lib/format";
import { PhoneEmpty, PhoneSection } from "@/components/phone/header";
import { PhoneAddPhoto } from "@/components/phone/add-photo";

export const metadata = { title: "Media" };

// Clinical photos and scans: take one with the phone's camera, or look through what's filed.
export default async function PhoneMedia({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ add?: string }> }) {
  const { id } = await params;
  const user = await requirePhonePermission("viewClinical");
  await logChartView(id, "Media (phone)");
  const canAdd = can(user.role, "addMedia");
  const adding = canAdd && (await searchParams).add === "1";
  const items = await db.mediaItem.findMany({
    where: { patientId: id },
    orderBy: [{ takenAt: "desc" }, { uploadedAt: "desc" }],
    select: { id: true, title: true, category: true, takenAt: true, mimeType: true },
  });

  return (
    <>
      {adding ? (
        <PhoneAddPhoto patientId={id} />
      ) : (
        canAdd && (
          <div className="px-4 pt-3">
            <Link href={`/m/patients/${id}/media?add=1`} className="flex items-center justify-center gap-2 rounded-lg bg-accent py-3 font-semibold text-white active:bg-accent/90">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              Take or add a photo
            </Link>
          </div>
        )
      )}
      <PhoneSection title={`Media (${items.length})`}>
        {items.length === 0 ? (
          <PhoneEmpty>No photos or scans yet.</PhoneEmpty>
        ) : (
          <ul className="grid grid-cols-3 gap-px bg-line">
            {items.map((m) => (
              <li key={m.id} className="bg-panel">
                <Link href={`/m/patients/${id}/media/${m.id}`} className="block active:opacity-80">
                  <div className="flex aspect-square items-center justify-center overflow-hidden bg-panel-muted">
                    {m.mimeType.startsWith("image/") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/media/${m.id}?size=thumb`} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="rounded bg-crit-soft px-2 py-1 text-[11px] font-bold text-crit">PDF</span>
                    )}
                  </div>
                  <div className="px-1.5 py-1">
                    <div className="truncate text-[12px] font-medium">{m.title}</div>
                    <div className="truncate text-[11px] text-ink-3">
                      {fmtShortDate(m.takenAt)} · {isMediaCategory(m.category) ? mediaCategoryLabel[m.category] : m.category}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PhoneSection>
    </>
  );
}
