import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can, displayName, needsCosign } from "@/lib/roles";
import { fmtDate, fmtDateOnly, fmtDateTime, relativeDays } from "@/lib/format";
import { orderContext, pendingOrderWarnings } from "@/lib/orders/server";
import { fillStatus, interactionsAmong, isControlled } from "@/lib/meds/checks";
import { productFor } from "@/lib/meds/formulary";
import { rxClassLabel, type RxDetails } from "@/lib/meds/rx";
import { sigText } from "@/lib/meds/sig";
import { Empty } from "@/components/panel";
import { Button, inputCls } from "@/components/form";
import { ActionButton } from "@/components/action-button";
import { OrderBasket } from "@/components/orders/order-basket";
import { basketRow } from "@/components/orders/order-bits";
import { RxComposer, type RxStart } from "@/components/meds/rx-composer";
import { DiscontinueButton, TakingControl } from "@/components/meds/med-controls";
import { OutsideMedForm } from "@/components/meds/outside-med-form";
import { addOrder, removePendingOrder, signOrders, updatePendingOrder } from "../orders/actions";
import { cosignPrescription, discontinueMed, documentOutsideMed, holdMed, markMedsReviewed, setPreferredPharmacy, setTaking } from "./actions";
import { logChartView } from "@/lib/audit/server";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

export default async function Meds({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ rx?: string; modify?: string; refill?: string; history?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const currentUser = await requirePermission("viewClinical");
  await logChartView(id, "Medications");
  const canEdit = can(currentUser.role, "editMeds");
  const canPend = can(currentUser.role, "pendOrders");
  const canSign = can(currentUser.role, "signOrders");
  const canReview = can(currentUser.role, "reviewMeds");

  const [patient, meds, requests, pendingOrders, ctx, problems, pharmacies, attendings] = await Promise.all([
    db.patient.findUniqueOrThrow({ where: { id }, include: { preferredPharmacy: true, medsReviewedBy: true } }),
    db.medicationRequest.findMany({
      where: { patientId: id },
      orderBy: [{ drug: "asc" }],
      include: { prescriber: true, pharmacy: true, cosigner: true, endedBy: true, dispenses: { orderBy: { filledAt: "desc" }, include: { pharmacy: true } } },
    }),
    db.refillRequest.findMany({ where: { patientId: id, status: { in: ["requested", "pended"] } }, include: { medication: true, pharmacy: true, pendedBy: true }, orderBy: { requestedAt: "asc" } }),
    db.serviceRequest.findMany({ where: { patientId: id, status: "pending" }, orderBy: { createdAt: "asc" }, include: { orderedBy: true } }),
    orderContext(id),
    db.condition.findMany({ where: { patientId: id, status: "active" }, orderBy: { priority: "asc" }, select: { id: true, display: true } }),
    db.pharmacy.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, address: true, mailOrder: true } }),
    needsCosign(currentUser.role) ? db.practitioner.findMany({ where: { role: "physician", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : null,
  ]);

  const now = Date.now();
  const current = meds.filter((m) => m.status === "active" || m.status === "on_hold");
  const past = meds.filter((m) => m.status === "discontinued" || m.status === "completed").sort((a, b) => (b.end?.getTime() ?? 0) - (a.end?.getTime() ?? 0));
  const byId = new Map(meds.map((m) => [m.id, m]));
  const chain = (m: (typeof meds)[number]) => {
    const out = [];
    let p = m.priorId ? byId.get(m.priorId) : undefined;
    while (p) {
      out.push(p);
      p = p.priorId ? byId.get(p.priorId) : undefined;
    }
    return out;
  };
  const interactions = interactionsAmong(current.filter((m) => m.status === "active").map((m) => m.drug));
  const pendingFor = new Map(
    pendingOrders.flatMap((o) => {
      const r = (o.details as Partial<RxDetails> | null)?.replacesId;
      return r ? [[r, o] as const] : [];
    }),
  );

  // ?rx=<med> reorders (or with &modify=1 changes) a current medication; &refill= answers a pharmacy request with it.
  let start: RxStart | undefined;
  const target = sp.rx ? current.find((m) => m.id === sp.rx) : undefined;
  const targetProduct = target ? productFor(target) : undefined;
  if (target && targetProduct) {
    start = {
      code: `RX:${targetProduct.rxnorm}`,
      initial: {
        dose: target.dose,
        route: target.route,
        frequency: target.frequency,
        prn: target.prn,
        prnReason: target.prnReason,
        quantity: target.quantity ?? undefined,
        refills: target.refills,
        daw: target.daw,
        patientInstructions: target.patientInstructions,
        pharmacyId: target.pharmacyId,
        rxClass: target.rxClass === "historical" ? undefined : target.rxClass,
        indication: target.indication,
        conditionId: target.conditionId,
      },
      replaces: { id: target.id, drug: target.drug, mode: sp.modify ? "modify" : "reorder" },
      refillRequestId: sp.refill,
    };
  }

  const warnings = await pendingOrderWarnings(pendingOrders, ctx);
  const rows = pendingOrders.map((o) => basketRow(o, currentUser.id, warnings.get(o.id)));

  const reviewedToday = patient.medsReviewedAt && patient.medsReviewedAt.toDateString() === new Date().toDateString();

  return (
    <div className="flex flex-col gap-4 p-4 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 space-y-4">
        <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-line bg-panel px-3 py-2">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${reviewedToday ? "bg-accent" : "bg-warn"}`} />
            <span>
              {patient.medsReviewedAt && patient.medsReviewedBy ? (
                <>
                  Medications reviewed <span className="font-medium">{relativeDays(patient.medsReviewedAt)}</span> by {displayName(patient.medsReviewedBy)}
                </>
              ) : (
                <span className="text-warn">Medications not reviewed yet</span>
              )}
            </span>
            {canReview && (
              <form action={markMedsReviewed.bind(null, id)}>
                <Button type="submit" variant={reviewedToday ? "secondary" : "primary"} className="py-0.5">
                  Mark as reviewed
                </Button>
              </form>
            )}
          </div>
          <form action={setPreferredPharmacy.bind(null, id)} className="flex items-center gap-1.5">
            <span className="text-[12px] text-ink-3">Preferred pharmacy</span>
            {canReview ? (
              <>
                <select name="pharmacyId" defaultValue={patient.preferredPharmacyId ?? ""} className={`${inputCls} py-0.5`} aria-label="Preferred pharmacy">
                  <option value="">None</option>
                  {pharmacies.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="ghost" className="py-0.5">
                  Save
                </Button>
              </>
            ) : (
              <span>{patient.preferredPharmacy?.name ?? "None"}</span>
            )}
          </form>
          <Link href={`/print/meds?patient=${id}`} className="ml-auto text-[12px] font-medium text-accent hover:underline">
            Print medication list
          </Link>
        </section>

        {requests.length > 0 && (
          <section className="rounded-md border border-warn/40 bg-warn-soft/60">
            <header className="px-3 pt-2 text-[12px] font-semibold uppercase tracking-wide text-warn">Pharmacy refill requests ({requests.length})</header>
            <ul>
              {requests.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 px-3 py-1.5">
                  <span className="font-medium">{r.medication.drug}</span>
                  <span className="text-[12px] text-ink-2">
                    from {r.pharmacy?.name ?? "pharmacy"} · {fmtDateTime(r.requestedAt)}
                    {r.status === "pended" && r.pendedBy && ` · pended by ${displayName(r.pendedBy)}`}
                  </span>
                  <Link href={`/inbox?folder=refills&item=${r.id}`} className="ml-auto text-[12px] font-medium text-accent hover:underline">
                    Review in Inbox
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {interactions.length > 0 && (
          <section className="rounded-md border border-line bg-panel">
            <header className="border-b border-line px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-2">
              Interactions among current medications <span className="font-normal text-ink-3">({interactions.length})</span>
            </header>
            <ul>
              {interactions.map((ix, n) => (
                <li key={n} className="flex gap-2 border-t border-line px-3 py-1.5 first:border-t-0">
                  <span className={`mt-0.5 h-fit shrink-0 rounded px-1 text-[10px] font-bold ${ix.level === "stop" ? "bg-crit-soft text-crit" : "bg-warn-soft text-warn"}`}>
                    {ix.level === "stop" ? "MAJOR" : "MODERATE"}
                  </span>
                  <span>
                    <span className="font-medium">
                      {ix.a.split(" ")[0]} + {ix.b.split(" ")[0]}
                    </span>
                    <span className="text-ink-2">: {ix.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {canPend && (
          <RxComposer
            key={`${sp.rx ?? ""}:${sp.modify ?? ""}:${sp.refill ?? ""}`}
            ctx={ctx}
            problems={problems}
            pharmacies={pharmacies}
            preferredPharmacyId={patient.preferredPharmacyId}
            start={start}
            addOrder={addOrder.bind(null, id)}
            canSign={canSign}
          />
        )}

        <section className="overflow-x-auto rounded-md border border-line bg-panel">
          <header className="flex items-center justify-between border-b border-line px-3 py-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
              Current medications <span className="font-normal text-ink-3">({current.length})</span>
            </h2>
          </header>
          {current.length === 0 ? (
            <Empty>No current medications.</Empty>
          ) : (
            <table className="w-full min-w-[780px]">
              <thead className="text-left text-[11.5px] text-ink-3">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Medication and sig</th>
                  <th className="px-3 py-1.5 font-medium">Prescription and fills</th>
                  <th className="px-3 py-1.5 font-medium">Patient reports</th>
                  <th className="px-3 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {current.map((m) => {
                  const product = productFor(m);
                  const fs = fillStatus(m.dispenses, m.refills, now);
                  const history = chain(m);
                  const awaitingCosign = m.cosignerId && !m.cosignedAt;
                  const pendingRx = pendingFor.get(m.id);
                  const outside = m.rxClass === "historical";
                  const runsOutIn = fs.runsOutAt ? Math.ceil((fs.runsOutAt.getTime() - now) / DAY) : null;
                  return (
                    <tr key={m.id} className={`border-t border-line align-top ${m.id === sp.rx ? "bg-accent-soft/40" : ""}`}>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">{m.drug}</span>
                          {m.status === "on_hold" && <Chip tone="warn">ON HOLD</Chip>}
                          {isControlled(m.drug) && <Chip tone="crit">Controlled</Chip>}
                          {outside && <Chip tone="muted">OUTSIDE / OTC</Chip>}
                          {awaitingCosign && <Chip tone="accent">AWAITING COSIGN</Chip>}
                          {pendingRx && <Chip tone="warn">CHANGE PENDING</Chip>}
                        </div>
                        <div className="text-ink-2">{sigText({ dose: m.dose, route: m.route, frequency: m.frequency, prn: m.prn, prnReason: m.prnReason })}</div>
                        {m.indication && <div className="text-[12px] text-ink-3">For {m.indication}</div>}
                        {m.patientInstructions && <div className="text-[12px] text-ink-3">“{m.patientInstructions}”</div>}
                        {history.length + m.dispenses.length > 0 && (
                          <details className="mt-1 text-[12px]">
                            <summary className="cursor-pointer text-accent">History</summary>
                            <ul className="mt-1 space-y-0.5 border-l-2 border-line pl-2 text-ink-2">
                              {m.dispenses.map((d) => (
                                <li key={d.id}>
                                  <span className="tabular">{fmtDate(d.filledAt)}</span> Filled {d.quantity} ({d.daysSupply} days) at {d.pharmacy?.name ?? "pharmacy"}
                                </li>
                              ))}
                              <li>
                                <span className="tabular">{fmtDate(m.authoredAt)}</span> {outside ? "Documented" : `Prescribed by ${m.prescriber?.name ?? "unknown"}`}
                                {m.quantity && `: ${m.quantity}, ${m.refills} refill${m.refills === 1 ? "" : "s"}`}
                              </li>
                              {history.map((h) => (
                                <li key={h.id} className="text-ink-3">
                                  <span className="tabular">{fmtDate(h.authoredAt)}</span> {h.drug}, {h.dose} {h.frequency}, by {h.prescriber?.name ?? "unknown"}
                                  {h.endReason && ` · ${h.endReason}${h.end ? ` ${fmtDateOnly(h.end)}` : ""}`}
                                </li>
                              ))}
                              <li className="text-ink-3">Started {fmtDateOnly(m.start)}</li>
                            </ul>
                          </details>
                        )}
                      </td>
                      <td className="px-3 py-2 text-[12.5px] text-ink-2">
                        {outside ? (
                          <span className="text-ink-3">{m.pharmacyNote ?? "Prescribed elsewhere"}</span>
                        ) : (
                          <>
                            <div>
                              {m.quantity ?? "—"} · {fs.refillsLeft} of {m.refills} refill{m.refills === 1 ? "" : "s"} left
                            </div>
                            <div className="text-ink-3">
                              {rxClassLabel[m.rxClass]}
                              {m.pharmacy && m.rxClass !== "print" && ` to ${m.pharmacy.name}`}
                            </div>
                            <div className="text-ink-3">
                              {fmtDate(m.authoredAt)} · {m.prescriber?.name}
                              {awaitingCosign && m.cosigner && `, cosign ${m.cosigner.name}`}
                            </div>
                          </>
                        )}
                        {outside ? null : fs.lastFilledAt ? (
                          <>
                            <div className="mt-1 text-ink-2">Last filled {fmtDate(fs.lastFilledAt)}</div>
                            {fs.daysLate > 0 ? (
                              <div className="font-medium text-crit">Ran out {fs.daysLate} days ago</div>
                            ) : runsOutIn !== null && runsOutIn <= 7 ? (
                              <div className="font-medium text-warn">Runs out in {runsOutIn} day{runsOutIn === 1 ? "" : "s"}</div>
                            ) : (
                              <div className="text-ink-3">Supply to {fs.runsOutAt ? fmtDate(fs.runsOutAt) : "—"}</div>
                            )}
                            {fs.refillsLeft === 0 && <div className="text-warn">No refills left</div>}
                          </>
                        ) : (
                          <div className="mt-1 text-ink-3">{m.sentAt ? `Sent ${relativeDays(m.sentAt)}, not filled yet` : "No fills recorded"}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <TakingControl value={m.taking} note={m.takingNote} action={setTaking.bind(null, id, m.id)} disabled={!canReview} />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {awaitingCosign && m.cosignerId === currentUser.id && (
                            <ActionButton variant="primary" action={cosignPrescription.bind(null, m.id, undefined)}>
                              Cosign
                            </ActionButton>
                          )}
                          {canPend && product && !pendingRx && (
                            <>
                              <Link href={`?rx=${m.id}#prescribe`} className="rounded border border-line px-2.5 py-1 text-[12.5px] font-medium hover:bg-panel-muted">
                                {outside ? "Prescribe" : "Reorder"}
                              </Link>
                              {!outside && (
                                <Link href={`?rx=${m.id}&modify=1#prescribe`} className="rounded border border-transparent px-2.5 py-1 text-[12.5px] font-medium text-ink-2 hover:bg-panel-muted">
                                  Modify
                                </Link>
                              )}
                            </>
                          )}
                          {m.rxClass === "print" && (
                            <Link href={`/print/rx?med=${m.id}`} className="rounded px-2.5 py-1 text-[12.5px] font-medium text-accent hover:underline">
                              Print Rx
                            </Link>
                          )}
                          {canEdit && m.status === "active" && (
                            <ActionButton variant="ghost" action={holdMed.bind(null, id, m.id, true)}>
                              Hold
                            </ActionButton>
                          )}
                          {canEdit && m.status === "on_hold" && (
                            <ActionButton variant="ghost" action={holdMed.bind(null, id, m.id, false)}>
                              Resume
                            </ActionButton>
                          )}
                        </div>
                        {canEdit && <DiscontinueButton drug={m.drug} action={discontinueMed.bind(null, id, m.id)} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <section className="overflow-x-auto rounded-md border border-line bg-panel">
          <header className="flex items-center justify-between border-b border-line px-3 py-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">
              Discontinued and completed <span className="font-normal text-ink-3">({past.length})</span>
            </h2>
          </header>
          {past.length === 0 ? (
            <Empty>None.</Empty>
          ) : (
            <table className="w-full">
              <tbody>
                {past.map((m) => (
                  <tr key={m.id} className="border-t border-line text-ink-3 first:border-t-0">
                    <td className="px-3 py-1.5">
                      <span className="font-medium line-through">{m.drug}</span>
                      <span className="ml-2">{sigText({ dose: m.dose, route: m.route, frequency: m.frequency, prn: m.prn, prnReason: m.prnReason })}</span>
                    </td>
                    <td className="tabular whitespace-nowrap px-3 py-1.5">
                      {fmtDateOnly(m.start)} – {fmtDateOnly(m.end)}
                    </td>
                    <td className="px-3 py-1.5">
                      {m.endReason ?? (m.status === "completed" ? "Completed" : "Discontinued")}
                      {m.endedBy && ` · ${m.endedBy.name}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {canReview && (
          <OutsideMedForm action={documentOutsideMed.bind(null, id)} problems={problems} />
        )}
      </div>

      <div className="xl:sticky xl:top-4 xl:w-[380px]">
        {canPend && (
          <OrderBasket
            rows={rows}
            problems={problems}
            remove={removePendingOrder.bind(null, id)}
            update={updatePendingOrder.bind(null, id)}
            sign={canSign ? signOrders.bind(null, id) : undefined}
            cosigners={attendings ?? undefined}
          />
        )}
      </div>
    </div>
  );
}

function Chip({ tone, children }: { tone: "warn" | "crit" | "muted" | "accent"; children: React.ReactNode }) {
  const cls = { warn: "bg-warn-soft text-warn", crit: "bg-crit-soft text-crit", muted: "bg-panel-muted text-ink-2", accent: "bg-accent-soft text-accent" }[tone];
  return <span className={`rounded px-1 text-[10.5px] font-semibold ${cls}`}>{children}</span>;
}
