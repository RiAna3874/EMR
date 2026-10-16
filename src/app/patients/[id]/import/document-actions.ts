"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { fmtDate, toUrlDate } from "@/lib/format";
import { productFor } from "@/lib/meds/formulary";
import { assessDocDraft, docContent, DocDraftSchema, docTypeLabel } from "@/lib/documents/draft";
import { chartFacts } from "@/lib/documents/server";
import { checkIcd10 } from "@/lib/icd10/codes";
import { ICD10_SHAPE, icd10Problem, normalizeIcd10 } from "@/lib/icd10/format";

const json = (v: unknown) => v as Prisma.InputJsonValue;

export async function saveDocDraft(patientId: string, jobId: string, draftJson: string) {
  await requirePermission("importReports");
  const draft = DocDraftSchema.parse(JSON.parse(draftJson));
  await db.importJob.update({ where: { id: jobId, patientId, status: "needs_review", kind: "document" }, data: { draft: json(draft) } });
}

// Files the verified document. Every check from the review screen is re-run here
// first. Diagnoses and medications the reviewer ticked are added to the problem
// list and (as outside medications) the medication list; a linked imaging or
// referral order is completed.
export async function fileDocument(patientId: string, jobId: string, draftJson: string): Promise<{ errors: string[] } | void> {
  const currentUser = await requirePermission("fileImports");
  const parsed = DocDraftSchema.safeParse(JSON.parse(draftJson));
  if (!parsed.success) return { errors: ["The review form sent something unexpected. Reload and try again."] };
  const draft = parsed.data;

  const [job, patient, chart] = await Promise.all([
    db.importJob.findUnique({ where: { id: jobId, patientId } }),
    db.patient.findUnique({ where: { id: patientId } }),
    chartFacts(patientId),
  ]);
  if (!job || !patient) return { errors: ["Import not found."] };
  if (job.status !== "needs_review") return { errors: ["This import has already been filed or discarded."] };
  if (job.kind !== "document") return { errors: ["This import is being read as lab results. Reload the page."] };

  const facts = { firstName: patient.firstName, lastName: patient.lastName, dob: toUrlDate(patient.dob), sex: patient.sex, mrn: patient.mrn };
  const { blockers } = assessDocDraft(draft, facts, chart);
  const problems = draft.diagnoses.filter((d) => d.addToProblems);
  const meds = draft.meds.filter((m) => m.addToList);
  // Problems get complete ICD-10-CM codes only.
  for (const d of problems) {
    if (!ICD10_SHAPE.test(normalizeIcd10(d.icd10))) continue; // blank, or already a blocker
    const check = checkIcd10(d.icd10);
    const problem = icd10Problem(check);
    if (problem) blockers.push(`${problem} (${d.text})`);
    else d.icd10 = check.code;
  }
  if (problems.length && !can(currentUser.role, "editProblems")) blockers.push("Your role can't add to the problem list.");
  if (meds.length && !can(currentUser.role, "reviewMeds")) blockers.push("Your role can't add to the medication list.");
  if (blockers.length) return { errors: blockers };

  const serviceDate = new Date(`${draft.serviceDate}T00:00:00Z`);
  const title = draft.title.trim();
  const named = title.toLowerCase() === docTypeLabel[draft.type].toLowerCase() ? title : `${docTypeLabel[draft.type].toLowerCase()} ${title}`;
  const source = [named, draft.organization.trim(), fmtDate(new Date(`${draft.serviceDate}T12:00:00`))].filter(Boolean).join(", ");
  const order = draft.orderId ? chart.orders.find((o) => o.id === draft.orderId) : null;
  const orderedBy = order ? (await db.serviceRequest.findUnique({ where: { id: order.id }, select: { orderedById: true } }))?.orderedById : null;
  // The PCP (or the clinician who ordered it) still sees the document in their Inbox unless they filed it.
  const responsible = orderedBy ?? patient.pcpId;
  const now = new Date();

  const docId = await db.$transaction(async (tx) => {
    const claimed = await tx.importJob.updateMany({
      where: { id: jobId, status: "needs_review" },
      data: { status: "filed", draft: json(draft), filedAt: now, filedById: currentUser.id },
    });
    if (claimed.count !== 1) throw new Error("Import was filed or discarded by someone else.");

    if (problems.length) {
      const max = await tx.condition.aggregate({ where: { patientId, status: "active" }, _max: { priority: true } });
      let priority = max._max.priority ?? 0;
      for (const d of problems) {
        await tx.condition.create({
          data: {
            patientId,
            code: d.icd10.trim().toUpperCase() || "R69",
            display: d.text.trim(),
            status: "active",
            onset: serviceDate,
            priority: ++priority,
            comment: `From ${source}`,
          },
        });
      }
    }
    for (const m of meds) {
      const product = productFor({ drug: m.drug.trim() });
      await tx.medicationRequest.create({
        data: {
          patientId,
          drug: product?.display ?? m.drug.trim(),
          rxnorm: product?.rxnorm ?? null,
          dose: m.dose.trim() || product?.dose || "",
          route: m.route.trim() || product?.route || "oral",
          frequency: m.frequency.trim() || product?.frequency || "",
          status: "active",
          start: serviceDate,
          rxClass: "historical",
          pharmacyNote: `Per ${source}`,
        },
      });
    }
    if (order) {
      const done = await tx.serviceRequest.updateMany({ where: { id: order.id, patientId, status: "signed" }, data: { status: "completed", completedAt: now } });
      if (done.count !== 1) throw new Error("The linked order was completed or discontinued by someone else.");
    }
    const doc = await tx.clinicalDocument.create({
      data: {
        patientId,
        type: draft.type,
        title: draft.title.trim(),
        organization: draft.organization.trim() || null,
        author: draft.author.trim() || null,
        serviceDate,
        content: json(docContent(draft)),
        importJobId: jobId,
        orderId: order?.id ?? null,
        filedById: currentUser.id,
        filedAt: now,
        reviewedAt: responsible === currentUser.id ? now : null,
        reviewedById: responsible === currentUser.id ? currentUser.id : null,
      },
    });
    await tx.documentReference.updateMany({ where: { importJobId: jobId }, data: { kind: draft.type } });
    return doc.id;
  });

  revalidatePath("/", "layout");
  redirect(`/patients/${patientId}/documents?doc=${docId}`);
}

export async function acknowledgeDocument(docId: string, next: string, form: FormData) {
  const currentUser = await requirePermission("reviewResults");
  const comment = String(form.get("comment") ?? "").trim();
  await db.clinicalDocument.update({
    where: { id: docId, reviewedAt: null },
    data: { reviewedAt: new Date(), reviewedById: currentUser.id, reviewComment: comment || null },
  });
  revalidatePath("/", "layout");
  redirect(next);
}
