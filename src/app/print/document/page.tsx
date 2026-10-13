import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { age, fmtDateTime, fmtDob, sexShort } from "@/lib/format";
import { docTypeLabel } from "@/lib/documents/draft";
import { filedDocInclude, toFiledDoc } from "@/lib/documents/server";
import { DocView } from "@/components/documents/doc-view";
import { Letterhead, PrintFooter, PrintShell } from "@/components/print/print-shell";
import { logChartView } from "@/lib/audit/server";

export const dynamic = "force-dynamic";

// A filed outside document in our own layout, with where it came from.
export default async function PrintDocument({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  await requirePermission("viewClinical");
  const raw = id ? await db.clinicalDocument.findUnique({ where: { id }, include: { ...filedDocInclude, patient: true } }) : null;
  if (!raw) notFound();
  const doc = toFiledDoc(raw);
  const p = raw.patient;
  await logChartView(p.id, "Outside document", "print");

  return (
    <PrintShell back={`/patients/${p.id}/documents?doc=${doc.id}`}>
      <Letterhead title={`Outside record · ${docTypeLabel[doc.type]}`} right={<>Printed {fmtDateTime(new Date())}</>} />
      <section className="mt-3 border-b border-black pb-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="font-semibold">Patient</dt>
          <dd className="font-bold">
            {p.lastName.toUpperCase()}, {p.firstName}
          </dd>
          <dt className="font-semibold">DOB</dt>
          <dd>
            {fmtDob(p.dob)} ({age(p.dob)} y) · Sex {sexShort(p.sex)} · MRN <span className="font-mono">{p.mrn}</span>
          </dd>
        </dl>
      </section>
      <div className="mt-4 text-[12px]">
        <DocView doc={doc} patientId={p.id} print />
      </div>
      <PrintFooter>This is a transcription of an outside record for reference. The original pages are kept in the chart.</PrintFooter>
    </PrintShell>
  );
}
