"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { toUrlDate } from "@/lib/format";
import { assessDraft, blankRow, DraftSchema, emptyDraft, panelFor } from "@/lib/labs/draft";
import { labHistory, runExtraction } from "@/lib/labs/jobs";
import { completeLabOrder } from "@/lib/orders/server";
import { emptyDocDraft } from "@/lib/documents/draft";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Claude's per-image limit
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 10;

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function uploadReport(patientId: string, form: FormData): Promise<{ error: string } | void> {
  const currentUser = await requirePermission("importReports");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const sizes: { width: number | null; height: number | null }[] = JSON.parse(String(form.get("sizes") ?? "[]"));
  const choice = String(form.get("kind") ?? "auto");
  // "Any report": Claude sorts it first (src/lib/labs/jobs.ts); stored as a document until then.
  const autoKind = choice !== "lab" && choice !== "document";
  const kind = choice === "lab" ? "lab" : "document";
  if (files.length === 0) return { error: "Choose a photo or PDF of the report." };
  if (files.length > MAX_FILES) return { error: `Upload at most ${MAX_FILES} pages at a time.` };
  for (const f of files) {
    if (f.type === "application/pdf") {
      if (f.size > MAX_PDF_BYTES) return { error: `${f.name} is larger than 25 MB.` };
    } else if (IMAGE_TYPES.includes(f.type)) {
      if (f.size > MAX_IMAGE_BYTES) return { error: `${f.name} is larger than 5 MB after resizing.` };
    } else {
      return { error: `${f.name} isn't a JPEG, PNG, WebP, GIF or PDF.` };
    }
  }
  const patient = await db.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) return { error: "Patient not found." };

  const datas = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
  const job = await db.importJob.create({
    data: {
      patientId,
      kind,
      autoKind,
      createdById: currentUser.id,
      documents: {
        create: files.map((f, i) => ({
          patientId,
          kind: kind === "document" ? "clinical_document" : "lab_report",
          fileName: f.name.slice(0, 200),
          mimeType: f.type,
          size: f.size,
          width: sizes[i]?.width ?? null,
          height: sizes[i]?.height ?? null,
          data: datas[i],
          uploadedById: currentUser.id,
          position: i,
        })),
      },
    },
  });

  // Reading a report takes a while; the review page polls until it's ready.
  after(() => runExtraction(job.id));
  revalidatePath(`/patients/${patientId}`, "layout");
  // From the phone view: back to the chart there; the report is verified on a computer.
  if (form.get("from") === "phone") redirect(`/m/patients/${patientId}?imported=1`);
  redirect(`/patients/${patientId}/import/${job.id}`);
}

export async function retryExtraction(patientId: string, jobId: string) {
  await requirePermission("importReports");
  await db.importJob.update({
    where: { id: jobId, patientId, status: { in: ["failed", "extracting"] } },
    data: { status: "extracting", error: null },
  });
  after(() => runExtraction(jobId));
  revalidatePath(`/patients/${patientId}/import`, "layout");
}

export async function enterManually(patientId: string, jobId: string) {
  await requirePermission("importReports");
  const job = await db.importJob.findUniqueOrThrow({ where: { id: jobId, patientId }, select: { kind: true } });
  await db.importJob.update({
    where: { id: jobId, patientId, status: { in: ["failed", "extracting"] } },
    data: { status: "needs_review", error: null, model: null, draft: json(job.kind === "document" ? emptyDocDraft() : { ...emptyDraft(), rows: [blankRow("m1")] }) },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
}

export async function saveDraft(patientId: string, jobId: string, draftJson: string) {
  await requirePermission("importReports");
  const draft = DraftSchema.parse(JSON.parse(draftJson));
  await db.importJob.update({ where: { id: jobId, patientId, status: "needs_review", kind: "lab" }, data: { draft: json(draft) } });
}

// Reads the same pages again as the other kind, e.g. a "document" that turned out
// to be a table of lab results. Any review work on the current draft is dropped.
export async function rereadAs(patientId: string, jobId: string, kind: "lab" | "document") {
  await requirePermission("importReports");
  await db.importJob.update({
    where: { id: jobId, patientId, status: { in: ["needs_review", "failed"] } },
    data: { kind, autoKind: false, status: "extracting", error: null, draft: Prisma.DbNull, extraction: Prisma.DbNull, model: null },
  });
  await db.documentReference.updateMany({ where: { importJobId: jobId }, data: { kind: kind === "document" ? "clinical_document" : "lab_report" } });
  after(() => runExtraction(jobId));
  revalidatePath(`/patients/${patientId}`, "layout");
}

export async function discardImport(patientId: string, jobId: string) {
  await requirePermission("importReports");
  await db.importJob.update({
    where: { id: jobId, patientId, status: { in: ["needs_review", "failed", "extracting"] } },
    data: { status: "discarded" },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
  redirect(`/patients/${patientId}/import`);
}

// Files the verified draft: one DiagnosticReport per panel, one Observation per
// included row. Every check from the review screen is re-run here first.
export async function fileImport(patientId: string, jobId: string, draftJson: string): Promise<{ errors: string[] } | void> {
  const currentUser = await requirePermission("fileImports");
  const parsed = DraftSchema.safeParse(JSON.parse(draftJson));
  if (!parsed.success) return { errors: ["The review form sent something unexpected. Reload and try again."] };
  const draft = parsed.data;

  const [job, patient] = await Promise.all([
    db.importJob.findUnique({ where: { id: jobId, patientId }, include: { documents: { select: { id: true }, orderBy: { position: "asc" } } } }),
    db.patient.findUnique({ where: { id: patientId } }),
  ]);
  if (!job || !patient) return { errors: ["Import not found."] };
  if (job.status !== "needs_review") return { errors: ["This import has already been filed or discarded."] };
  if (job.kind !== "lab") return { errors: ["This import is being read as a document, not lab results. Reload the page."] };

  const history = await labHistory(patientId, draft.rows.flatMap((r) => (r.loinc ? [r.loinc] : [])));
  const facts = { firstName: patient.firstName, lastName: patient.lastName, dob: toUrlDate(patient.dob), sex: patient.sex, mrn: patient.mrn };
  const { rows, blockers } = assessDraft(draft, facts, history);
  if (blockers.length) return { errors: blockers };

  const collected = new Date(`${draft.collectedDate}T${draft.collectedTime || "00:00"}:00`);
  const issued = draft.reportedDate ? new Date(`${draft.reportedDate}T${draft.reportedTime || "00:00"}:00`) : collected;
  const performer = draft.labName.trim() || "Outside laboratory";
  const now = new Date();

  const groups = new Map<string, { code: string; display: string; obs: Prisma.ObservationCreateManyReportInput[] }>();
  draft.rows.forEach((row) => {
    if (!row.include) return;
    const a = rows.get(row.id)!;
    const panel = panelFor(row, a);
    const g = groups.get(panel.code) ?? { ...panel, obs: [] };
    g.obs.push({
      patientId,
      category: "laboratory",
      code: a.code,
      display: row.display.trim(),
      valueNum: a.valueNum,
      valueText: a.valueText,
      unit: a.unit,
      refLow: a.refLow,
      refHigh: a.refHigh,
      refText: a.refText,
      flag: a.flag,
      effectiveAt: collected,
      sortOrder: g.obs.length,
    });
    groups.set(panel.code, g);
  });

  const reportIds = await db.$transaction(async (tx) => {
    const claimed = await tx.importJob.updateMany({
      where: { id: jobId, status: "needs_review" },
      data: { status: "filed", draft: json(draft), filedAt: now, filedById: currentUser.id },
    });
    if (claimed.count !== 1) throw new Error("Import was filed or discarded by someone else.");
    const ids: string[] = [];
    for (const g of groups.values()) {
      const report = await tx.diagnosticReport.create({
        data: {
          patientId,
          code: g.code,
          display: g.display,
          performer,
          effectiveAt: collected,
          issuedAt: issued,
          status: "final",
          source: "imported",
          verifiedAt: now,
          verifiedById: currentUser.id,
          importJobId: jobId,
          // The PCP still sees imported results in their Inbox unless they verified them.
          reviewedAt: patient.pcpId === currentUser.id ? now : null,
          reviewedById: patient.pcpId === currentUser.id ? currentUser.id : null,
          observations: { createMany: { data: g.obs } },
        },
      });
      await completeLabOrder(tx, report, g.obs.map((o) => o.code));
      ids.push(report.id);
    }
    return ids;
  });

  revalidatePath("/", "layout");
  redirect(`/patients/${patientId}/results?view=reports&report=${reportIds[0]}`);
}
