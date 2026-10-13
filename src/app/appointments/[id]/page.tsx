import Link from "next/link";
import { notFound } from "next/navigation";
import type { EncounterStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can, displayName } from "@/lib/roles";
import { age, fmtDate, fmtDateTime, fmtDayLong, fmtDob, fmtTime, fullName, sexShort } from "@/lib/format";
import { canTransition, eventLabel, TRANSITIONS, type WorkflowAction } from "@/lib/scheduling/workflow";
import { CANCEL_REASONS, visitType } from "@/lib/scheduling/visit-types";
import { Panel } from "@/components/panel";
import { Button, inputCls } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { VisitStatusChip } from "@/components/schedule/status-chip";
import { cancelAppointment, quickAction } from "@/app/schedule/actions";

export const dynamic = "force-dynamic";

const STEPS: { status: EncounterStatus; label: string }[] = [
  { status: "planned", label: "Scheduled" },
  { status: "arrived", label: "Checked in" },
  { status: "roomed", label: "Roomed" },
  { status: "in_progress", label: "With provider" },
  { status: "finished", label: "Visit done" },
  { status: "checked_out", label: "Checked out" },
];

const linkBtn = "rounded border px-2.5 py-1 text-[12.5px] font-medium";

export default async function Appointment({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ booked?: string }> }) {
  const { id } = await params;
  const { booked } = await searchParams;
  const user = await requireUser();
  const appt = await db.encounter.findUnique({
    where: { id },
    include: {
      patient: { include: { pcp: true } },
      provider: true,
      events: { orderBy: { at: "asc" }, include: { by: true } },
      rescheduledTo: true,
      rescheduledFrom: true,
    },
  });
  if (!appt) notFound();
  const vt = visitType(appt.visitType);
  const p = appt.patient;
  const stepIndex = STEPS.findIndex((s) => s.status === appt.status);
  const able = (a: WorkflowAction) => canTransition(a, appt.status, user.role);
  const quick = (a: Parameters<typeof quickAction>[1], variant: "primary" | "secondary" | "ghost" | "danger" = "secondary", confirm?: string) =>
    able(a) && (
      <ActionButton key={a} action={quickAction.bind(null, appt.id, a)} variant={variant} confirm={confirm}>
        {TRANSITIONS[a].label}
      </ActionButton>
    );
  const followUp = `/schedule/book?patient=${p.id}&provider=${appt.providerId ?? "any"}&type=follow_up&reason=Follow-up`;

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-5">
        {booked && (
          <p role="status" className="rounded-md border border-ok/30 bg-panel px-3 py-2 text-ok">
            {booked === "moved" ? "Appointment moved. The old time is free again." : "Appointment scheduled."}
          </p>
        )}

        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[12px] font-medium uppercase tracking-wide text-ink-3">{vt.label}</div>
            <h1 className="text-xl font-semibold">
              {fmtDayLong(appt.start)}, {fmtTime(appt.start)}
              {appt.end && <span className="text-ink-3"> to {fmtTime(appt.end)}</span>}
            </h1>
            <p className="text-ink-2">
              with {appt.provider ? displayName(appt.provider) : "no provider"}
              {appt.type === "telehealth" && " · video visit"}
              {appt.room && ` · ${appt.room}`}
            </p>
          </div>
          <VisitStatusChip status={appt.status} since={appt.statusAt} />
        </div>

        {stepIndex >= 0 && (
          <ol className="flex overflow-hidden rounded-md border border-line bg-panel text-[12px]">
            {STEPS.map((s, i) => {
              const at = i === 0 ? appt.events.find((e) => e.action === "booked")?.at : appt.events.findLast((e) => TRANSITIONS[e.action as WorkflowAction]?.to === s.status)?.at;
              return (
                <li
                  key={s.status}
                  className={`flex-1 border-l border-line px-3 py-2 first:border-l-0 ${
                    i < stepIndex ? "text-ink-2" : i === stepIndex ? "bg-accent-soft font-semibold text-ink" : "text-ink-3"
                  }`}
                >
                  <div>
                    {i < stepIndex ? "✓ " : ""}
                    {s.label}
                  </div>
                  <div className="tabular text-[11px] font-normal text-ink-3">{at && i <= stepIndex ? fmtTime(at) : " "}</div>
                </li>
              );
            })}
          </ol>
        )}

        {appt.status === "cancelled" && (
          <p className="rounded-md border border-line bg-panel px-3 py-2">
            Cancelled: {appt.cancelReason}
            {appt.rescheduledTo && (
              <>
                {" "}
                · moved to{" "}
                <Link href={`/appointments/${appt.rescheduledTo.id}`} className="text-accent hover:underline">
                  {fmtDate(appt.rescheduledTo.start)} {fmtTime(appt.rescheduledTo.start)}
                </Link>
              </>
            )}
          </p>
        )}
        {appt.rescheduledFrom && (
          <p className="text-ink-3">
            Rescheduled from{" "}
            <Link href={`/appointments/${appt.rescheduledFrom.id}`} className="text-accent hover:underline">
              {fmtDate(appt.rescheduledFrom.start)} {fmtTime(appt.rescheduledFrom.start)}
            </Link>
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {able("arrive") && (
            <Link href={`/appointments/${appt.id}/check-in`} className={`${linkBtn} border-accent bg-accent text-white hover:bg-accent/90`}>
              Check in
            </Link>
          )}
          {able("room") && (
            <Link href={`/appointments/${appt.id}/room`} className={`${linkBtn} border-accent bg-accent text-white hover:bg-accent/90`}>
              Room patient
            </Link>
          )}
          {quick("start", "primary")}
          {quick("complete", "primary")}
          {quick("checkOut", "primary")}
          {(appt.status === "finished" || appt.status === "checked_out") && can(user.role, "bookAppointments") && (
            <Link href={followUp} className={`${linkBtn} border-line bg-panel hover:bg-panel-muted`}>
              Make follow-up
            </Link>
          )}
          {appt.status === "planned" && can(user.role, "bookAppointments") && (
            <Link href={`/schedule/book?reschedule=${appt.id}`} className={`${linkBtn} border-line bg-panel hover:bg-panel-muted`}>
              Reschedule
            </Link>
          )}
          {quick("noShow", "secondary", `Mark ${p.firstName} ${p.lastName} as a no-show?`)}
          {quick("undoArrival", "ghost", "Undo this check-in? The copay record is cleared.")}
          {quick("undoNoShow", "ghost")}
          <Link href={`/patients/${p.id}`} className="ml-auto text-accent hover:underline">
            Open chart
          </Link>
        </div>

        {able("cancel") && (
          <details className="rounded-md border border-line bg-panel">
            <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-medium text-crit">Cancel appointment</summary>
            <form action={cancelAppointment.bind(null, appt.id)} className="flex flex-wrap items-end gap-2 border-t border-line p-3">
              <label className="flex flex-col gap-0.5">
                <span className="text-[11px] font-medium text-ink-3">Reason</span>
                <select name="reason" className={inputCls}>
                  {CANCEL_REASONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-60 flex-1 flex-col gap-0.5">
                <span className="text-[11px] font-medium text-ink-3">Comment (optional)</span>
                <input name="comment" className={inputCls} />
              </label>
              <Button type="submit" variant="danger" className="border-crit/30">
                Cancel appointment
              </Button>
            </form>
          </details>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel title="Patient">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 py-2">
              <dt className="text-ink-3">Name</dt>
              <dd>
                <Link href={`/patients/${p.id}`} className="font-medium hover:text-accent">
                  {fullName(p)}
                </Link>{" "}
                <span className="text-ink-3">
                  {age(p.dob)} y {sexShort(p.sex)}
                </span>
              </dd>
              <dt className="text-ink-3">DOB · MRN</dt>
              <dd className="tabular">
                {fmtDob(p.dob)} · <span className="font-mono">{p.mrn}</span>
              </dd>
              <dt className="text-ink-3">Phone</dt>
              <dd className="tabular">{p.phone ?? "—"}</dd>
              <dt className="text-ink-3">Coverage</dt>
              <dd>{p.insurancePayer ? `${p.insurancePayer} · ${p.insuranceMemberId ?? "no member ID"}` : "Self-pay / not on file"}</dd>
              <dt className="text-ink-3">PCP</dt>
              <dd>{p.pcp?.name ?? "None"}</dd>
            </dl>
          </Panel>
          <Panel title="Visit">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 py-2">
              <dt className="text-ink-3">Reason</dt>
              <dd>{appt.reason ?? "—"}</dd>
              {appt.bookingNote && (
                <>
                  <dt className="text-ink-3">Note</dt>
                  <dd>{appt.bookingNote}</dd>
                </>
              )}
              {appt.arrivedAt && (
                <>
                  <dt className="text-ink-3">Copay</dt>
                  <dd>{appt.copayCents ? `$${(appt.copayCents / 100).toFixed(2)} (${appt.copayMethod ?? "unknown"})` : appt.copayMethod === "waived" ? "Waived" : "None collected"}</dd>
                </>
              )}
              {appt.chiefComplaint && (
                <>
                  <dt className="text-ink-3">Chief complaint</dt>
                  <dd>{appt.chiefComplaint}</dd>
                </>
              )}
              {(appt.status === "roomed" || appt.room || appt.allergiesReviewedAt || appt.medsReviewedAt) && (
                <>
                  <dt className="text-ink-3">Rooming</dt>
                  <dd>
                    {[appt.room, appt.allergiesReviewedAt ? "allergies reviewed" : "allergies not reviewed", appt.medsReviewedAt ? "meds reviewed" : "meds not reviewed"]
                      .filter(Boolean)
                      .join(" · ")}
                  </dd>
                </>
              )}
            </dl>
          </Panel>
        </div>

        <Panel title="History">
          <ol>
            {appt.events.map((e) => (
              <li key={e.id} className="flex gap-3 border-t border-line px-3 py-1.5 first:border-t-0">
                <span className="tabular w-40 shrink-0 text-ink-3">{fmtDateTime(e.at)}</span>
                <span className="font-medium">{eventLabel[e.action] ?? e.action}</span>
                {e.detail && <span className="text-ink-2">{e.detail}</span>}
                <span className="ml-auto text-ink-3">{e.by.name}</span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </main>
  );
}
