import Link from "next/link";
import type { EncounterStatus, EncounterType, Role } from "@prisma/client";
import { nextStep, TRANSITIONS } from "@/lib/scheduling/workflow";
import { ActionButton } from "@/components/action-button";
import { quickAction } from "@/app/schedule/actions";

const linkCls = "inline-block rounded border border-accent bg-accent px-2.5 py-1 text-[12.5px] font-medium text-white hover:bg-accent/90";

// The row's one obvious next step for this role: Check in, Room, Start visit,
// Close visit or Check out. Check-in and rooming open their forms.
export function NextStepButton({ appt, role }: { appt: { id: string; patientId: string; status: EncounterStatus; type: EncounterType }; role: Role }) {
  const step = nextStep(appt.status, appt.type, role);
  if (!step) return null;
  const label = TRANSITIONS[step].label;
  if (step === "arrive") return <Link href={`/appointments/${appt.id}/check-in`} className={linkCls}>{label}</Link>;
  if (step === "room") return <Link href={`/appointments/${appt.id}/room`} className={linkCls}>{label}</Link>;
  // A visit is closed on the visit screen, which checks for diagnoses and a signed note.
  if (step === "complete") return <Link href={`/patients/${appt.patientId}/visit?e=${appt.id}`} className={linkCls}>Close visit</Link>;
  if (step === "start" || step === "checkOut") {
    return (
      <ActionButton action={quickAction.bind(null, appt.id, step)} variant="primary">
        {label}
      </ActionButton>
    );
  }
  return null;
}
