import { db } from "@/lib/db";
import { requirePhonePermission } from "@/lib/phone-session";
import { logChartView } from "@/lib/audit/server";
import { sigText } from "@/lib/meds/sig";
import { relativeDays } from "@/lib/format";
import { CourseDates, StepNow } from "@/components/meds/step-now";
import { PhoneEmpty, PhoneSection } from "@/components/phone/header";

export const metadata = { title: "Medications" };

// The medication list, to read at the bedside or on a call. Prescribing stays on the full site.
export default async function PhoneMeds({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePhonePermission("viewClinical");
  await logChartView(id, "Medications (phone)");
  const [meds, patient] = await Promise.all([
    db.medicationRequest.findMany({
      where: { patientId: id, status: { in: ["active", "on_hold"] } },
      orderBy: { drug: "asc" },
      include: { prescriber: { select: { name: true } }, condition: { select: { display: true } } },
    }),
    db.patient.findUniqueOrThrow({ where: { id }, select: { medsReviewedAt: true, medsReviewedBy: { select: { name: true } } } }),
  ]);

  return (
    <>
      <p className={`px-4 pt-3 text-[13px] ${patient.medsReviewedAt ? "text-ink-3" : "text-warn"}`}>
        {patient.medsReviewedAt ? `List reviewed ${relativeDays(patient.medsReviewedAt)}${patient.medsReviewedBy ? ` by ${patient.medsReviewedBy.name}` : ""}.` : "Medication list not reviewed."}
      </p>
      <PhoneSection title={`Active medications (${meds.length})`}>
        {meds.length === 0 && <PhoneEmpty>No active medications.</PhoneEmpty>}
        {meds.map((m) => (
          <div key={m.id} className="border-b border-line px-4 py-3 last:border-b-0">
            <div className="font-semibold">
              {m.drug}
              {m.status === "on_hold" && <span className="ml-1.5 rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-warn">ON HOLD</span>}
            </div>
            <div className="text-[14px] text-ink-2">{sigText({ dose: m.dose, route: m.route, frequency: m.frequency, prn: m.prn, prnReason: m.prnReason, steps: m.steps })}</div>
            <StepNow steps={m.steps} written={m.courseStart ?? m.authoredAt} />
            <CourseDates med={m} />
            <div className="mt-0.5 text-[12.5px] text-ink-3">
              {[m.condition?.display ?? m.indication, m.prescriber ? `By ${m.prescriber.name}` : "Outside medication", m.taking === "not_taking" ? "Patient not taking" : m.taking === "taking_differently" && "Taking differently"]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
        ))}
      </PhoneSection>
    </>
  );
}
