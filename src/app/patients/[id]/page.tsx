import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { pivot } from "@/lib/chart";
import { recentAbnormalLabs } from "@/lib/queries";
import { fmtDate, fmtDob, fmtRange, fmtShortDate, fmtTime, fmtValue, relativeDays, unitLabel } from "@/lib/format";
import { Empty, Panel } from "@/components/panel";
import { FlagBadge, flagText } from "@/components/flag";
import { Sparkline } from "@/components/sparkline";
import { sigText } from "@/lib/meds/sig";

const vitalCodes = ["8480-6", "8462-4", "8867-4", "59408-5", "29463-7", "39156-5"];

export default async function Summary({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const base = `/patients/${id}`;
  const currentUser = await requireUser();
  if (!can(currentUser.role, "viewClinical")) return <FrontDeskSummary patientId={id} />;
  const [conditions, meds, allergies, vitals, abnormal, notes, upcoming] = await Promise.all([
    db.condition.findMany({ where: { patientId: id, status: "active" }, orderBy: { priority: "asc" } }),
    db.medicationRequest.findMany({ where: { patientId: id, status: { in: ["active", "on_hold"] } }, orderBy: { drug: "asc" } }),
    db.allergyIntolerance.findMany({ where: { patientId: id } }),
    db.observation.findMany({ where: { patientId: id, category: "vital_signs", code: { in: vitalCodes } } }),
    recentAbnormalLabs(120, id),
    db.note.findMany({ where: { patientId: id }, orderBy: { serviceAt: "desc" }, take: 5, include: { author: true } }),
    db.encounter.findMany({
      where: { patientId: id, start: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, status: { not: "cancelled" } },
      orderBy: { start: "asc" },
      take: 3,
      include: { provider: true },
    }),
  ]);
  const vitalRows = pivot(vitals).rows;
  vitalRows.sort((a, b) => vitalCodes.indexOf(a.code) - vitalCodes.indexOf(b.code));

  // Only the newest abnormal value per test.
  const seen = new Set<string>();
  const latestAbnormal = abnormal.filter((o) => (seen.has(o.code) ? false : (seen.add(o.code), true)));

  return (
    <div className="grid grid-cols-1 gap-3 p-4 xl:grid-cols-3">
      <Panel title="Active problems" href={`${base}/problems`}>
        {conditions.length === 0 ? (
          <Empty>No active problems.</Empty>
        ) : (
          <ul>
            {conditions.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 border-t border-line px-3 py-1.5 first:border-t-0">
                <span>{c.display}</span>
                <span className="shrink-0 font-mono text-[11.5px] text-ink-3">{c.code}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

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
              <li key={m.id} className="border-t border-line px-3 py-1.5 first:border-t-0">
                <div className="font-medium">
                  {m.drug}
                  {m.status === "on_hold" && <span className="ml-1.5 rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-warn">ON HOLD</span>}
                </div>
                <div className="text-ink-2">{sigText({ dose: m.dose, route: m.route, frequency: m.frequency, prn: m.prn, prnReason: m.prnReason })}</div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <div className="flex flex-col gap-3">
        <Panel title="Allergies" href={`${base}/allergies`}>
          {allergies.length === 0 ? (
            <Empty>See allergy review status in the sidebar.</Empty>
          ) : (
            <ul>
              {allergies.map((a) => (
                <li key={a.id} className="flex justify-between border-t border-line px-3 py-1.5 first:border-t-0">
                  <span className="font-medium text-crit">{a.substance}</span>
                  <span className="text-ink-2">
                    {a.reaction} · <span className="capitalize">{a.severity}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Upcoming">
          {upcoming.length === 0 ? (
            <Empty>No upcoming appointments.</Empty>
          ) : (
            <ul>
              {upcoming.map((e) => (
                <li key={e.id} className="border-t border-line px-3 py-1.5 first:border-t-0">
                  <div className="font-medium">
                    {fmtDate(e.start)} {fmtTime(e.start)}
                  </div>
                  <div className="text-ink-2">
                    {e.reason} · {e.provider?.name}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Vitals trend" href={`${base}/vitals`}>
        {vitalRows.length === 0 ? (
          <Empty>No vitals recorded.</Empty>
        ) : (
          <table className="w-full">
            <tbody>
              {vitalRows.map((r) => {
                const latest = r.byTime.get(Math.max(...r.byTime.keys()))!;
                return (
                  <tr key={r.code} className="border-t border-line first:border-t-0">
                    <td className="px-3 py-1.5 text-ink-2">{r.display}</td>
                    <td className={`tabular px-2 py-1.5 text-right font-medium ${flagText(latest.flag)}`}>
                      {fmtValue(latest)} <span className="font-normal text-ink-3">{unitLabel(r.unit)}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Sparkline values={r.values} refLow={r.refLow} refHigh={r.refHigh} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Recent abnormal results" href={`${base}/results`}>
        {latestAbnormal.length === 0 ? (
          <Empty>No abnormal results in the last 4 months.</Empty>
        ) : (
          <table className="w-full">
            <tbody>
              {latestAbnormal.map((o) => (
                <tr key={o.id} className="border-t border-line first:border-t-0">
                  <td className="px-3 py-1.5">
                    <Link href={`${base}/results#${o.code}`} className="hover:text-accent">
                      {o.display}
                    </Link>
                  </td>
                  <td className={`tabular px-2 py-1.5 text-right font-medium ${flagText(o.flag)}`}>
                    {fmtValue(o)}
                    <FlagBadge flag={o.flag} />
                  </td>
                  <td className="tabular px-2 py-1.5 text-ink-3">{fmtRange(o)}</td>
                  <td className="tabular px-3 py-1.5 text-right text-ink-3">{fmtShortDate(o.effectiveAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <Panel title="Recent notes" href={`${base}/notes`}>
        {notes.length === 0 ? (
          <Empty>No notes.</Empty>
        ) : (
          <ul>
            {notes.map((n) => (
              <li key={n.id} className="border-t border-line first:border-t-0">
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
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

// Front desk sees who the patient is and when they're coming in, not their clinical record.
async function FrontDeskSummary({ patientId }: { patientId: string }) {
  const [patient, upcoming] = await Promise.all([
    db.patient.findUniqueOrThrow({ where: { id: patientId }, include: { pcp: true } }),
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
          <dt className="text-ink-3">Phone</dt>
          <dd className="tabular">{patient.phone ?? "—"}</dd>
          <dt className="text-ink-3">Address</dt>
          <dd>{patient.address ?? "—"}</dd>
          <dt className="text-ink-3">Language</dt>
          <dd>{patient.preferredLanguage}</dd>
          <dt className="text-ink-3">PCP</dt>
          <dd>{patient.pcp ? `${patient.pcp.name}${patient.pcp.credentials ? `, ${patient.pcp.credentials}` : ""}` : "None"}</dd>
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
