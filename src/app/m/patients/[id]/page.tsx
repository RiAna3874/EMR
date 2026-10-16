import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { latestVitals } from "@/lib/chart";
import { recentAbnormalLabs } from "@/lib/queries";
import { logChartView } from "@/lib/audit/server";
import { sugarReading } from "@/lib/labs/groups";
import { isGlucoseCode, mmolToMg } from "@/lib/glucose";
import { sigText } from "@/lib/meds/sig";
import { fmtDate, fmtShortDate, fmtTime, fmtValue, relativeDays, unitLabel } from "@/lib/format";
import { FlagBadge, flagText } from "@/components/flag";
import { NoteStatusChip } from "@/components/notes/note-view";
import { PhoneEmpty, PhoneSection, RowLink } from "@/components/phone/header";

export const metadata = { title: "Chart" };

// Haiku's chart summary: what matters at a glance, each part opening its own screen.
export default async function PhoneSummary({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ imported?: string }> }) {
  const { id } = await params;
  const { imported } = await searchParams;
  const user = await requireUser();
  await logChartView(id, "Summary (phone)");
  const base = `/m/patients/${id}`;
  const clinical = can(user.role, "viewClinical");
  const [patient, upcoming] = await Promise.all([
    db.patient.findUniqueOrThrow({ where: { id }, include: { pcp: true } }),
    db.encounter.findMany({
      where: { patientId: id, start: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }, status: { not: "cancelled" } },
      orderBy: { start: "asc" },
      take: 3,
      include: { provider: true },
    }),
  ]);

  const actions = (
    <div className="grid grid-cols-4 gap-2 px-4 pt-3">
      {can(user.role, "addMedia") && <Action href={`${base}/media?add=1`} label="Take photo" icon="camera" />}
      {can(user.role, "importReports") && <Action href={`${base}/import`} label="Import report" icon="scan" />}
      {can(user.role, "useChat") && <Action href={`/m/chat/new?patient=${id}`} label="Message" icon="chat" />}
      {patient.phone && <Action href={`tel:${patient.phone.replace(/[^\d+]/g, "")}`} label="Call patient" icon="phone" />}
    </div>
  );

  const appointments = (
    <PhoneSection title="Upcoming">
      {upcoming.length === 0 ? (
        <PhoneEmpty>No upcoming appointments.</PhoneEmpty>
      ) : (
        upcoming.map((e) => (
          <div key={e.id} className="border-b border-line px-4 py-2.5 last:border-b-0">
            <div className="font-medium">
              {fmtDate(e.start)} · {fmtTime(e.start)}
            </div>
            <div className="text-[13px] text-ink-2">
              {e.reason}
              {e.provider && ` · ${e.provider.name}`}
            </div>
          </div>
        ))
      )}
    </PhoneSection>
  );

  if (!clinical) {
    return (
      <>
        {actions}
        <PhoneSection title="Patient">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-[14px]">
            <dt className="text-ink-3">Phone</dt>
            <dd className="tabular">{patient.phone ?? "—"}</dd>
            <dt className="text-ink-3">Address</dt>
            <dd>{patient.address ?? "—"}</dd>
            <dt className="text-ink-3">Language</dt>
            <dd>{patient.preferredLanguage}</dd>
            <dt className="text-ink-3">PCP</dt>
            <dd>{patient.pcp?.name ?? "None"}</dd>
            <dt className="text-ink-3">Coverage</dt>
            <dd>{patient.insurancePayer ?? "Self-pay"}</dd>
          </dl>
        </PhoneSection>
        {appointments}
      </>
    );
  }

  const [conditions, meds, vitals, abnormal, notes] = await Promise.all([
    db.condition.findMany({ where: { patientId: id, status: "active" }, orderBy: { priority: "asc" } }),
    db.medicationRequest.findMany({ where: { patientId: id, status: { in: ["active", "on_hold"] } }, orderBy: { drug: "asc" } }),
    latestVitals(id),
    recentAbnormalLabs(120, id),
    db.note.findMany({
      where: { patientId: id },
      orderBy: { serviceAt: "desc" },
      take: 4,
      include: { author: true, _count: { select: { addenda: true } } },
    }),
  ]);
  // Only the newest abnormal value per test.
  const seen = new Set<string>();
  const latestAbnormal = abnormal.filter((o) => (seen.has(o.code) ? false : (seen.add(o.code), true))).slice(0, 8);
  const vitalsAt = vitals.find((v) => !isGlucoseCode(v.code))?.effectiveAt ?? vitals[0]?.effectiveAt;

  return (
    <>
      {imported === "1" && (
        <p role="status" className="mx-4 mt-3 rounded-md border border-ok/30 bg-ok/10 px-3 py-2 text-[14px] text-ok">
          Sent for reading. It waits in Imports to verify; check it on a computer before it is filed.
        </p>
      )}
      {actions}

      <PhoneSection title="Active problems">
        {conditions.length === 0 ? (
          <PhoneEmpty>No active problems.</PhoneEmpty>
        ) : (
          conditions.map((c) => (
            <div key={c.id} className="flex items-baseline justify-between gap-3 border-b border-line px-4 py-2.5 last:border-b-0">
              <span>{c.display}</span>
              <span className="shrink-0 font-mono text-[12px] text-ink-3">{c.code}</span>
            </div>
          ))
        )}
      </PhoneSection>

      <PhoneSection title="Abnormal results" action={<Link href={`${base}/results`} className="text-[13px] font-medium text-accent">All results</Link>}>
        {latestAbnormal.length === 0 ? (
          <PhoneEmpty>Nothing abnormal in the last 4 months.</PhoneEmpty>
        ) : (
          latestAbnormal.map((o) => {
            const sugar = sugarReading(o, o.report?.display);
            return (
              <RowLink key={o.id} href={sugar ? `${base}/sugar` : `${base}/results/${encodeURIComponent(o.code)}`}>
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate">{o.display}</span>
                  <span className={`tabular shrink-0 font-semibold ${flagText(o.flag)}`}>
                    {sugar ? sugar.mmol.toFixed(1) : fmtValue(o)}
                    <FlagBadge flag={o.flag} />
                  </span>
                </div>
                <div className="flex justify-between text-[12.5px] text-ink-3">
                  <span>{sugar ? "mmol/L" : unitLabel(o.unit)}</span>
                  <span>{fmtShortDate(o.effectiveAt)}</span>
                </div>
              </RowLink>
            );
          })
        )}
      </PhoneSection>

      <PhoneSection title={vitalsAt ? `Vitals · ${relativeDays(vitalsAt)}` : "Vitals"} action={<Link href={`${base}/vitals`} className="text-[13px] font-medium text-accent">Trend</Link>}>
        {vitals.length === 0 ? (
          <PhoneEmpty>No vitals recorded.</PhoneEmpty>
        ) : (
          <div className="grid grid-cols-2">
            {vitals.map((v) => (
              <div key={v.id} className="border-b border-r border-line px-4 py-2 even:border-r-0">
                <div className="truncate text-[12px] text-ink-3">{v.display}</div>
                <div className={`tabular font-semibold ${flagText(v.flag)}`}>
                  {isGlucoseCode(v.code) && v.valueNum !== null ? v.valueNum.toFixed(1) : fmtValue(v)} <span className="text-[12px] font-normal text-ink-3">{unitLabel(v.unit)}</span>
                  <FlagBadge flag={v.flag} />
                </div>
                {isGlucoseCode(v.code) && v.valueNum !== null && <div className="text-[11.5px] text-ink-3">{mmolToMg(v.valueNum)} mg/dL</div>}
              </div>
            ))}
          </div>
        )}
      </PhoneSection>

      <PhoneSection title="Medications" action={<Link href={`${base}/meds`} className="text-[13px] font-medium text-accent">All meds</Link>}>
        {meds.length === 0 ? (
          <PhoneEmpty>No active medications.</PhoneEmpty>
        ) : (
          meds.map((m) => (
            <div key={m.id} className="border-b border-line px-4 py-2.5 last:border-b-0">
              <div className="font-medium">
                {m.drug}
                {m.status === "on_hold" && <span className="ml-1.5 rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-warn">ON HOLD</span>}
              </div>
              <div className="text-[13px] text-ink-2">{sigText({ dose: m.dose, route: m.route, frequency: m.frequency, prn: m.prn, prnReason: m.prnReason, steps: m.steps })}</div>
            </div>
          ))
        )}
      </PhoneSection>

      <PhoneSection title="Recent notes" action={<Link href={`${base}/notes`} className="text-[13px] font-medium text-accent">All notes</Link>}>
        {notes.length === 0 ? (
          <PhoneEmpty>No notes.</PhoneEmpty>
        ) : (
          notes.map((n) => (
            <RowLink key={n.id} href={`${base}/notes/${n.id}`}>
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{n.title}</span>
                <NoteStatusChip status={n.status} addenda={n._count.addenda} />
              </div>
              <div className="text-[13px] text-ink-3">
                {n.author.name} · {relativeDays(n.serviceAt)}
              </div>
            </RowLink>
          ))
        )}
      </PhoneSection>

      {appointments}
    </>
  );
}

const ICONS: Record<string, React.ReactNode> = {
  camera: (
    <>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </>
  ),
  scan: <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M8 9h8M8 12h8M8 15h5" />,
  chat: <path d="M4 5.5h16v11H9l-5 4v-15Z" />,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1 1A16 16 0 0 1 4 5a1 1 0 0 1 1-1Z" />,
};

function Action({ href, label, icon }: { href: string; label: string; icon: keyof typeof ICONS }) {
  return (
    <Link href={href} className="flex flex-col items-center gap-1 rounded-lg border border-line bg-panel px-1 py-2.5 text-center text-[12px] font-medium leading-tight text-ink-2 active:bg-accent-soft">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-accent" aria-hidden>
        {ICONS[icon]}
      </svg>
      {label}
    </Link>
  );
}
