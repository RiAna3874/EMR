import Link from "next/link";
import { resultHref } from "@/lib/labs/groups";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { pivot } from "@/lib/chart";
import { recentAbnormalLabs } from "@/lib/queries";
import { readContent } from "@/lib/documents/draft";
import { DocTypeChip } from "@/components/documents/doc-view";
import { fmtDate, fmtDateOnly, fmtDob, fmtRange, fmtShortDate, fmtTime, fmtValue, relativeDays, unitLabel } from "@/lib/format";
import { Empty, Panel } from "@/components/panel";
import { FlagBadge, flagText } from "@/components/flag";
import { Sparkline } from "@/components/sparkline";
import { sigText } from "@/lib/meds/sig";
import { CourseDates, StepNow } from "@/components/meds/step-now";
import { logChartView } from "@/lib/audit/server";
import { MedRowActions } from "@/components/meds/med-row-actions";
import { pendingReplacements } from "@/lib/meds/pending";
import { GLUCOSE_CODES, isGlucoseCode, mmolToMg } from "@/lib/glucose";
import { Hover } from "@/components/hover/hover-card";
import { AllergyCard, MedCard, NoteCard, ProblemCard, ResultCard, VisitCard } from "@/components/hover/cards";
import { HoverHint } from "@/components/hover/card-parts";
import { ViewMenu } from "@/components/view-menu";
import { getViewPrefs } from "@/lib/view-prefs-server";
import { movableOrder, shownIn, viewArea } from "@/lib/view-prefs";
import { Arrange } from "@/components/arrange";
import { SummaryGrid } from "@/components/chart/summary-grid";
import { chartTabs } from "@/lib/chart-tabs";
import { redirect } from "next/navigation";

const vitalCodes = ["8480-6", "8462-4", "8867-4", "59408-5", "29463-7", "39156-5", ...GLUCOSE_CODES];

export default async function Summary({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ registered?: string; tab?: string }> }) {
  const { id } = await params;
  const base = `/patients/${id}`;
  const currentUser = await requireUser();
  const sp = await searchParams;
  // Charts open on the tab this person chose (View options); the Summary tab itself links with ?tab=summary.
  if (!sp.tab && !sp.registered) {
    const startTab = (await getViewPrefs()).startTab;
    const start = chartTabs.find((t) => t.slug && t.slug === startTab);
    if (start && (!start.needs || can(currentUser.role, start.needs))) redirect(`${base}/${start.slug}`);
  }
  await logChartView(id, "Summary");
  const registered = sp.registered === "1" && <Registered patientId={id} canBook={can(currentUser.role, "bookAppointments")} />;
  if (!can(currentUser.role, "viewClinical"))
    return (
      <>
        {registered}
        <FrontDeskSummary patientId={id} />
      </>
    );
  const canPend = can(currentUser.role, "pendOrders");
  const canReview = can(currentUser.role, "reviewMeds");
  const prefs = await getViewPrefs();
  const show = shownIn(prefs, "summary");
  const [conditions, meds, allergies, vitals, abnormal, notes, upcoming, outside, inBasket] = await Promise.all([
    db.condition.findMany({ where: { patientId: id, status: "active" }, orderBy: { priority: "asc" } }),
    db.medicationRequest.findMany({ where: { patientId: id, status: { in: ["active", "on_hold"] } }, orderBy: { drug: "asc" }, include: { prescriber: true, condition: { select: { display: true } } } }),
    db.allergyIntolerance.findMany({ where: { patientId: id } }),
    db.observation.findMany({ where: { patientId: id, category: "vital_signs", code: { in: vitalCodes } } }),
    recentAbnormalLabs(120, id),
    db.note.findMany({ where: { patientId: id }, orderBy: { serviceAt: "desc" }, take: 5, include: { author: true, cosigner: true } }),
    db.encounter.findMany({
      where: { patientId: id, start: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, status: { not: "cancelled" } },
      orderBy: { start: "asc" },
      take: 3,
      include: { provider: true },
    }),
    db.clinicalDocument.findMany({ where: { patientId: id }, orderBy: { serviceDate: "desc" }, take: 4 }),
    pendingReplacements(id),
  ]);
  const vitalRows = pivot(vitals).rows;
  vitalRows.sort((a, b) => vitalCodes.indexOf(a.code) - vitalCodes.indexOf(b.code));

  // Only the newest abnormal value per test.
  const seen = new Set<string>();
  const latestAbnormal = abnormal.filter((o) => (seen.has(o.code) ? false : (seen.add(o.code), true)));

  // Each panel, keyed for the person's order (dragged by the grip, or the View menu's arrows).
  const panels: Record<string, React.ReactNode> = {
    problems: show("problems") && (
      <Panel title="Active problems" href={`${base}/problems`}>
        {conditions.length === 0 ? (
          <Empty>No active problems.</Empty>
        ) : (
          <ul>
            {conditions.map((c) => (
              <Hover as="li" key={c.id} className="flex justify-between gap-3 border-t border-line px-3 py-1.5 first:border-t-0" card={<ProblemCard c={c} />}>
                <span>{c.display}</span>
                <span className="shrink-0 font-mono text-[11.5px] text-ink-3">{c.code}</span>
              </Hover>
            ))}
          </ul>
        )}
      </Panel>
    ),
    meds: show("meds") && (
      <Panel
        title="Active medications"
        href={`${base}/meds`}
        action={<MedsReviewed patientId={id} />}
      >
        {meds.length === 0 ? (
          <Empty>No active medications.</Empty>
        ) : (
          <ul>
            {meds.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start gap-2 border-t border-line px-3 py-1.5 first:border-t-0">
                <Hover as="div" className="min-w-0 flex-1" card={<MedCard m={m} />}>
                  <div className="font-medium">
                    {m.drug}
                    {m.status === "on_hold" && <span className="ml-1.5 rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-warn">ON HOLD</span>}
                  </div>
                  <div className="text-ink-2">{sigText({ dose: m.dose, route: m.route, frequency: m.frequency, prn: m.prn, prnReason: m.prnReason, steps: m.steps })}</div>
                  <StepNow steps={m.steps} written={m.courseStart ?? m.authoredAt} />
                  <CourseDates med={m} />
                </Hover>
                {(canPend || canReview) && <MedRowActions patientId={id} med={m} inBasket={inBasket.has(m.id)} canPend={canPend} canReview={canReview} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    ),
    allergies: show("allergies") && (
        <Panel title="Allergies" href={`${base}/allergies`}>
          {allergies.length === 0 ? (
            <Empty>See allergy review status in the sidebar.</Empty>
          ) : (
            <ul>
              {allergies.map((a) => (
                <Hover as="li" key={a.id} className="flex justify-between border-t border-line px-3 py-1.5 first:border-t-0" card={<AllergyCard a={a} />}>
                  <span className="font-medium text-crit">{a.substance}</span>
                  <span className="text-ink-2">
                    {a.reaction} · <span className="capitalize">{a.severity}</span>
                  </span>
                </Hover>
              ))}
            </ul>
          )}
        </Panel>
    ),
    upcoming: show("upcoming") && (
        <Panel title="Upcoming">
          {upcoming.length === 0 ? (
            <Empty>No upcoming appointments.</Empty>
          ) : (
            <ul>
              {upcoming.map((e) => (
                <Hover as="li" key={e.id} className="border-t border-line px-3 py-1.5 first:border-t-0" card={<VisitCard e={e} />}>
                  <div className="font-medium">
                    {fmtDate(e.start)} {fmtTime(e.start)}
                  </div>
                  <div className="text-ink-2">
                    {e.reason} · {e.provider?.name}
                  </div>
                </Hover>
              ))}
            </ul>
          )}
        </Panel>
    ),
    vitals: show("vitals") && (
      <Panel title="Vitals trend" href={`${base}/vitals`}>
        {vitalRows.length === 0 ? (
          <Empty>No vitals recorded.</Empty>
        ) : (
          <table className="w-full">
            <tbody>
              {vitalRows.map((r) => {
                const times = [...r.byTime.keys()].sort((a, b) => b - a);
                const latest = r.byTime.get(times[0])!;
                const before = times[1] !== undefined ? r.byTime.get(times[1]) : null;
                return (
                  <Hover
                    as="tr"
                    key={r.code}
                    className="border-t border-line first:border-t-0"
                    card={<ResultCard o={latest} previous={before} note={`${r.values.length} readings. Open Vitals for the full flowsheet.`} />}
                  >
                    <td className="px-3 py-1.5 text-ink-2">{r.display}</td>
                    <td className={`tabular px-2 py-1.5 text-right font-medium ${flagText(latest.flag)}`}>
                      {isGlucoseCode(r.code) && latest.valueNum !== null ? latest.valueNum.toFixed(1) : fmtValue(latest)} <span className="font-normal text-ink-3">{unitLabel(r.unit)}</span>
                      {isGlucoseCode(r.code) && latest.valueNum !== null && <div className="text-[11px] font-normal text-ink-3">{mmolToMg(latest.valueNum)} mg/dL</div>}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Sparkline values={r.values} refLow={r.refLow} refHigh={r.refHigh} />
                    </td>
                  </Hover>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    ),
    abnormal: show("abnormal") && (
      <Panel title="Recent abnormal results" href={`${base}/results`}>
        {latestAbnormal.length === 0 ? (
          <Empty>No abnormal results in the last 4 months.</Empty>
        ) : (
          <table className="w-full">
            <tbody>
              {latestAbnormal.map((o) => (
                <Hover as="tr" key={o.id} className="border-t border-line first:border-t-0" card={<ResultCard o={o} report={o.report} imported={o.report?.source === "imported"} />}>
                  <td className="px-3 py-1.5">
                    <Link href={resultHref(base, o, o.report?.display)} className="hover:text-accent">
                      {o.display}
                    </Link>
                  </td>
                  <td className={`tabular px-2 py-1.5 text-right font-medium ${flagText(o.flag)}`}>
                    {fmtValue(o)}
                    <FlagBadge flag={o.flag} />
                  </td>
                  <td className="tabular px-2 py-1.5 text-ink-3">{fmtRange(o)}</td>
                  <td className="tabular px-3 py-1.5 text-right text-ink-3">{fmtShortDate(o.effectiveAt)}</td>
                </Hover>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    ),
    notes: show("notes") && (
      <Panel title="Recent notes" href={`${base}/notes`}>
        {notes.length === 0 ? (
          <Empty>No notes.</Empty>
        ) : (
          <ul>
            {notes.map((n) => (
              <Hover as="li" key={n.id} className="border-t border-line first:border-t-0" card={<NoteCard n={n} />} width={360}>
                <Link href={`${base}/notes?note=${n.id}`} className="block px-3 py-1.5 hover:bg-accent-soft/40">
                  <div className="flex justify-between">
                    <span className="font-medium">{n.title}</span>
                    <span className="text-ink-3">{relativeDays(n.serviceAt)}</span>
                  </div>
                  <div className="text-ink-2">
                    {n.author.name}, {n.author.credentials ?? ""} ·{" "}
                    {n.status === "draft" ? (
                      <span className="text-warn">Pended</span>
                    ) : n.status === "pending_cosign" ? (
                      <span className="text-low">Needs cosign</span>
                    ) : (
                      `Signed ${n.signedAt ? fmtDate(n.signedAt) : ""}`
                    )}
                  </div>
                </Link>
              </Hover>
            ))}
          </ul>
        )}
      </Panel>
    ),
    outside: show("outside") && outside.length > 0 && (
        <Panel title="Outside records" href={`${base}/documents`}>
          <ul>
            {outside.map((d) => {
              const c = readContent(d.content);
              return (
                <Hover
                  as="li"
                  key={d.id}
                  className="border-t border-line first:border-t-0"
                  width={360}
                  card={
                    <HoverHint title={d.title}>
                      <span className="block text-[11.5px] text-ink-3">
                        {[d.organization, d.author, fmtDateOnly(d.serviceDate)].filter(Boolean).join(" · ")}
                      </span>
                      {c.impression && <span className="mt-1 block">{c.impression}</span>}
                      {c.followUps.length > 0 && (
                        <span className="mt-1 block text-warn">
                          Follow up: {c.followUps.map((f) => f.text).join("; ")}
                        </span>
                      )}
                    </HoverHint>
                  }
                >
                  <Link href={`${base}/documents?doc=${d.id}`} className="block px-3 py-1.5 hover:bg-accent-soft/40">
                    <div className="flex items-center gap-2">
                      <DocTypeChip type={d.type} />
                      <span className="min-w-0 flex-1 truncate font-medium">{d.title}</span>
                      <span className="shrink-0 text-ink-3">{fmtDateOnly(d.serviceDate)}</span>
                    </div>
                    {c.impression && <div className="mt-0.5 line-clamp-2 text-[12px] text-ink-2">{c.impression}</div>}
                    {c.followUps.length > 0 && (
                      <div className="mt-0.5 text-[11.5px] text-warn">
                        {c.followUps.length} follow-up {c.followUps.length === 1 ? "item" : "items"}
                      </div>
                    )}
                  </Link>
                </Hover>
              );
            })}
          </ul>
        </Panel>
    ),
  };

  return (
    <>
    {registered}
    <Arrange area="summary" order={movableOrder(prefs, "summary")} drag={prefs.drag} wide={prefs.wide}>
    <div className="flex justify-end px-4 pt-3">
      <ViewMenu label="Summary panels" area="summary" items={viewArea("summary").items} hidden={prefs.hidden} />
    </div>
    <SummaryGrid panels={Object.entries(panels).flatMap(([k, node]) => (node ? [{ key: `summary:${k}`, node }] : []))} />
    </Arrange>
    </>
  );
}

// Front desk sees who the patient is and when they're coming in, not their clinical record.
async function FrontDeskSummary({ patientId }: { patientId: string }) {
  const [patient, upcoming] = await Promise.all([
    db.patient.findUniqueOrThrow({ where: { id: patientId }, include: { pcp: true, preferredPharmacy: true, registeredBy: true } }),
    db.encounter.findMany({
      where: { patientId, start: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, status: { not: "cancelled" } },
      orderBy: { start: "asc" },
      take: 10,
      include: { provider: true },
    }),
  ]);
  return (
    <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-2">
      <Panel title="Demographics">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 px-3 py-2">
          <dt className="text-ink-3">Name</dt>
          <dd>
            {patient.firstName} {patient.lastName}
          </dd>
          <dt className="text-ink-3">Date of birth</dt>
          <dd className="tabular">{fmtDob(patient.dob)}</dd>
          <dt className="text-ink-3">MRN</dt>
          <dd className="font-mono">{patient.mrn}</dd>
          {patient.preferredName && (
            <>
              <dt className="text-ink-3">Preferred name</dt>
              <dd>{patient.preferredName}</dd>
            </>
          )}
          <dt className="text-ink-3">Phone</dt>
          <dd className="tabular">{patient.phone ?? "—"}</dd>
          {patient.email && (
            <>
              <dt className="text-ink-3">Email</dt>
              <dd>{patient.email}</dd>
            </>
          )}
          <dt className="text-ink-3">Address</dt>
          <dd>{patient.address ?? "—"}</dd>
          <dt className="text-ink-3">Language</dt>
          <dd>{patient.preferredLanguage}</dd>
          <dt className="text-ink-3">PCP</dt>
          <dd>{patient.pcp ? `${patient.pcp.name}${patient.pcp.credentials ? `, ${patient.pcp.credentials}` : ""}` : "None"}</dd>
          <dt className="text-ink-3">Pharmacy</dt>
          <dd>{patient.preferredPharmacy?.name ?? "None"}</dd>
          <dt className="text-ink-3">Emergency contact</dt>
          <dd>
            {patient.emergencyContactName
              ? [patient.emergencyContactName, patient.emergencyContactRelation, patient.emergencyContactPhone].filter(Boolean).join(" · ")
              : "—"}
          </dd>
          <dt className="text-ink-3">Coverage</dt>
          <dd>
            {patient.insurancePayer ? (
              <>
                {patient.insurancePayer} <span className="font-mono">{patient.insuranceMemberId}</span>
                {patient.insuranceGroup && <span className="text-ink-3"> · group {patient.insuranceGroup}</span>}
                {patient.subscriberName && <span className="text-ink-3"> · holder {patient.subscriberName} ({patient.subscriberRelation?.toLowerCase()})</span>}
              </>
            ) : (
              "Self-pay"
            )}
          </dd>
          {patient.registeredBy && (
            <>
              <dt className="text-ink-3">Registered</dt>
              <dd>
                {fmtDate(patient.createdAt)} by {patient.registeredBy.name}
              </dd>
            </>
          )}
        </dl>
      </Panel>
      <Panel title="Upcoming appointments">
        {upcoming.length === 0 ? (
          <Empty>No upcoming appointments.</Empty>
        ) : (
          <ul>
            {upcoming.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 border-t border-line px-3 py-1.5 first:border-t-0">
                <span className="tabular font-medium">
                  {fmtDate(e.start)} {fmtTime(e.start)}
                </span>
                <span className="text-ink-2">
                  {e.reason} · {e.provider?.name} · <span className="capitalize">{e.status.replace("_", " ")}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// Shown once, right after registration: the new MRN and the usual next step.
async function Registered({ patientId, canBook }: { patientId: string; canBook: boolean }) {
  const p = await db.patient.findUnique({ where: { id: patientId }, select: { firstName: true, lastName: true, mrn: true } });
  if (!p) return null;
  return (
    <div role="status" className="mx-4 mt-4 flex items-center gap-3 rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-ok">
      <span>
        Registered {p.firstName} {p.lastName}. MRN <span className="font-mono font-semibold">{p.mrn}</span>.
      </span>
      {canBook && (
        <Link href={`/schedule/book?patient=${patientId}`} className="ml-auto rounded border border-accent bg-accent px-2.5 py-1 text-[12.5px] font-medium text-white hover:bg-accent/90">
          Make appointment
        </Link>
      )}
    </div>
  );
}

async function MedsReviewed({ patientId }: { patientId: string }) {
  const p = await db.patient.findUnique({ where: { id: patientId }, select: { medsReviewedAt: true, medsReviewedBy: { select: { name: true } } } });
  if (!p?.medsReviewedAt) return <span className="text-[11.5px] text-warn">Not reviewed</span>;
  return (
    <span className="text-[11.5px] text-ink-3">
      Reviewed {relativeDays(p.medsReviewedAt)}
      {p.medsReviewedBy && ` by ${p.medsReviewedBy.name}`}
    </span>
  );
}
