import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { fmtDate, fmtDateTime, toLocalDate } from "@/lib/format";
import { logChartView } from "@/lib/audit/server";
import { isMediaCategory, MEDIA_CATEGORIES, mediaCategoryLabel } from "@/lib/media/categories";
import { Empty } from "@/components/panel";
import { ActionButton } from "@/components/action-button";
import { EnteredInError } from "@/components/entered-in-error";
import { AddMediaPanel, ZoomableImage } from "@/components/media/media-viewer";
import { EditMediaDetails } from "@/components/media/media-details";
import { markMediaInError, readMediaAsReport } from "./actions";

export const dynamic = "force-dynamic";

// The chart's Media tab: clinical photos and scans, newest first, with a large viewer,
// side-by-side comparison (a wound or rash over time) and renaming.
export default async function Media({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ item?: string; cat?: string; with?: string; add?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("viewClinical");
  const canAdd = can(user.role, "addMedia");
  const canImport = can(user.role, "importReports");
  await logChartView(id, "Media");
  const base = `/patients/${id}/media`;

  const items = await db.mediaItem.findMany({
    where: { patientId: id },
    orderBy: [{ takenAt: "desc" }, { uploadedAt: "desc" }],
    select: {
      id: true, title: true, category: true, bodySite: true, description: true, takenAt: true, mimeType: true, width: true, height: true,
      uploadedAt: true, updatedAt: true, updatedById: true, importJobId: true, thumb: false, uploadedBy: { select: { name: true } },
    },
  });

  const counts = new Map<string, number>();
  for (const m of items) counts.set(m.category, (counts.get(m.category) ?? 0) + 1);
  const filter = sp.cat && counts.has(sp.cat) ? sp.cat : "all";
  const shown = items.filter((m) => filter === "all" || m.category === filter);
  const selected = items.find((m) => m.id === sp.item) ?? shown[0];
  const other = selected && sp.with ? items.find((m) => m.id === sp.with && m.id !== selected.id) : undefined;
  const href = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    if (filter !== "all") q.set("cat", filter);
    for (const [k, v] of Object.entries(extra)) if (v) q.set(k, v);
    return q.size ? `${base}?${q}` : base;
  };
  // Earlier and later photos of the same site or kind, to compare with.
  const comparable = selected
    ? items.filter((m) => m.id !== selected.id && m.mimeType.startsWith("image/") && (selected.bodySite ? m.bodySite === selected.bodySite : m.category === selected.category))
    : [];
  const editor = selected?.updatedById && selected.updatedAt.getTime() - selected.uploadedAt.getTime() > 1000
    ? await db.practitioner.findUnique({ where: { id: selected.updatedById }, select: { name: true } })
    : null;

  // The grid, grouped by the day each item was taken.
  const days: { day: string; label: string; items: typeof shown }[] = [];
  for (const m of shown) {
    const day = toLocalDate(m.takenAt);
    if (days.at(-1)?.day !== day) days.push({ day, label: fmtDate(m.takenAt), items: [] });
    days.at(-1)!.items.push(m);
  }

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <h2 className="flex-1 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Media</h2>
          {canAdd && (
            <Link href={href({ item: selected?.id, add: "1" })} className="rounded border border-accent bg-accent px-2 py-0.5 text-[12px] font-medium text-white hover:bg-accent/90">
              + Photo or scan
            </Link>
          )}
        </div>
        {items.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2">
            {[{ id: "all", label: "All", n: items.length }, ...MEDIA_CATEGORIES.filter((c) => counts.has(c.id)).map((c) => ({ id: c.id as string, label: c.label, n: counts.get(c.id)! }))].map((f) => (
              <Link
                key={f.id}
                href={f.id === "all" ? base : `${base}?cat=${f.id}`}
                className={`rounded-full border px-2 py-0.5 text-[11.5px] ${filter === f.id ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line text-ink-2 hover:border-accent/50"}`}
              >
                {f.label} <span className="text-ink-3">{f.n}</span>
              </Link>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <Empty>{canAdd ? "No photos or scans yet. Use “+ Photo or scan” to take one or upload it." : "No photos or scans yet."}</Empty>
          ) : (
            days.map((d) => (
              <section key={d.day} className="border-b border-line px-3 py-2">
                <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{d.label}</h3>
                <ul className="grid grid-cols-2 gap-2">
                  {d.items.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={href({ item: m.id })}
                        className={`block overflow-hidden rounded border ${m.id === selected?.id || m.id === other?.id ? "border-accent ring-2 ring-accent/25" : "border-line hover:border-accent/50"}`}
                      >
                        <div className="flex h-24 items-center justify-center bg-panel-muted">
                          {m.mimeType.startsWith("image/") ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={`/media/${m.id}?size=thumb`} alt="" loading="lazy" className="h-full w-full object-cover" />
                          ) : (
                            <span className="rounded bg-crit-soft px-2 py-1 text-[11px] font-bold text-crit">PDF</span>
                          )}
                        </div>
                        <div className="px-1.5 py-1">
                          <div className="truncate text-[12px] font-medium" title={m.title}>
                            {m.title}
                          </div>
                          <div className="truncate text-[10.5px] text-ink-3">{isMediaCategory(m.category) ? mediaCategoryLabel[m.category] : m.category}</div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 space-y-3 overflow-y-auto p-4">
        {canAdd && sp.add === "1" && <AddMediaPanel patientId={id} closeHref={href({ item: selected?.id })} />}

        {!selected ? (
          !sp.add && (
            <div className="mx-auto mt-10 max-w-md text-center text-ink-2">
              <h2 className="font-semibold text-ink">Clinical photos and scans</h2>
              <p className="mt-1">
                Photos of findings (hands, skin, wounds, eyes), ECG strips, consent forms, ID cards and any paper the patient brings, kept with the chart and named so the
                next person can find them.
              </p>
            </div>
          )
        ) : (
          <article className="space-y-3 rounded-md border border-line bg-panel p-3">
            <header className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <div className="min-w-0 flex-1">
                <h1 className="text-lg font-semibold leading-tight">{selected.title}</h1>
                <p className="text-[12.5px] text-ink-2">
                  {isMediaCategory(selected.category) ? mediaCategoryLabel[selected.category] : selected.category}
                  {selected.bodySite && ` · ${selected.bodySite}`} · taken {fmtDate(selected.takenAt)}
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <a href={`/media/${selected.id}`} target="_blank" rel="noreferrer" className="rounded border border-line px-2.5 py-1 text-[12.5px] font-medium hover:border-accent hover:text-accent">
                  Open full size
                </a>
                <a href={`/media/${selected.id}?download=1`} className="rounded border border-line px-2.5 py-1 text-[12.5px] font-medium hover:border-accent hover:text-accent">
                  Download
                </a>
                {canImport && (
                  <ActionButton action={readMediaAsReport.bind(null, id, selected.id)} confirm="Read this into the chart with Import? Claude transcribes it and you review it before anything is filed.">
                    Read as a report
                  </ActionButton>
                )}
              </div>
            </header>

            {selected.description && <p className="whitespace-pre-line rounded bg-panel-muted px-3 py-2">{selected.description}</p>}

            {other ? (
              <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {[selected, other].map((m) => (
                  <figure key={m.id} className="space-y-1">
                    <ZoomableImage src={`/media/${m.id}`} alt={m.title} />
                    <figcaption className="text-[12px] text-ink-2">
                      <span className="font-medium text-ink">{fmtDate(m.takenAt)}</span> · {m.title}
                    </figcaption>
                  </figure>
                ))}
              </div>
            ) : selected.mimeType.startsWith("image/") ? (
              <ZoomableImage src={`/media/${selected.id}`} alt={selected.title} />
            ) : (
              <iframe src={`/media/${selected.id}`} title={selected.title} className="h-[70vh] w-full rounded border border-line" />
            )}

            {selected.mimeType.startsWith("image/") && comparable.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                <span className="font-medium text-ink-2">Compare with</span>
                {comparable.slice(0, 8).map((m) => (
                  <Link
                    key={m.id}
                    href={href({ item: selected.id, with: m.id === other?.id ? undefined : m.id })}
                    className={`rounded-full border px-2 py-0.5 ${m.id === other?.id ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line hover:border-accent/50"}`}
                  >
                    {fmtDate(m.takenAt)}
                  </Link>
                ))}
                {other && (
                  <Link href={href({ item: selected.id })} className="text-ink-3 hover:text-accent">
                    Close comparison
                  </Link>
                )}
              </div>
            )}

            {canAdd && (
              <EditMediaDetails
                key={`${selected.id}-${selected.updatedAt.getTime()}`}
                patientId={id}
                mediaId={selected.id}
                initial={{ title: selected.title, category: selected.category, bodySite: selected.bodySite ?? "", description: selected.description ?? "", takenOn: toLocalDate(selected.takenAt) }}
              />
            )}

            <footer className="space-y-2 border-t border-line pt-2 text-[11.5px] text-ink-3">
              <p>
                Added by {selected.uploadedBy.name} {fmtDateTime(selected.uploadedAt)}
                {editor && `. Renamed or edited by ${editor.name} ${fmtDateTime(selected.updatedAt)}`}
                {selected.width && selected.height && `. ${selected.width}×${selected.height} px`}.
                {selected.importJobId && (
                  <>
                    {" "}
                    <Link href={`/patients/${id}/import/${selected.importJobId}`} className="text-accent hover:underline">
                      Sent to Import
                    </Link>
                    .
                  </>
                )}
              </p>
              {canAdd && <EnteredInError action={markMediaInError.bind(null, id, selected.id)} what="this item" />}
            </footer>
          </article>
        )}
      </main>
    </div>
  );
}
