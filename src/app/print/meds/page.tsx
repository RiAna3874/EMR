import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { age, fmtDate, fmtDateOnly, fmtDateTime, fmtDob } from "@/lib/format";
import { sigText, unitsHint } from "@/lib/meds/sig";
import { productFor } from "@/lib/meds/formulary";
import { Letterhead, PrintFooter, PrintShell } from "@/components/print/print-shell";
import { logChartView } from "@/lib/audit/server";

export const dynamic = "force-dynamic";

// The patient's own copy of their medication list, in plain words.
export default async function PrintMeds({ searchParams }: { searchParams: Promise<{ patient?: string }> }) {
  const sp = await searchParams;
  const currentUser = await requirePermission("viewClinical");
  const patient = sp.patient
    ? await db.patient.findUnique({ where: { id: sp.patient }, include: { allergies: true, pcp: true, preferredPharmacy: true, medsReviewedBy: true } })
    : null;
  if (!patient) notFound();
  await logChartView(patient.id, "Medication list", "print");
  const meds = await db.medicationRequest.findMany({
    where: { patientId: patient.id, status: { in: ["active", "on_hold"] } },
    orderBy: { drug: "asc" },
    include: { prescriber: true },
  });
  const stopped = await db.medicationRequest.findMany({
    where: { patientId: patient.id, status: "discontinued", end: { gte: new Date(Date.now() - 90 * 86_400_000) } },
    orderBy: { end: "desc" },
  });

  return (
    <PrintShell back={`/patients/${patient.id}/meds`}>
      <Letterhead title="Your medications" right={<>Printed {fmtDateTime(new Date())}</>} />
      <section className="mt-3 border-b border-black pb-2">
        <div className="text-[14px] font-bold">
          {patient.firstName} {patient.lastName}
        </div>
        <div>
          Born {fmtDob(patient.dob)} ({age(patient.dob)} y) · MRN <span className="font-mono">{patient.mrn}</span>
        </div>
        <div>Allergies: {patient.allergies.length ? patient.allergies.map((a) => `${a.substance} (${a.reaction ?? "reaction"})`).join(", ") : patient.allergyStatus === "no_known_allergies" ? "No known allergies" : "Not reviewed"}</div>
        {patient.preferredPharmacy && <div>Pharmacy: {patient.preferredPharmacy.name}, {patient.preferredPharmacy.phone}</div>}
      </section>

      <h2 className="mt-4 border-b border-black pb-0.5 text-[13px] font-bold">Take these medications</h2>
      <table className="w-full">
        <thead>
          <tr className="text-left text-[10.5px] uppercase tracking-wide">
            <th className="py-1 pr-2 font-semibold">Medication</th>
            <th className="py-1 pr-2 font-semibold">How to take it</th>
            <th className="py-1 pr-2 font-semibold">What it&apos;s for</th>
            <th className="py-1 font-semibold">Prescribed by</th>
          </tr>
        </thead>
        <tbody>
          {meds.map((m) => (
            <tr key={m.id} className="border-t border-black/15 align-top">
              <td className="py-1 pr-2 font-semibold">
                {m.drug}
                {m.status === "on_hold" && <div className="text-[11px] font-bold">ON HOLD: don&apos;t take until your clinician says to restart</div>}
              </td>
              <td className="py-1 pr-2">
                {sigText({ dose: m.dose, route: m.route, frequency: m.frequency, prn: m.prn, prnReason: m.prnReason, steps: m.steps })}
                {unitsHint(m.dose, productFor(m)) && <span> ({unitsHint(m.dose, productFor(m))} each time)</span>}
                {m.patientInstructions && <div className="text-[11px]">{m.patientInstructions}</div>}
              </td>
              <td className="py-1 pr-2">{m.indication ?? ""}</td>
              <td className="py-1">{m.rxClass === "historical" ? (m.pharmacyNote ?? "Outside / over the counter") : m.prescriber?.name}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {stopped.length > 0 && (
        <>
          <h2 className="mt-4 border-b border-black pb-0.5 text-[13px] font-bold">Stop taking these</h2>
          <ul className="mt-1 list-disc pl-5">
            {stopped.map((m) => (
              <li key={m.id}>
                <span className="font-semibold">{m.drug}</span> (stopped {fmtDateOnly(m.end)}
                {m.endReason ? `: ${m.endReason.toLowerCase()}` : ""})
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="mt-4">Bring this list to every visit and show it to your pharmacist. Tell us if you start or stop any medicine, vitamin or supplement.</p>

      <PrintFooter>
        <div>
          {patient.medsReviewedAt && patient.medsReviewedBy ? `Medication list reviewed ${fmtDate(patient.medsReviewedAt)} by ${patient.medsReviewedBy.name}. ` : ""}
          Printed by {currentUser.name}.
        </div>
      </PrintFooter>
    </PrintShell>
  );
}
