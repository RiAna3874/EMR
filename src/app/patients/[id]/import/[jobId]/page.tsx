import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { fmtDateTime, toUrlDate } from "@/lib/format";
import { DraftSchema, emptyDraft } from "@/lib/labs/draft";
import { labHistory, STALE_EXTRACTION_MS } from "@/lib/labs/jobs";
import { analyteByLoinc } from "@/lib/labs/catalog";
import { ReviewEditor } from "@/components/import/review-editor";
import { ImportStatusChip } from "@/components/import/status-chip";
import { RefreshWhile } from "@/components/import/refresh-while";
import { JobActions } from "@/components/import/job-actions";

export default async function ImportJobPage({ params }: { params: Promise<{ id: string; jobId: string }> }) {
  const { id, jobId } = await params;
  const job = await db.importJob.findUnique({
    where: { id: jobId, patientId: id },
    include: {
      patient: true,
      createdBy: true,
      filedBy: true,
      documents: { select: { id: true, mimeType: true, fileName: true, width: true, height: true }, orderBy: { position: "asc" } },
      reports: { select: { id: true, display: true }, orderBy: { display: "asc" } },
    },
  });
  if (!job) notFound();

  const docs = job.documents.map((d) => ({ ...d, url: `/documents/${d.id}` }));
  const stale = job.status === "extracting" && Date.now() - job.updatedAt.getTime() > STALE_EXTRACTION_MS;
  const header = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-panel px-4 py-2">
      <Link href={`/patients/${id}/import`} className="text-ink-3 hover:text-accent">
        ← Imports
      </Link>
      <h1 className="text-base font-semibold">Imported lab report</h1>
      <ImportStatusChip status={job.status} />
      <span className="text-[12px] text-ink-3">
        Uploaded {fmtDateTime(job.createdAt)} by {job.createdBy.name}
        {job.model && job.model !== "fixture" && ` · read by ${job.model}`}
        {job.filedAt && job.filedBy && ` · verified and filed ${fmtDateTime(job.filedAt)} by ${job.filedBy.name}`}
      </span>
    </div>
  );

  if (job.status === "extracting" || job.status === "failed") {
    return (
      <div className="flex h-full flex-col">
        {header}
        <div className="mx-auto mt-10 w-full max-w-lg rounded-md border border-line bg-panel p-6 text-center">
          {job.status === "extracting" && !stale ? (
            <>
              <RefreshWhile active intervalMs={2500} />
              <Spinner />
              <h2 className="mt-3 font-semibold">Reading the report…</h2>
              <p className="mt-1 text-ink-2">
                Claude is transcribing every test on {docs.length === 1 ? "the page" : `all ${docs.length} pages`}. This usually takes under a minute.
              </p>
            </>
          ) : (
            <>
              <h2 className="font-semibold text-crit">{stale ? "Reading stopped before it finished." : "Couldn't read this report."}</h2>
              {job.error && <p className="mt-1 text-ink-2">{job.error}</p>}
              <p className="mt-3 text-[12px] text-ink-3">Try again, or type the results in yourself next to the image.</p>
            </>
          )}
          <JobActions patientId={id} jobId={jobId} canRetry={job.status === "failed" || stale} />
        </div>
      </div>
    );
  }

  if (job.status === "discarded") {
    return (
      <div className="flex h-full flex-col">
        {header}
        <p className="p-6 text-ink-2">This import was discarded. Nothing from it was filed.</p>
      </div>
    );
  }

  const parsed = DraftSchema.safeParse(job.draft);
  const draft = parsed.success ? parsed.data : emptyDraft();
  const codes = [...new Set([...draft.rows.flatMap((r) => (r.loinc ? [r.loinc] : [])), ...analyteByLoinc.keys()])];
  const history = job.status === "needs_review" ? await labHistory(id, codes) : {};
  const p = job.patient;

  return (
    <div className="flex h-full flex-col">
      {header}
      {job.status === "filed" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-accent-soft px-4 py-2 text-[12.5px]">
          <span className="font-medium">Filed to the chart as:</span>
          {job.reports.map((r) => (
            <Link key={r.id} href={`/patients/${id}/results?view=reports&report=${r.id}`} className="rounded border border-accent/30 bg-panel px-2 py-0.5 hover:text-accent">
              {r.display}
            </Link>
          ))}
        </div>
      )}
      <ReviewEditor
        patientId={id}
        jobId={jobId}
        readOnly={job.status === "filed"}
        initialDraft={draft}
        docs={docs}
        patient={{ firstName: p.firstName, lastName: p.lastName, dob: toUrlDate(p.dob), sex: p.sex, mrn: p.mrn }}
        history={history}
      />
    </div>
  );
}

function Spinner() {
  return <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-accent/20 border-t-accent" aria-hidden />;
}
