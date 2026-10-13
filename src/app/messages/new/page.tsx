import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { staffDirectory } from "@/lib/chat/server";
import { startOfDay } from "@/lib/scheduling/server";
import { DISCLAIMER } from "@/lib/chat/chat";
import { age, fmtDob, fullName, sexShort } from "@/lib/format";
import { NewMessageForm, type Staff } from "@/components/chat/new-message-form";

export const dynamic = "force-dynamic";

// /messages/new?patient=…&to=… : starting from a chart pre-fills the patient and
// suggests their care team (PCP and today's visit provider).
export default async function NewMessage({ searchParams }: { searchParams: Promise<{ patient?: string; to?: string | string[] }> }) {
  const sp = await searchParams;
  const user = await requirePermission("useChat");
  const [everyone, patient] = await Promise.all([
    staffDirectory(),
    sp.patient
      ? db.patient.findUnique({
          where: { id: sp.patient },
          include: { encounters: { where: { start: { gte: startOfDay(new Date()) } }, orderBy: { start: "asc" }, take: 1, select: { providerId: true } } },
        })
      : null,
  ]);
  const careTeam = new Map<string, string>();
  if (patient?.pcpId) careTeam.set(patient.pcpId, "Patient's PCP");
  const visitProvider = patient?.encounters[0]?.providerId;
  if (visitProvider && !careTeam.has(visitProvider)) careTeam.set(visitProvider, "Seeing the patient next");

  const staff: Staff[] = everyone
    .filter((s) => s.id !== user.id)
    .map((s) => ({ ...s, hint: careTeam.get(s.id) }))
    // Care team first, then everyone else alphabetically.
    .sort((a, b) => Number(!!b.hint) - Number(!!a.hint));
  const ids = new Set(staff.map((s) => s.id));
  const to = [sp.to ?? []].flat().filter((id) => ids.has(id));

  return (
    <>
      <header className="border-b border-line bg-panel px-5 py-3">
        <h2 className="text-[15px] font-semibold">New message</h2>
        <p className="text-[12px] text-ink-3">{DISCLAIMER}</p>
      </header>
      <NewMessageForm
        staff={staff}
        selected={to}
        patient={patient && { id: patient.id, name: fullName(patient), detail: `${age(patient.dob)} y ${sexShort(patient.sex)} · ${fmtDob(patient.dob)} · ${patient.mrn}` }}
      />
    </>
  );
}

