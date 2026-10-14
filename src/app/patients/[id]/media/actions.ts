"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { toLocalDate } from "@/lib/format";
import { ERROR_REASONS } from "@/components/entered-in-error";
import { runExtraction } from "@/lib/labs/jobs";
import {
  checkMediaDetails,
  MAX_MEDIA_FILES,
  MAX_MEDIA_IMAGE_BYTES,
  MAX_MEDIA_PDF_BYTES,
  MEDIA_IMAGE_TYPES,
  type MediaDetails,
} from "@/lib/media/categories";

// The day chosen, at the current time if it is today (a photo just taken), else midday.
function takenAt(day: string) {
  const now = new Date();
  if (day === toLocalDate(now)) return now;
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

const clean = (d: MediaDetails) => ({
  title: d.title.trim(),
  category: d.category,
  bodySite: d.bodySite.trim() || null,
  description: d.description.trim() || null,
  takenAt: takenAt(d.takenOn),
});

type NewItem = MediaDetails & { width: number | null; height: number | null };

// Files photos and scans to the chart's Media tab. Each file comes with its details and,
// for images, a small JPEG thumbnail made in the browser.
export async function addMedia(patientId: string, form: FormData): Promise<{ error: string } | { ids: string[] }> {
  const user = await requirePermission("addMedia");
  const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const thumbs = form.getAll("thumbs");
  let items: NewItem[];
  try {
    items = JSON.parse(String(form.get("items") ?? "[]"));
  } catch {
    return { error: "The form sent something unexpected. Reload and try again." };
  }
  if (files.length === 0) return { error: "Take a photo or choose a file first." };
  if (files.length > MAX_MEDIA_FILES) return { error: `Add at most ${MAX_MEDIA_FILES} at a time.` };
  if (items.length !== files.length) return { error: "The form sent something unexpected. Reload and try again." };
  const today = toLocalDate(new Date());
  for (const [i, f] of files.entries()) {
    if (f.type === "application/pdf") {
      if (f.size > MAX_MEDIA_PDF_BYTES) return { error: `${f.name} is larger than 20 MB.` };
    } else if (MEDIA_IMAGE_TYPES.includes(f.type)) {
      if (f.size > MAX_MEDIA_IMAGE_BYTES) return { error: `${f.name} is larger than 5 MB after resizing.` };
    } else {
      return { error: `${f.name} isn't a photo (JPEG, PNG, WebP) or a PDF.` };
    }
    const errors = checkMediaDetails(items[i], today);
    if (errors.length) return { error: `${items[i].title.trim() || f.name}: ${errors[0]}` };
  }
  const patient = await db.patient.findUnique({ where: { id: patientId }, select: { id: true } });
  if (!patient) return { error: "Patient not found." };

  const rows = await Promise.all(
    files.map(async (f, i) => {
      const t = thumbs[i];
      const thumb = t instanceof File && t.size > 0 && t.size < 300_000 && t.type === "image/jpeg" ? Buffer.from(await t.arrayBuffer()) : null;
      return {
        patientId,
        ...clean(items[i]),
        fileName: f.name.slice(0, 200),
        mimeType: f.type,
        size: f.size,
        width: items[i].width ?? null,
        height: items[i].height ?? null,
        data: Buffer.from(await f.arrayBuffer()),
        thumb,
        uploadedById: user.id,
      };
    }),
  );
  const created = await db.$transaction(rows.map((data) => db.mediaItem.create({ data, select: { id: true } })));
  revalidatePath(`/patients/${patientId}/media`);
  return { ids: created.map((c) => c.id) };
}

// Renaming, recategorizing or describing an item.
export async function updateMedia(patientId: string, mediaId: string, details: MediaDetails): Promise<{ error: string } | void> {
  const user = await requirePermission("addMedia");
  const errors = checkMediaDetails(details, toLocalDate(new Date()));
  if (errors.length) return { error: errors[0] };
  const item = await db.mediaItem.findFirst({ where: { id: mediaId, patientId } });
  if (!item) return { error: "This item is no longer in the chart." };
  // Keep the time of day it was taken when only the name or notes change.
  const sameDay = toLocalDate(item.takenAt) === details.takenOn;
  await db.mediaItem.update({
    where: { id: mediaId },
    data: { ...clean(details), takenAt: sameDay ? item.takenAt : takenAt(details.takenOn), updatedById: user.id },
  });
  revalidatePath(`/patients/${patientId}/media`);
}

// Wrong patient, duplicate, blurred: the item leaves the Media tab but stays in the database
// with who removed it, when and why (src/lib/entered-in-error.ts).
export async function markMediaInError(patientId: string, mediaId: string, form: FormData) {
  const user = await requirePermission("addMedia");
  const reason = String(form.get("reason") ?? "");
  const note = String(form.get("note") ?? "").trim();
  if (!ERROR_REASONS.includes(reason)) return;
  await db.mediaItem.update({
    where: { id: mediaId, patientId, enteredInErrorAt: null },
    data: { enteredInErrorAt: new Date(), enteredInErrorReason: (note ? `${reason}: ${note}` : reason).slice(0, 500), enteredInErrorById: user.id },
  });
  revalidatePath(`/patients/${patientId}`, "layout");
  redirect(`/patients/${patientId}/media`);
}

// A photo of a report kept in Media can also be read into the chart: it starts an
// "any report" import (src/lib/labs/jobs.ts) with a copy of the file and opens it.
export async function readMediaAsReport(patientId: string, mediaId: string) {
  const user = await requirePermission("importReports");
  const item = await db.mediaItem.findFirst({ where: { id: mediaId, patientId } });
  if (!item) return;
  const job = await db.importJob.create({
    data: {
      patientId,
      kind: "document",
      autoKind: true,
      createdById: user.id,
      documents: {
        create: [
          {
            patientId,
            kind: "clinical_document",
            fileName: item.fileName,
            mimeType: item.mimeType,
            size: item.size,
            width: item.width,
            height: item.height,
            data: item.data,
            uploadedById: user.id,
            position: 0,
          },
        ],
      },
    },
  });
  await db.mediaItem.update({ where: { id: mediaId }, data: { importJobId: job.id } });
  after(() => runExtraction(job.id));
  revalidatePath(`/patients/${patientId}`, "layout");
  redirect(`/patients/${patientId}/import/${job.id}`);
}
