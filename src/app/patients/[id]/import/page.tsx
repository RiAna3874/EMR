import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { Empty, Panel } from "@/components/panel";
import { UploadForm } from "@/components/import/upload-form";
import { ImportStatusChip } from "@/components/import/status-chip";

export default async function ImportReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("importReports");
  const jobs = await db.importJob.findMany({
    where: { patientId: id },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: true,
      documents: { select: { id: true, mimeType: true }, orderBy: { position: "asc" } },
      reports: { select: { id: true, display: true, _count: { select: { observations: true } } } },
    },
  });

  return (
    <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-5">
      <Panel title="Import a lab report" className="xl:col-span-3">
        <div className="p-3">
          <UploadForm patientId={id} />
          <ol className="mt-4 grid grid-cols-1 gap-2 text-[12px] text-ink-2 sm:grid-cols-3">
            <Step n={1} title="Upload">A photo, scan or PDF from any outside lab.</Step>
            <Step n={2} title="Review">Claude transcribes each test. Check every value against the image, side by side.</Step>
            <Step n={3} title="File">Verified results join the Results trend table with flags, marked as imported.</Step>
          </ol>
        </div>
      </Panel>

      <Panel title="Imports for this patient" className="xl:col-span-2">
        {jobs.length === 0 ? (
          <Empty>No reports imported yet.</Empty>
        ) : (
          <ul>
            {jobs.map((j) => {
              const results = j.reports.reduce((n, r) => n + r._count.observations, 0);
              return (
                <li key={j.id} className="border-t border-line first:border-t-0">
                  <Link href={`/patients/${id}/import/${j.id}`} className="flex items-center gap-3 px-3 py-2 hover:bg-accent-soft/40">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{draftTitle(j.draft) ?? "Lab report"}</div>
                      <div className="text-[12px] text-ink-3">
                        {fmtDateTime(j.createdAt)} · {j.documents.length} {j.documents.length === 1 ? "page" : "pages"} · {j.createdBy.name}
                        {j.status === "filed" && ` · ${results} results filed`}
                      </div>
                    </div>
                    <ImportStatusChip status={j.status} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function draftTitle(draft: unknown) {
  const d = draft as { labName?: string; reportTitle?: string } | null;
  const parts = [d?.reportTitle, d?.labName].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded border border-line bg-panel-muted px-3 py-2">
      <div className="font-semibold text-ink">
        <span className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] text-white">{n}</span>
        {title}
      </div>
      <div className="mt-0.5">{children}</div>
    </li>
  );
}
