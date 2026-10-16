import { db } from "@/lib/db";
import { requirePhonePermission } from "@/lib/phone-session";
import { staffDirectory } from "@/lib/chat/server";
import { startOfDay } from "@/lib/scheduling/server";
import { DISCLAIMER } from "@/lib/chat/chat";
import { age, fmtDob, fullName, sexShort } from "@/lib/format";
import type { Staff } from "@/components/chat/new-message-form";
import { PhoneHeader } from "@/components/phone/header";
import { PhoneNewMessage } from "@/components/phone/chat-forms";

export const metadata = { title: "New message" };

// /m/chat/new?patient=… : from a chart, the message is about that patient and their care team comes first.
export default async function PhoneNewChat({ searchParams }: { searchParams: Promise<{ patient?: string }> }) {
  const sp = await searchParams;
  const user = await requirePhonePermission("useChat");
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
  const staff: Staff[] = everyone.filter((s) => s.id !== user.id).map((s) => ({ ...s, hint: careTeam.get(s.id) }));

  return (
    <>
      <PhoneHeader title="New message" back={patient ? `/m/patients/${patient.id}` : "/m/chat"} />
      <PhoneNewMessage
        staff={staff}
        patient={patient && { id: patient.id, name: fullName(patient), detail: `${age(patient.dob)} y ${sexShort(patient.sex)} · ${fmtDob(patient.dob)} · ${patient.mrn}` }}
      />
      <p className="px-4 text-[12px] text-ink-3">{DISCLAIMER}</p>
    </>
  );
}
