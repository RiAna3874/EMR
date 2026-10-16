import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { age, fmtDob, fullName, sexShort } from "@/lib/format";
import { PhoneHeader } from "@/components/phone/header";
import { PhoneChartTabs } from "@/components/phone/chart-tabs";
import { RememberPatient } from "@/components/phone/patient-search";

export const dynamic = "force-dynamic";

// A chart on the phone: who the patient is, their allergies, and the sections to tap through.
export default async function PhoneChartLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const clinical = can(user.role, "viewClinical");
  const patient = await db.patient.findUnique({
    where: { id },
    include: { allergies: { orderBy: { severity: "desc" }, select: { substance: true, severity: true } } },
  });
  if (!patient) notFound();
  if (patient.mergedIntoId) redirect(`/m/patients/${patient.mergedIntoId}`);
  const detail = `${age(patient.dob)} y ${sexShort(patient.sex)} · ${fmtDob(patient.dob)} · ${patient.mrn}`;

  return (
    <>
      <PhoneHeader title={fullName(patient)} sub={detail} back="/m/patients" />
      <RememberPatient patient={{ id: patient.id, name: fullName(patient), detail }} />
      {clinical && (
        <div className={`border-b px-4 py-1.5 text-[13px] ${patient.allergies.length ? "border-crit/20 bg-crit-soft text-crit" : "border-line bg-panel-muted text-ink-2"}`}>
          {patient.allergies.length ? (
            <>
              <span className="font-semibold">Allergies: </span>
              {patient.allergies.map((a) => a.substance).join(", ")}
            </>
          ) : patient.allergyStatus === "no_known_allergies" ? (
            "No known allergies"
          ) : (
            "Allergies not reviewed"
          )}
        </div>
      )}
      <PhoneChartTabs patientId={id} clinical={clinical} />
      {children}
    </>
  );
}
