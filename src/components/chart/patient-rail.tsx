import Link from "next/link";
import type { AllergyIntolerance, Condition, Encounter, Observation, Patient, Practitioner } from "@prisma/client";
import { age, fmtDate, fmtDob, fmtShortDate, fmtTime, sexShort, unitLabel } from "@/lib/format";
import { flagText } from "@/components/flag";

type RailPatient = Patient & {
  pcp: Practitioner | null;
  allergies: AllergyIntolerance[];
  conditions: Condition[];
  encounters: Encounter[];
};

type RailChat = { id: string; name: string; at: Date };

// `clinical` false (front desk) keeps demographics, allergies and the next visit only.
// `chats` is null for a role without secure chat.
export function PatientRail({
  patient: p,
  vitals,
  clinical,
  chats,
  admin = false,
}: {
  patient: RailPatient;
  vitals: Observation[];
  clinical: boolean;
  chats: RailChat[] | null;
  admin?: boolean;
}) {
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
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="text-ink-3">MRN</dt>
          <dd className="font-mono">{p.mrn}</dd>
          <dt className="text-ink-3">PCP</dt>
          <dd>{p.pcp ? `${p.pcp.name}, ${p.pcp.credentials}` : "None"}</dd>
          <dt className="text-ink-3">Language</dt>
          <dd>{p.preferredLanguage}</dd>
          <dt className="text-ink-3">Phone</dt>
          <dd className="tabular">{p.phone}</dd>
        </dl>
        <div className={`mt-3 rounded px-2 py-1 text-center text-[11.5px] font-semibold ${p.codeStatus === "Full code" ? "bg-panel-muted text-ink-2" : "bg-ink text-white"}`}>
          Code status: {p.codeStatus}
        </div>
      </div>

      <RailSection title="Allergies" href={clinical ? `${base}/allergies` : undefined}>
        {p.allergyStatus === "not_reviewed" ? (
          <div className="rounded bg-warn-soft px-2 py-1 font-medium text-warn">Not reviewed</div>
        ) : p.allergies.length === 0 ? (
          <div className="text-ok">No known allergies</div>
        ) : (
          <div className={`rounded px-2 py-1 ${severe ? "bg-crit text-white" : "bg-crit-soft text-crit"}`}>
            {p.allergies.map((a) => (
              <div key={a.id} className="font-medium">
                {a.substance}
                <span className="font-normal opacity-80"> · {a.reaction}</span>
              </div>
            ))}
          </div>
        )}
      </RailSection>

      {clinical && (
        <RailSection title="Active problems" href={`${base}/problems`}>
          {p.conditions.length === 0 ? (
            <div className="text-ink-3">None recorded</div>
          ) : (
            <ul className="space-y-0.5">
              {p.conditions.slice(0, 3).map((c) => (
                <li key={c.id} className="leading-snug">
                  {c.display}
                </li>
              ))}
              {p.conditions.length > 3 && <li className="text-ink-3">+{p.conditions.length - 3} more</li>}
            </ul>
          )}
        </RailSection>
      )}

      {clinical && (
        <RailSection title={vitals[0] ? `Last vitals · ${fmtShortDate(vitals[0].effectiveAt)}` : "Last vitals"} href={`${base}/vitals`}>
          {vitals.length === 0 ? (
            <div className="text-ink-3">None recorded</div>
          ) : (
            <dl className="tabular grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              {bp && (
                <>
                  <dt className="text-ink-3">BP</dt>
                  <dd className={flagText(v["8480-6"]?.flag === "N" ? v["8462-4"]?.flag : v["8480-6"]?.flag)}>{bp}</dd>
                </>
              )}
              {[
                ["8867-4", "HR"],
                ["59408-5", "SpO₂"],
                ["8310-5", "Temp"],
                ["29463-7", "Wt"],
                ["39156-5", "BMI"],
              ].map(([code, label]) =>
                v[code] ? (
                  <RailVital key={code} label={label} o={v[code]} />
                ) : null,
              )}
            </dl>
          )}
        </RailSection>
      )}

      <RailSection title="Next appointment">
        {next ? (
          <div>
            <div>
              {fmtDate(next.start)} {fmtTime(next.start)}
            </div>
            <div className="text-ink-3">{next.reason}</div>
          </div>
        ) : (
          <div className="text-ink-3">None scheduled</div>
        )}
      </RailSection>

      {chats && (
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
    </aside>
  );
}

function RailVital({ label, o }: { label: string; o: Observation }) {
  return (
    <>
      <dt className="text-ink-3">{label}</dt>
      <dd className={flagText(o.flag)}>
        {o.valueNum} {unitLabel(o.unit)}
      </dd>
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
