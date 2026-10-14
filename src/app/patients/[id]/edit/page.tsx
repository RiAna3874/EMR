import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { logChartView } from "@/lib/audit/server";
import { fmtDob, fullName } from "@/lib/format";
import { RegisterForm } from "../../new/register-form";
import { mergeDuplicate } from "./merge-actions";

export const dynamic = "force-dynamic";

// Correcting a patient's registration: name, date of birth, sex, contacts, PCP and coverage.
// The address is edited as one line, the way it's stored.
export default async function EditPatient({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ merge?: string; mergeError?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("registerPatients");
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
        {user.isAdmin && <MergePanel keeper={p} mrn={sp.merge?.trim() ?? ""} error={sp.mergeError} />}
      </div>
    </main>
  );
}

const MOVED_LABELS = [
  ["encounters", "visit", "visits"],
  ["notes", "note", "notes"],
  ["observations", "result or vital sign", "results and vital signs"],
  ["reports", "lab report", "lab reports"],
  ["orders", "order", "orders"],
  ["medications", "medication", "medications"],
  ["allergies", "allergy", "allergies"],
  ["conditions", "problem", "problems"],
  ["clinicalDocs", "document", "documents"],
] as const;

// Admins fold a duplicate chart into this one. Everything on the duplicate moves here;
// this chart's name, date of birth, sex and MRN stay, and its blank contact details are filled in.
async function MergePanel({ keeper, mrn, error }: { keeper: { id: string; mrn: string }; mrn: string; error?: string }) {
  const dup = mrn
    ? await db.patient.findFirst({
        where: { mrn: { equals: mrn, mode: "insensitive" }, id: { not: keeper.id } },
        include: { _count: { select: Object.fromEntries(MOVED_LABELS.map(([k]) => [k, true])) as Record<(typeof MOVED_LABELS)[number][0], true> } },
      })
    : null;
  return (
    <section id="merge" className="mt-8 max-w-3xl rounded border border-line p-4">
      <h2 className="font-semibold">Merge a duplicate chart into this one</h2>
      <p className="mt-1 text-ink-3">
        For a patient registered twice. Everything on the duplicate moves to {keeper.mrn}, and the duplicate disappears from lists and search.
        This can&apos;t be undone from the app.
      </p>
      <form className="mt-3 flex items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-ink-3">MRN of the duplicate chart</span>
          <input name="merge" defaultValue={mrn} className="rounded border border-line px-2 py-1 font-mono" />
        </label>
        <button className="rounded border border-line px-3 py-1">Look up</button>
      </form>
      {error && <p className="mt-2 text-crit">{error}</p>}
      {mrn && !dup && <p className="mt-2 text-crit">No other chart has MRN {mrn}.</p>}
      {dup && (
        <form action={mergeDuplicate.bind(null, keeper.id)} className="mt-3 rounded bg-panel-muted p-3">
          <input type="hidden" name="duplicateId" value={dup.id} />
          <p>
            <span className="font-semibold">{fullName(dup)}</span> · {fmtDob(dup.dob)} · {dup.sex} · <span className="font-mono">{dup.mrn}</span>
            {dup.phone ? ` · ${dup.phone}` : ""}
          </p>
          <p className="mt-1 text-ink-3">
            Moves: {MOVED_LABELS.map(([k, one, many]) => `${dup._count[k]} ${dup._count[k] === 1 ? one : many}`).join(", ")}. Check the allergy and problem lists afterwards for entries
            that now appear twice.
          </p>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" name="confirm" value="yes" />
            I&apos;ve checked these two charts are the same person.
          </label>
          <button className="mt-2 rounded bg-crit px-3 py-1 text-white">Merge {dup.mrn} into {keeper.mrn}</button>
        </form>
      )}
    </section>
  );
}
