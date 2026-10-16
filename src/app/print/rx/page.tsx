import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { age, fmtDate, fmtDateOnly, fmtDateTime, fmtDob, sexShort } from "@/lib/format";
import { isControlled } from "@/lib/meds/checks";
import { numberWords, quantityCount, sigText } from "@/lib/meds/sig";
import { Letterhead, PrintFooter, PrintShell } from "@/components/print/print-shell";
import { logChartView } from "@/lib/audit/server";

export const dynamic = "force-dynamic";

// A paper prescription for a "Print" class medication. Quantities and refills
// are also written out in words, as paper prescriptions require.
export default async function PrintRx({ searchParams }: { searchParams: Promise<{ med?: string }> }) {
  const sp = await searchParams;
  const currentUser = await requirePermission("viewClinical");
  const med = sp.med ? await db.medicationRequest.findUnique({ where: { id: sp.med }, include: { patient: { include: { allergies: true } }, prescriber: true, cosigner: true } }) : null;
  if (!med || med.rxClass === "historical") notFound();
  const p = med.patient;
  await logChartView(p.id, "Prescription", "print");
  const count = quantityCount(med.quantity);

  return (
    <PrintShell back={`/patients/${p.id}/meds`}>
      <Letterhead title="Prescription" right={<>Written {fmtDateTime(med.authoredAt)}</>} />
      <section className="mt-3 grid grid-cols-2 gap-x-6 border-b border-black pb-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="font-semibold">Patient</dt>
          <dd className="font-bold">
            {p.lastName.toUpperCase()}, {p.firstName}
          </dd>
          <dt className="font-semibold">DOB</dt>
          <dd>
            {fmtDob(p.dob)} ({age(p.dob)} y) · Sex {sexShort(p.sex)}
          </dd>
          <dt className="font-semibold">MRN</dt>
          <dd className="font-mono">{p.mrn}</dd>
        </dl>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="font-semibold">Address</dt>
          <dd>{p.address}</dd>
          <dt className="font-semibold">Phone</dt>
          <dd>{p.phone}</dd>
          <dt className="font-semibold">Allergies</dt>
          <dd>{p.allergies.length ? p.allergies.map((a) => a.substance).join(", ") : p.allergyStatus === "no_known_allergies" ? "No known allergies" : "Not reviewed"}</dd>
        </dl>
      </section>

      <section className="mt-5 flex gap-4">
        <div className="font-serif text-[40px] font-bold leading-none">℞</div>
        <div className="flex-1 space-y-2 text-[13px]">
          <div className="text-[16px] font-bold">
            {med.drug}
            {isControlled(med.drug) && <span className="ml-2 rounded border border-black px-1 text-[11px]">Controlled drug</span>}
          </div>
          <div>
            <span className="font-semibold">Sig: </span>
            {sigText({ dose: med.dose, route: med.route, frequency: med.frequency, prn: med.prn, prnReason: med.prnReason, steps: med.steps })}
          </div>
          {med.patientInstructions && <div>{med.patientInstructions}</div>}
          {(med.courseStart || med.end) && (
            <div>
              {med.courseStart && (
                <>
                  <span className="font-semibold">Start: </span>
                  {fmtDateOnly(med.courseStart)}
                  {med.end && " · "}
                </>
              )}
              {med.end && (
                <>
                  <span className="font-semibold">End: </span>
                  {fmtDateOnly(med.end)}
                </>
              )}
            </div>
          )}
          <div>
            <span className="font-semibold">Dispense: </span>
            {med.quantity}
            {count !== null && ` (${numberWords(count)})`}
            {med.daysSupply && `, ${med.daysSupply}-day supply`}
          </div>
          <div>
            <span className="font-semibold">Refills: </span>
            {med.refills} ({numberWords(med.refills)})
          </div>
          <div>
            <span className="font-semibold">Substitution: </span>
            {med.daw ? "Dispense as written. No substitution." : "Generic substitution permitted."}
          </div>
          {med.indication && (
            <div>
              <span className="font-semibold">Indication: </span>
              {med.indication}
            </div>
          )}
          {med.end && <div>Use through {fmtDateOnly(med.end)}.</div>}
        </div>
      </section>

      <section className="mt-10 grid grid-cols-2 gap-6 break-inside-avoid">
        <div>
          <div className="mt-8 w-72 border-t border-black text-[10.5px]">Prescriber signature</div>
          <div className="mt-1 font-semibold">
            {med.prescriber?.name}
            {med.prescriber?.credentials && `, ${med.prescriber.credentials}`}
          </div>
          {med.prescriber?.registrationNumber && <div className="text-[11px]">Reg. no. {med.prescriber.registrationNumber}</div>}
          {med.cosigner && (
            <div className="text-[11px]">
              Supervising physician: {med.cosigner.name}, {med.cosigner.credentials}
              {med.cosigner.registrationNumber && ` (reg. no. ${med.cosigner.registrationNumber})`}
            </div>
          )}
        </div>
        <div className="text-[11px]">
          <div>Date written: {fmtDate(med.authoredAt)}</div>
        </div>
      </section>

      <PrintFooter>
        <div>Printed by {currentUser.name}{currentUser.credentials ? `, ${currentUser.credentials}` : ""}. Not valid without a signature.</div>
      </PrintFooter>
    </PrintShell>
  );
}
