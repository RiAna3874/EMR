import Link from "next/link";
import type { ClinicalDocType } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { fmtDateOnly, fmtDateTime } from "@/lib/format";
import { DOC_TYPES } from "@/lib/documents/draft";
import { filedDocInclude, toFiledDoc } from "@/lib/documents/server";
import { Empty } from "@/components/panel";
import { Button, inputCls } from "@/components/form";
import { DocTypeChip, DocView } from "@/components/documents/doc-view";
import { ImportStatusChip } from "@/components/import/status-chip";
import { acknowledgeDocument } from "../import/document-actions";
import { logChartView } from "@/lib/audit/server";
import { EnteredInError } from "@/components/entered-in-error";
import { markDocumentInError } from "../error-actions";

export const dynamic = "force-dynamic";

type Entry =
  | { kind: "doc"; id: string; at: Date; type: ClinicalDocType; title: string; source: string | null; unreviewed: boolean; thumb: string | null }
  | { kind: "lab"; id: string; at: Date; title: string; source: string | null; thumb: string | null; reports: { id: string; display: string }[] };

// Outside records in one place: filed documents, imported lab reports, and
// uploads still waiting for review. Opens on the newest.
export default async function Documents({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string; type?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const currentUser = await requirePermission("viewClinical");
  const canFile = can(currentUser.role, "fileImports");
  await logChartView(id, "Documents");
  const base = `/patients/${id}/documents`;

  const [docs, labJobs, waiting, patient] = await Promise.all([
    db.clinicalDocument.findMany({
      where: { patientId: id },
      orderBy: [{ serviceDate: "desc" }, { filedAt: "desc" }],
      include: { importJob: { select: { documents: { select: { id: true, mimeType: true }, orderBy: { position: "asc" }, take: 1 } } } },
    }),
    db.importJob.findMany({
      where: { patientId: id, kind: "lab", status: "filed" },
      orderBy: { filedAt: "desc" },
      include: { documents: { select: { id: true, mimeType: true }, orderBy: { position: "asc" }, take: 1 }, reports: { where: { enteredInErrorAt: null }, select: { id: true, display: true, effectiveAt: true, performer: true } } },
    }),
    db.importJob.findMany({ where: { patientId: id, status: { in: ["extracting", "needs_review", "failed"] } }, orderBy: { createdAt: "desc" }, include: { createdBy: true } }),
    db.patient.findUniqueOrThrow({ where: { id }, select: { pcpId: true } }),
  ]);

  const thumb = (d: { id: string; mimeType: string } | undefined) => (d && d.mimeType.startsWith("image/") ? `/documents/${d.id}` : null);
  const entries: Entry[] = [
    ...docs.map((d) => ({
      kind: "doc" as const,
      id: d.id,
      at: d.serviceDate,
      type: d.type,
      title: d.title,
      source: d.organization,
      unreviewed: !d.reviewedAt,
      thumb: thumb(d.importJob?.documents[0]),
    })),
    ...labJobs
      .filter((j) => j.reports.length)
      .map((j) => ({
        kind: "lab" as const,
        id: j.id,
        at: j.reports[0].effectiveAt,
        title: (j.draft as { reportTitle?: string } | null)?.reportTitle || "Lab report",
        source: j.reports[0].performer,
        thumb: thumb(j.documents[0]),
        reports: j.reports,
      })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  const counts = new Map<string, number>();
  for (const e of entries) {
    const k = e.kind === "lab" ? "lab" : e.type;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const filters = [
    { id: "all", label: "All", n: entries.length },
    ...DOC_TYPES.filter((t) => counts.has(t.id)).map((t) => ({ id: t.id, label: t.plural, n: counts.get(t.id)! })),
    ...(counts.has("lab") ? [{ id: "lab", label: "Lab reports", n: counts.get("lab")! }] : []),
  ];
  const filter = filters.some((f) => f.id === sp.type) ? sp.type! : "all";
  const shown = entries.filter((e) => filter === "all" || (e.kind === "lab" ? filter === "lab" : e.type === filter));
  const selected = shown.find((e) => e.id === sp.doc) ?? entries.find((e) => e.id === sp.doc) ?? shown[0];
  const href = (extra: Record<string, string>) => `${base}?${new URLSearchParams({ ...(filter !== "all" ? { type: filter } : {}), ...extra })}`;

  const raw = selected?.kind === "doc" ? await db.clinicalDocument.findUniqueOrThrow({ where: { id: selected.id }, include: filedDocInclude }) : null;
  const full = raw ? toFiledDoc(raw) : null;
  // Same rule as the Inbox: the ordering clinician, or the PCP when nothing was ordered.
  const responsible = !!raw && (raw.order?.orderedById ?? patient.pcpId) === currentUser.id;
  const canAck = !!full && !full.reviewedAt && can(currentUser.role, "reviewResults") && responsible;

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <h2 className="flex-1 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Outside records</h2>
          {can(currentUser.role, "importReports") && (
            <Link href={`/patients/${id}/import?kind=document`} className="rounded border border-line px-2 py-0.5 text-[12px] font-medium hover:border-accent hover:text-accent">
              + Import
            </Link>
          )}
        </div>
        <div className="flex flex-wrap gap-1 border-b border-line px-3 py-2">
          {filters.map((f) => (
            <Link
              key={f.id}
              href={f.id === "all" ? base : `${base}?type=${f.id}`}
              className={`rounded-full border px-2 py-0.5 text-[11.5px] ${filter === f.id ? "border-accent bg-accent-soft font-semibold text-accent" : "border-line text-ink-2 hover:border-accent/50"}`}
            >
              {f.label} <span className="text-ink-3">{f.n}</span>
            </Link>
          ))}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {waiting.length > 0 && (
            <div className="border-b border-line bg-warn-soft/40">
              <div className="px-3 pt-2 text-[11px] font-semibold uppercase tracking-wide text-warn">Waiting for review</div>
              <ul>
                {waiting.map((j) => (
                  <li key={j.id}>
                    <Link href={`/patients/${id}/import/${j.id}`} className="flex items-center gap-2 px-3 py-1.5 hover:bg-warn-soft">
                      <span className="min-w-0 flex-1 truncate text-[12.5px]">
                        {(j.draft as { title?: string; reportTitle?: string } | null)?.title || (j.draft as { reportTitle?: string } | null)?.reportTitle || (j.kind === "document" ? "Clinical document" : "Lab report")}
                        <span className="block text-[11px] text-ink-3">
                          Uploaded {fmtDateTime(j.createdAt)} by {j.createdBy.name}
                        </span>
                      </span>
                      <ImportStatusChip status={j.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {shown.length === 0 ? (
            <Empty>No outside records filed yet.</Empty>
          ) : (
            <ul>
              {shown.map((e) => (
                <li key={e.id} className="border-b border-line">
                  <Link href={href({ doc: e.id })} className={`flex gap-2.5 px-3 py-2 ${selected?.id === e.id ? "bg-accent-soft" : "hover:bg-panel-muted"}`}>
                    <Thumb src={e.thumb} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        {e.kind === "doc" ? <DocTypeChip type={e.type} /> : <span className="rounded bg-low-soft px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-low">Lab report</span>}
                        {e.kind === "doc" && e.unreviewed && <span className="h-2 w-2 rounded-full bg-warn" title="Not yet reviewed" />}
                      </div>
                      <div className="mt-0.5 truncate font-medium" title={e.title}>
                        {e.title}
                      </div>
                      <div className="truncate text-[11.5px] text-ink-3">
                        {fmtDateOnly(e.at)}
                        {e.source && ` · ${e.source}`}
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto">
        {full ? (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2">
              <span className="flex-1 text-[12px] text-ink-3">Filed {fmtDateTime(full.filedAt)} by {full.filedBy.name}</span>
              <Link href={`/print/document?id=${full.id}`} className="rounded border border-line bg-panel px-2.5 py-1 text-[12.5px] font-medium hover:bg-panel-muted">
                Print
              </Link>
            </div>
            {canFile && (
              <div className="border-b border-line px-4 py-1.5">
                <EnteredInError action={markDocumentInError.bind(null, id, full.id)} what="this document" />
              </div>
            )}
            {canAck && (
              <form action={acknowledgeDocument.bind(null, full.id, href({ doc: full.id }))} className="flex flex-wrap items-center gap-2 border-b border-warn/30 bg-warn-soft/60 px-4 py-2">
                <span className="text-[12.5px] font-medium text-warn">Waiting for your review.</span>
                <input name="comment" className={`${inputCls} min-w-48 flex-1 py-0.5`} placeholder="Comment (optional)" />
                <Button type="submit">Mark reviewed</Button>
              </form>
            )}
            <div className="max-w-4xl px-5 py-4">
              <DocView doc={full} patientId={id} />
            </div>
          </>
        ) : selected?.kind === "lab" ? (
          <div className="max-w-3xl space-y-3 px-5 py-4">
            <h2 className="text-lg font-semibold">{selected.title}</h2>
            <p className="text-ink-2">
              {selected.source} · collected {fmtDateOnly(selected.at)}. The values were filed as results:
            </p>
            <div className="flex flex-wrap gap-2">
              {selected.reports.map((r) => (
                <Link key={r.id} href={`/patients/${id}/results?view=reports&report=${r.id}`} className="rounded border border-line bg-panel px-2.5 py-1 hover:border-accent hover:text-accent">
                  {r.display}
                </Link>
              ))}
            </div>
            <Link href={`/patients/${id}/import/${selected.id}`} className="inline-block text-accent hover:underline">
              View the source pages
            </Link>
          </div>
        ) : (
          <Empty>{entries.length ? "Select a record." : waiting.length ? "Nothing filed yet. Imports waiting for review are listed on the left." : "No outside records yet."}</Empty>
        )}
      </section>
    </div>
  );
}

function Thumb({ src }: { src: string | null }) {
  return (
    <div className="flex h-[52px] w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-line bg-panel-muted">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
      ) : (
        <span className="text-[9px] font-bold text-crit">PDF</span>
      )}
    </div>
  );
}
