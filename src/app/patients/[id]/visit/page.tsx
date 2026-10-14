import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can, displayName } from "@/lib/roles";
import { fmtDate, fmtDateTime, fmtDayLong, fmtTime, toLocalDate } from "@/lib/format";
import { logChartView } from "@/lib/audit/server";
import { visitDetails, visitFor } from "@/lib/visits/server";
import { closeBlockers, closeWarnings, OPEN_STATUSES } from "@/lib/visits/close";
import { fromDbDate, followUpText } from "@/lib/visits/follow-up";
import { vitalsSummary } from "@/lib/visits/vitals-line";
import { sigText } from "@/lib/meds/sig";
import { noteTypeShort } from "@/lib/notes/library";
import { visitType } from "@/lib/scheduling/visit-types";
import { statusLabel } from "@/lib/scheduling/workflow";
import { Empty, Panel } from "@/components/panel";
import { Button, Field, inputCls } from "@/components/form";
import { VisitStatusChip } from "@/components/schedule/status-chip";
import { DiagnosisForm } from "@/components/visit/diagnosis-form";
import { AdviceEditor } from "@/components/visit/advice-editor";
import { FollowUpForm } from "@/components/visit/follow-up-form";
import { addDiagnosis, closeVisit, makePrimary, removeDiagnosis, saveFollowUp, saveVisitText } from "./actions";

export const dynamic = "force-dynamic";

const NOTE_STATUS: Record<string, string> = { draft: "Pended, not signed", signed: "Signed", pending_cosign: "Signed, awaiting cosign", addended: "Signed, addended" };
const linkBtn = "rounded border px-2.5 py-1 text-[12.5px] font-medium";

// One screen for the provider's part of a visit, top to bottom: why they came, vitals,
// diagnoses, orders and prescriptions, the note, advice and follow-up, then print the
// visit prescription and sign and close.
export default async function Visit({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ e?: string; error?: string; closed?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("viewClinical");
  await logChartView(id, "Visit");
  const visit = await visitFor(id, sp.e);
  const recent = await db.encounter.findMany({
    where: { patientId: id, status: { notIn: ["cancelled", "no_show", "planned"] }, start: { lte: new Date() } },
    orderBy: { start: "desc" },
    take: 8,
    include: { provider: true, _count: { select: { diagnoses: true } } },
  });

  if (!visit) {
    return (
      <div className="space-y-4 p-4">
        <p className="rounded-md border border-line bg-panel px-3 py-3 text-ink-2">No visit today for this patient. Pick an earlier visit, or make an appointment and check the patient in.</p>
        <RecentVisits patientId={id} visits={recent} />
      </div>
    );
  }

  const [details, provider, problems] = await Promise.all([
    visitDetails(visit),
    visit.providerId ? db.practitioner.findUnique({ where: { id: visit.providerId } }) : null,
    db.condition.findMany({ where: { patientId: id, status: "active" }, orderBy: { priority: "asc" } }),
  ]);
  const vt = visitType(visit.visitType);
  const canEdit = can(user.role, "seePatients") && visit.status !== "cancelled" && visit.status !== "no_show";
  const check = { diagnoses: details.diagnoses.length, notes: details.notes, pendingOrders: details.pendingOrders, status: visit.status };
  const blockers = closeBlockers(check);
  const warnings = closeWarnings(check);
  const isOpen = OPEN_STATUSES.includes(visit.status);
  const vitals = vitalsSummary(details.vitals);
  const usedProblems = new Set(details.diagnoses.map((d) => d.conditionId));
  const followUp = followUpText(visit, fmtDate);
  const printHref = `/print/visit?encounter=${visit.id}`;

  return (
    <div className="grid grid-cols-1 gap-4 p-4 xl:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-[12px] font-medium uppercase tracking-wide text-ink-3">
              {vt.label}
              {visit.type === "telehealth" && " · video"}
            </div>
            <h1 className="text-lg font-semibold">
              {fmtDayLong(visit.start)}, {fmtTime(visit.start)}
            </h1>
            <p className="text-ink-2">
              with {provider ? displayName(provider) : "no provider"}
              {visit.room && ` · ${visit.room}`} ·{" "}
              <Link href={`/appointments/${visit.id}`} className="text-accent hover:underline">
                Appointment
              </Link>
            </p>
          </div>
          <VisitStatusChip status={visit.status} since={visit.statusAt} />
        </div>

        {sp.closed && (
          <p role="status" className="rounded-md border border-ok/30 bg-panel px-3 py-2 text-ok">
            Visit closed. The front desk can check the patient out{visit.followUpDate ? " and book the follow-up" : ""}.
          </p>
        )}
        {sp.error && (
          <p role="alert" className="rounded-md border border-crit/30 bg-crit-soft px-3 py-2 text-crit">
            {sp.error === "code"
              ? "That ICD-10 code doesn't look right (for example I10 or E11.9). Leave it blank if you're not sure."
              : sp.error === "followup"
                ? "Pick a follow-up date on or after the visit."
                : "The visit can't be closed yet. See the checklist."}
          </p>
        )}

        <Step n={1} title="Reason for visit" done={!!(visit.chiefComplaint || visit.reason)}>
          <div className="p-3">
            {canEdit ? (
              <form action={saveVisitText.bind(null, id, visit.id)} className="flex flex-wrap items-end gap-2">
                <Field label="Chief complaint" className="min-w-72 flex-1">
                  <input name="chiefComplaint" defaultValue={visit.chiefComplaint ?? visit.reason ?? ""} placeholder="e.g. Fever for 3 days" className={inputCls} />
                </Field>
                <Button type="submit" variant="secondary">
                  Save
                </Button>
              </form>
            ) : (
              <p>{visit.chiefComplaint ?? visit.reason ?? "—"}</p>
            )}
            {visit.reason && visit.chiefComplaint && visit.reason !== visit.chiefComplaint && <p className="mt-1 text-[12px] text-ink-3">Booked for: {visit.reason}</p>}
          </div>
        </Step>

        <Step
          n={2}
          title="Vitals"
          done={vitals.length > 0}
          action={
            <Link href={`/patients/${id}/vitals`} className="text-[12px] text-accent hover:underline">
              {vitals.length ? "Vitals flowsheet" : "Enter vitals"}
            </Link>
          }
        >
          {vitals.length === 0 ? (
            <Empty>No vitals recorded on this day.</Empty>
          ) : (
            <dl className="tabular flex flex-wrap gap-x-6 gap-y-1 px-3 py-2">
              {vitals.map((v) => (
                <div key={v.label} className="flex gap-1.5">
                  <dt className="text-ink-3">{v.label}</dt>
                  <dd className="font-medium">{v.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </Step>

        <Step n={3} title="Diagnoses for this visit" done={details.diagnoses.length > 0}>
          {details.diagnoses.length === 0 ? (
            <Empty>None yet. Every visit needs at least one before it can close.</Empty>
          ) : (
            <ol>
              {details.diagnoses.map((d, i) => (
                <li key={d.id} className="flex items-center gap-3 border-t border-line px-3 py-1.5 first:border-t-0">
                  <span className="tabular w-4 text-ink-3">{i + 1}</span>
                  <span className="font-medium">{d.display}</span>
                  {d.code && <span className="font-mono text-[12px] text-ink-2">{d.code}</span>}
                  {i === 0 && <span className="rounded bg-accent-soft px-1.5 text-[11px] font-medium text-accent">Primary</span>}
                  {d.conditionId && <span className="text-[11px] text-ink-3">on problem list</span>}
                  {canEdit && (
                    <span className="ml-auto flex gap-1">
                      {i > 0 && (
                        <form action={makePrimary.bind(null, id, d.id)}>
                          <Button variant="ghost">Make primary</Button>
                        </form>
                      )}
                      <form action={removeDiagnosis.bind(null, id, d.id)}>
                        <Button variant="danger">Remove</Button>
                      </form>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
          {canEdit && (
            <div className="space-y-2 border-t border-line p-3">
              {problems.some((p) => !usedProblems.has(p.id)) && (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-medium text-ink-3">From the problem list</span>
                  {problems
                    .filter((p) => !usedProblems.has(p.id))
                    .map((p) => (
                      <form key={p.id} action={addDiagnosis.bind(null, id, visit.id)}>
                        <input type="hidden" name="conditionId" value={p.id} />
                        <button className="rounded-full border border-line bg-panel px-2 py-0.5 text-[11.5px] hover:border-accent hover:text-accent">+ {p.display}</button>
                      </form>
                    ))}
                </div>
              )}
              <DiagnosisForm action={addDiagnosis.bind(null, id, visit.id)} />
            </div>
          )}
        </Step>

        <Step
          n={4}
          title="Orders and prescriptions"
          done={details.orders.length + details.meds.length > 0}
          optional
          action={
            <span className="flex gap-3 text-[12px]">
              <Link href={`/patients/${id}/orders`} className="text-accent hover:underline">
                Orders
              </Link>
              <Link href={`/patients/${id}/meds`} className="text-accent hover:underline">
                Prescribe
              </Link>
            </span>
          }
        >
          {details.meds.length + details.orders.length === 0 ? (
            <Empty>Nothing ordered or prescribed on this day.</Empty>
          ) : (
            <ul>
              {details.meds.map((m) => (
                <li key={m.id} className="flex gap-3 border-t border-line px-3 py-1.5 first:border-t-0">
                  <span className="w-20 shrink-0 text-[11.5px] text-ink-3">Medicine</span>
                  <span>
                    <span className="font-medium">{m.drug}</span> <span className="text-ink-2">{sigText(m)}</span>
                  </span>
                </li>
              ))}
              {details.orders.map((o) => (
                <li key={o.id} className="flex gap-3 border-t border-line px-3 py-1.5 first:border-t-0">
                  <span className="w-20 shrink-0 text-[11.5px] capitalize text-ink-3">{o.type}</span>
                  <span className="font-medium">{o.display}</span>
                  {o.priority !== "routine" && <span className="text-[11.5px] uppercase text-high">{o.priority}</span>}
                </li>
              ))}
            </ul>
          )}
          {details.pendingOrders > 0 && (
            <p className="border-t border-line px-3 py-1.5 text-[12.5px] text-warn">
              {details.pendingOrders} pending {details.pendingOrders === 1 ? "order is" : "orders are"} waiting to be signed.{" "}
              <Link href={`/patients/${id}/orders`} className="underline">
                Open orders
              </Link>
            </p>
          )}
        </Step>

        <Step
          n={5}
          title="Visit note"
          done={details.notes.some((n) => n.status !== "draft")}
          action={
            can(user.role, "writeNotes") && (
              <Link href={`/patients/${id}/notes?new=1`} className="text-[12px] text-accent hover:underline">
                Write a note
              </Link>
            )
          }
        >
          {details.notes.length === 0 ? (
            <Empty>No note for this visit yet.</Empty>
          ) : (
            <ul>
              {details.notes.map((n) => (
                <li key={n.id} className="border-t border-line first:border-t-0">
                  <Link href={`/patients/${id}/notes?note=${n.id}`} className="flex items-center gap-3 px-3 py-1.5 hover:bg-accent-soft/40">
                    <span className="w-14 shrink-0 text-[11.5px] text-ink-3">{noteTypeShort[n.type]}</span>
                    <span className="font-medium">{n.title}</span>
                    <span className="text-ink-3">{n.author.name}</span>
                    <span className={`ml-auto text-[12px] ${n.status === "draft" ? "text-warn" : "text-ok"}`}>{NOTE_STATUS[n.status] ?? n.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Step>

        <Step n={6} title="Advice" done={!!visit.advice} optional>
          <AdviceEditor action={saveVisitText.bind(null, id, visit.id)} initial={visit.advice ?? ""} readOnly={!canEdit} />
        </Step>

        <Step n={7} title="Follow-up" done={!!visit.followUpInterval} optional>
          {canEdit ? (
            <FollowUpForm
              action={saveFollowUp.bind(null, id, visit.id)}
              initial={{ interval: visit.followUpInterval, date: visit.followUpDate ? toLocalDate(fromDbDate(visit.followUpDate)) : null, note: visit.followUpNote }}
            />
          ) : (
            <p className="px-3 py-2">{followUp ?? "None"}</p>
          )}
          {followUp && canEdit && (
            <p className="border-t border-line px-3 py-1.5 text-[12.5px] text-ink-2">
              Return: <span className="font-medium text-ink">{followUp}</span>
              {visit.followUpNote && ` · ${visit.followUpNote}`}
            </p>
          )}
        </Step>

        <RecentVisits patientId={id} visits={recent} current={visit.id} />
      </div>

      <aside className="xl:sticky xl:top-4 xl:self-start">
        <section className="rounded-md border border-line bg-panel">
          <header className="border-b border-line px-3 py-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Close the visit</h2>
          </header>
          <div className="space-y-3 p-3">
            {isOpen ? (
              blockers.length ? (
                <ul className="space-y-1">
                  {blockers.map((b) => (
                    <li key={b} className="flex gap-1.5 text-[12.5px]">
                      <span className="text-warn">○</span> {b}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-ok">✓ Ready to close: diagnoses added and the note is signed.</p>
              )
            ) : (
              <p className="text-[12.5px] text-ink-2">
                {visit.status === "finished" || visit.status === "checked_out" ? `Closed. ${statusLabel[visit.status]}.` : statusLabel[visit.status]}
              </p>
            )}
            {isOpen &&
              warnings.map((w) => (
                <p key={w} className="text-[12px] text-warn">
                  {w}
                </p>
              ))}
            <Link href={printHref} className={`${linkBtn} block border-line bg-panel text-center hover:bg-panel-muted`}>
              Print visit prescription
            </Link>
            {isOpen && can(user.role, "seePatients") && (
              <form action={closeVisit.bind(null, id, visit.id)}>
                <Button type="submit" disabled={blockers.length > 0} className="w-full disabled:cursor-not-allowed disabled:opacity-50">
                  Sign and close visit
                </Button>
              </form>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

function Step({ n, title, done, optional, action, children }: { n: number; title: string; done: boolean; optional?: boolean; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Panel
      title={`${n}. ${title}`}
      action={
        <span className="flex items-center gap-3">
          {action}
          <span className={`text-[11.5px] ${done ? "text-ok" : "text-ink-3"}`}>{done ? "✓ Done" : optional ? "Optional" : "To do"}</span>
        </span>
      }
    >
      {children}
    </Panel>
  );
}

function RecentVisits({
  patientId,
  visits,
  current,
}: {
  patientId: string;
  visits: { id: string; start: Date; visitType: string; status: string; reason: string | null; chiefComplaint: string | null; provider: { name: string } | null; _count: { diagnoses: number } }[];
  current?: string;
}) {
  if (visits.length === 0) return null;
  return (
    <Panel title="Earlier visits">
      <ul>
        {visits.map((v) => (
          <li key={v.id} className="border-t border-line first:border-t-0">
            <Link
              href={`/patients/${patientId}/visit?e=${v.id}`}
              className={`flex items-center gap-3 px-3 py-1.5 hover:bg-accent-soft/40 ${v.id === current ? "bg-accent-soft/60" : ""}`}
            >
              <span className="tabular w-40 shrink-0 text-ink-2">{fmtDateTime(v.start)}</span>
              <span className="font-medium">{v.chiefComplaint ?? v.reason ?? visitType(v.visitType).label}</span>
              <span className="text-ink-3">{v.provider?.name}</span>
              <span className="ml-auto text-[12px] text-ink-3">
                {v._count.diagnoses ? `${v._count.diagnoses} ${v._count.diagnoses === 1 ? "diagnosis" : "diagnoses"}` : "no diagnosis"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
