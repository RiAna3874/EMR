import Link from "next/link";
import type { AllergyIntolerance, Condition, Encounter, Observation, Patient, Practitioner } from "@prisma/client";
import { age, fmtDate, fmtDob, fmtShortDate, fmtTime, sexShort, unitLabel } from "@/lib/format";
import { flagText } from "@/components/flag";
import { GLUCOSE_TIMINGS, fmtGlucose, isGlucoseCode } from "@/lib/glucose";
import { Hover } from "@/components/hover/hover-card";
import { HoverHint } from "@/components/hover/card-parts";
import { AllergyCard, ProblemCard, ResultCard, VisitCard } from "@/components/hover/cards";
import { ViewMenu } from "@/components/view-menu";
import { viewArea } from "@/lib/view-prefs";

type RailPatient = Patient & {
  pcp: Practitioner | null;
  allergies: AllergyIntolerance[];
  conditions: Condition[];
  encounters: (Encounter & { provider: Practitioner | null })[];
};

type RailChat = { id: string; name: string; at: Date };

// `clinical` false (front desk) keeps demographics, allergies and the next visit only.
// `chats` is null for a role without secure chat. `hidden` holds sections this person hid
// (View menu at the bottom); allergies and code status always show.
export function PatientRail({
  patient: p,
  vitals,
  clinical,
  chats,
  admin = false,
  hidden = [],
}: {
  patient: RailPatient;
  vitals: Observation[];
  clinical: boolean;
  chats: RailChat[] | null;
  admin?: boolean;
  hidden?: string[];
}) {
  const show = (k: string) => !hidden.includes(`rail:${k}`);
  const railItems = viewArea("rail").items.filter((i) => (clinical || !["rail:problems", "rail:vitals"].includes(i.key)) && (chats || i.key !== "rail:chat"));
  const base = `/patients/${p.id}`;
  const v = Object.fromEntries(vitals.map((o) => [o.code, o]));
  const bp = v["8480-6"] && v["8462-4"] ? `${v["8480-6"].valueNum}/${v["8462-4"].valueNum}` : null;
  const next = p.encounters[0];
  const severe = p.allergies.some((a) => a.severity === "severe");

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-line bg-panel text-[12.5px]">
      <div className="border-b border-line p-4">
        <div className="flex items-center gap-3">
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-chrome-2 text-base font-semibold text-white"
            aria-hidden
          >
            {p.firstName[0]}
            {p.lastName[0]}
          </div>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold leading-tight">
              {p.lastName}, {p.firstName}
            </div>
            <div className="text-ink-2">
              {age(p.dob)} y {sexShort(p.sex)} · {fmtDob(p.dob)}
            </div>
          </div>
        </div>
        {show("details") && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="text-ink-3">MRN</dt>
          <dd className="font-mono">{p.mrn}</dd>
          <dt className="text-ink-3">PCP</dt>
          <dd>{p.pcp ? `${p.pcp.name}, ${p.pcp.credentials}` : "None"}</dd>
          <dt className="text-ink-3">Language</dt>
          <dd>{p.preferredLanguage}</dd>
          <dt className="text-ink-3">Phone</dt>
          <dd className="tabular">
            {p.phone}
            {p.smsOptOutAt && <span className="ml-1.5 whitespace-nowrap rounded bg-crit-soft px-1 text-[10.5px] font-medium text-crit">No texts</span>}
          </dd>
        </dl>
        )}
        <Link href={`${base}/edit`} className="mt-1 inline-block text-[11.5px] text-accent hover:underline">
          Edit patient details
        </Link>
        <Hover
          as="div"
          className={`mt-3 rounded px-2 py-1 text-center text-[11.5px] font-semibold ${p.codeStatus === "Full code" ? "bg-panel-muted text-ink-2" : "bg-ink text-white"}`}
          card={
            <HoverHint title={`Code status: ${p.codeStatus}`}>
              {p.codeStatus === "Full code"
                ? "Full resuscitation if the heart or breathing stops. Change it on Edit patient details."
                : "Limits on resuscitation are recorded. Check before any emergency treatment. Change it on Edit patient details."}
            </HoverHint>
          }
        >
          Code status: {p.codeStatus}
        </Hover>
      </div>

      <RailSection title="Allergies" href={clinical ? `${base}/allergies` : undefined}>
        {p.allergyStatus === "not_reviewed" ? (
          <div className="rounded bg-warn-soft px-2 py-1 font-medium text-warn">Not reviewed</div>
        ) : p.allergies.length === 0 ? (
          <div className="text-ok">No known allergies</div>
        ) : (
          <div className={`rounded px-2 py-1 ${severe ? "bg-crit text-white" : "bg-crit-soft text-crit"}`}>
            {p.allergies.map((a) => (
              <Hover key={a.id} as="div" className="font-medium" card={<AllergyCard a={a} />}>
                {a.substance}
                <span className="font-normal opacity-80"> · {a.reaction}</span>
              </Hover>
            ))}
          </div>
        )}
      </RailSection>

      {clinical && show("problems") && (
        <RailSection title="Active problems" href={`${base}/problems`}>
          {p.conditions.length === 0 ? (
            <div className="text-ink-3">None recorded</div>
          ) : (
            <ul className="space-y-0.5">
              {p.conditions.slice(0, 3).map((c) => (
                <Hover key={c.id} as="li" className="leading-snug" card={<ProblemCard c={c} />}>
                  {c.display}
                </Hover>
              ))}
              {p.conditions.length > 3 && (
                <Hover
                  as="li"
                  className="text-ink-3"
                  card={
                    <HoverHint title="More active problems">
                      {p.conditions.slice(3).map((c) => (
                        <span key={c.id} className="block">
                          {c.display}
                        </span>
                      ))}
                    </HoverHint>
                  }
                >
                  +{p.conditions.length - 3} more
                </Hover>
              )}
            </ul>
          )}
        </RailSection>
      )}

      {clinical && show("vitals") && (
        <RailSection title={vitals[0] ? `Last vitals · ${fmtShortDate(vitals[0].effectiveAt)}` : "Last vitals"} href={`${base}/vitals`}>
          {vitals.length === 0 ? (
            <div className="text-ink-3">None recorded</div>
          ) : (
            <dl className="tabular grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {bp && (
                <>
                  <dt className="text-ink-3">BP</dt>
                  <Hover
                    as="dd"
                    className={flagText(v["8480-6"]?.flag === "N" ? v["8462-4"]?.flag : v["8480-6"]?.flag)}
                    card={
                      <ResultCard
                        o={{ ...v["8480-6"], display: "Blood pressure", valueNum: null, valueText: bp, refLow: null, refHigh: null, refText: null, flag: v["8480-6"].flag === "N" ? v["8462-4"].flag : v["8480-6"].flag }}
                        note={`Systolic ${v["8480-6"].valueNum}, diastolic ${v["8462-4"].valueNum} mmHg.`}
                      />
                    }
                  >
                    {bp}
                  </Hover>
                </>
              )}
              {[
                ["8867-4", "HR"],
                ["59408-5", "SpO₂"],
                ["8310-5", "Temp"],
                ["29463-7", "Wt"],
                ["39156-5", "BMI"],
                ...GLUCOSE_TIMINGS.map((t) => [t.code, t.short]),
              ].map(([code, label]) =>
                v[code] ? (
                  <RailVital key={code} label={label} o={v[code]} setAt={vitals[0].effectiveAt} />
                ) : null,
              )}
            </dl>
          )}
        </RailSection>
      )}

      {show("next") && (
      <RailSection title="Next appointment">
        {next ? (
          <Hover as="div" card={<VisitCard e={next} />}>
            <div>
              {fmtDate(next.start)} {fmtTime(next.start)}
            </div>
            <div className="text-ink-3">{next.reason}</div>
          </Hover>
        ) : (
          <div className="text-ink-3">None scheduled</div>
        )}
      </RailSection>
      )}

      {chats && show("chat") && (
        <RailSection title="Secure chat">
          {chats.length > 0 && (
            <ul className="mb-1.5 space-y-0.5">
              {chats.map((c) => (
                <li key={c.id}>
                  <Link href={`/messages/${c.id}`} className="flex gap-2 hover:text-accent">
                    <span className="truncate">{c.name}</span>
                    <span className="ml-auto shrink-0 text-ink-3">{fmtShortDate(c.at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/messages/new?patient=${p.id}${p.pcpId ? `&to=${p.pcpId}` : ""}`}
            className="inline-block rounded border border-line px-2 py-0.5 text-[12px] font-medium text-accent hover:bg-accent-soft"
          >
            Message about this patient
          </Link>
        </RailSection>
      )}
      {admin && (
        <div className="px-3 py-2 text-[12px]">
          <Link href={`/admin/access-log?patient=${p.id}`} className="text-ink-3 hover:text-accent hover:underline">
            Who has opened this chart
          </Link>
        </div>
      )}
      <div className="mt-auto flex justify-end px-3 py-2">
        <ViewMenu label="Patient sidebar" items={railItems} hidden={hidden} tone="subtle" align="left" />
      </div>
    </aside>
  );
}

function RailVital({ label, o, setAt }: { label: string; o: Observation; setAt?: Date }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <Hover as="dd" className={flagText(o.flag)} card={<ResultCard o={o} />}>
        {o.valueNum !== null && isGlucoseCode(o.code) ? fmtGlucose(o.valueNum) : `${o.valueNum} ${unitLabel(o.unit)}`}
        {isGlucoseCode(o.code) && setAt && fmtShortDate(o.effectiveAt) !== fmtShortDate(setAt) && <span className="text-ink-3"> · {fmtShortDate(o.effectiveAt)}</span>}
      </Hover>
    </>
  );
}

function RailSection({ title, href, children }: { title: string; href?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-4 py-3">
      <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        {href ? (
          <Link href={href} className="hover:text-accent">
            {title}
          </Link>
        ) : (
          title
        )}
      </h3>
      {children}
    </section>
  );
}
