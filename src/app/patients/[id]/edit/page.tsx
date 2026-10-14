import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { logChartView } from "@/lib/audit/server";
import { RegisterForm } from "../../new/register-form";

export const dynamic = "force-dynamic";

// Correcting a patient's registration: name, date of birth, sex, contacts, PCP and coverage.
// The address is edited as one line, the way it's stored.
export default async function EditPatient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requirePermission("registerPatients");
  const [p, pcps, pharmacies] = await Promise.all([
    db.patient.findUniqueOrThrow({ where: { id } }),
    db.practitioner.findMany({ where: { role: "physician", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, credentials: true } }),
    db.pharmacy.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, address: true } }),
  ]);
  await logChartView(id, "Patient details");
  const initial: Record<string, string> = {
    firstName: p.firstName,
    middleName: p.middleName ?? "",
    lastName: p.lastName,
    preferredName: p.preferredName ?? "",
    dob: p.dob.toISOString().slice(0, 10),
    sex: p.sex,
    phone: p.phone ?? "",
    email: p.email ?? "",
    street: p.address ?? "",
    preferredLanguage: p.preferredLanguage,
    emergencyContactName: p.emergencyContactName ?? "",
    emergencyContactRelation: p.emergencyContactRelation ?? "",
    emergencyContactPhone: p.emergencyContactPhone ?? "",
    pcpId: p.pcpId ?? "",
    preferredPharmacyId: p.preferredPharmacyId ?? "",
    insurancePayer: p.insurancePayer ?? "",
    insuranceMemberId: p.insuranceMemberId ?? "",
    insuranceGroup: p.insuranceGroup ?? "",
    subscriberName: p.subscriberName ?? "",
    subscriberRelation: p.subscriberRelation ?? "",
  };

  return (
    <main className="h-full overflow-y-auto">
      <div className="p-5">
        <div className="mb-3 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Edit patient details</h1>
          <span className="font-mono text-ink-3">{p.mrn}</span>
          <Link href={`/patients/${id}`} className="text-ink-3 hover:text-accent">
            Back to chart
          </Link>
        </div>
        <RegisterForm
          patientId={id}
          initial={initial}
          pcps={pcps.map((x) => ({ id: x.id, label: x.credentials ? `${x.name}, ${x.credentials}` : x.name }))}
          pharmacies={pharmacies.map((x) => ({ id: x.id, label: `${x.name} · ${x.address}` }))}
        />
      </div>
    </main>
  );
}
