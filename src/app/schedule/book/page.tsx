import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { age, fmtDate, fmtDayShort, fmtDob, fmtTime, fullName, parseLocalDate, sexShort, toLocalDate, toLocalDateTime } from "@/lib/format";
import { findSlots, isOpen, scheduledProviders } from "@/lib/scheduling/server";
import { VISIT_TYPES, isVisitType, visitType } from "@/lib/scheduling/visit-types";
import { inputCls, Field } from "@/components/form";
import { Panel, Empty } from "@/components/panel";
import { BookForm } from "./book-form";

export const dynamic = "force-dynamic";

type Params = { patient?: string; q?: string; type?: string; provider?: string; from?: string; start?: string; reschedule?: string; reason?: string };

const DAYS = 14;

// Make (or reschedule) an appointment: pick the patient, visit type and provider,
// then a time from the open slots, then confirm. Everything up to the confirmation
// is a plain GET form, so each step is a link that can be shared or reloaded.
export default async function Book({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  await requirePermission("bookAppointments");

  const moving = sp.reschedule
    ? await db.encounter.findUnique({ where: { id: sp.reschedule }, include: { provider: true } })
    : null;
  const patientId = sp.patient ?? moving?.patientId;
  const typeId = sp.type && isVisitType(sp.type) ? sp.type : (moving?.visitType ?? "follow_up");
  const vt = visitType(typeId);
  const providers = await scheduledProviders();
  const from = sp.from ? parseLocalDate(sp.from) : new Date();
  const start = sp.start ? new Date(sp.start) : null;
  const reason = sp.reason ?? moving?.reason ?? "";

  const [patient, matches] = await Promise.all([
    patientId ? db.patient.findUnique({ where: { id: patientId }, include: { pcp: true } }) : null,
    !patientId && sp.q && sp.q.trim().length >= 2 ? searchPatients(sp.q.trim()) : [],
  ]);
  // "any" searches every provider; with no choice yet, default to the appointment
  // being moved, else the patient's PCP when they keep a schedule.
  const pcpScheduled = patient?.pcpId && providers.some((p) => p.id === patient.pcpId) ? patient.pcpId : "";
  const effectiveProvider = sp.provider === "any" ? "" : (sp.provider ?? moving?.providerId ?? pcpScheduled);
  const slotDays =
    patient && !start
      ? await findSlots({ providerIds: effectiveProvider ? [effectiveProvider] : providers.map((p) => p.id), minutes: vt.minutes, from, days: DAYS })
      : [];
  const startOpen = start && effectiveProvider ? await isOpen(effectiveProvider, start, new Date(start.getTime() + vt.minutes * 60_000), moving?.id) : true;

  const keep = (over: Partial<Params>) => {
    const params = new URLSearchParams();
    const merged: Params = { patient: patientId, type: typeId, provider: sp.provider ?? (effectiveProvider || undefined), from: sp.from, reschedule: sp.reschedule, reason: sp.reason, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/schedule/book?${params}`;
  };
  const providerName = (id: string) => providers.find((p) => p.id === id)?.name ?? "";

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-5">
        <div className="mb-3 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">{moving ? "Reschedule appointment" : "Make appointment"}</h1>
          <Link href="/schedule" className="text-ink-3 hover:text-accent">
            Back to schedule
          </Link>
        </div>
        {moving && (
          <p className="mb-3 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-warn">
            Moving the {visitType(moving.visitType).label.toLowerCase()} on {fmtDate(moving.start)} at {fmtTime(moving.start)} with {moving.provider?.name}. The old time is
            released when you confirm the new one.
          </p>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
          <div className="space-y-3">
            <Panel title="1. Patient">
              {patient ? (
                <div className="flex items-start justify-between gap-2 px-3 py-2">
                  <div>
                    <div className="font-semibold">{fullName(patient)}</div>
                    <div className="text-ink-3">
                      {age(patient.dob)} y {sexShort(patient.sex)} · {fmtDob(patient.dob)} · {patient.mrn}
                    </div>
                    <div className="text-ink-3">PCP {patient.pcp?.name ?? "none"}</div>
                  </div>
                  {!moving && (
                    <Link href={keep({ patient: undefined, provider: sp.provider })} className="text-[12px] text-accent hover:underline">
                      Change
                    </Link>
                  )}
                </div>
              ) : (
                <div className="p-3">
                  <form action="/schedule/book" className="flex gap-1.5">
                    {sp.start && <input type="hidden" name="start" value={sp.start} />}
                    {sp.provider && <input type="hidden" name="provider" value={sp.provider} />}
                    {sp.type && <input type="hidden" name="type" value={sp.type} />}
                    <input name="q" defaultValue={sp.q} autoFocus placeholder="Name, MRN or MM/DD/YYYY" className={`${inputCls} min-w-0 flex-1`} />
                    <button className="rounded border border-line px-2.5 text-[12.5px] hover:bg-panel-muted">Search</button>
                  </form>
                  {sp.q && (
                    <ul className="mt-2">
                      {matches.length === 0 && <li className="py-1 text-ink-3">No patients found.</li>}
                      {matches.map((m) => (
                        <li key={m.id}>
                          <Link href={keep({ patient: m.id, q: undefined, provider: sp.provider })} className="-mx-1.5 block rounded px-1.5 py-1 hover:bg-accent-soft">
                            <span className="font-medium">{fullName(m)}</span>
                            <span className="ml-2 text-ink-3">
                              {age(m.dob)} {sexShort(m.sex)} · {fmtDob(m.dob)} · {m.mrn}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </Panel>

            <Panel title="2. Visit">
              <form key={JSON.stringify(sp)} action="/schedule/book" className="space-y-2 p-3">
                {patientId && <input type="hidden" name="patient" value={patientId} />}
                {sp.reschedule && <input type="hidden" name="reschedule" value={sp.reschedule} />}
                {sp.start && <input type="hidden" name="start" value={sp.start} />}
                <Field label="Visit type">
                  <select name="type" defaultValue={typeId} className={inputCls}>
                    {VISIT_TYPES.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} ({v.minutes} min{v.type === "telehealth" ? ", video" : ""})
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Provider">
                  <select name="provider" defaultValue={effectiveProvider || "any"} className={inputCls}>
                    <option value="any">Any provider</option>
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.credentials ? `, ${p.credentials}` : ""}
                        {p.id === patient?.pcpId ? " (PCP)" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Reason for visit">
                  <input name="reason" defaultValue={reason} placeholder={vt.label} className={inputCls} />
                </Field>
                {!sp.start && (
                  <Field label="Search from">
                    <input type="date" name="from" defaultValue={toLocalDate(from)} className={inputCls} />
                  </Field>
                )}
                <button className="w-full rounded border border-line py-1 text-[12.5px] font-medium hover:bg-panel-muted">{sp.start ? "Update" : "Find open times"}</button>
              </form>
            </Panel>
          </div>

          <div>
            {start ? (
              <Panel title="3. Confirm">
                {!patient ? (
                  <Empty>
                    Find the patient to book {fmtDayShort(start)} at {fmtTime(start)}
                    {effectiveProvider ? ` with ${providerName(effectiveProvider)}` : ""}.
                  </Empty>
                ) : !effectiveProvider ? (
                  <Empty>Choose a provider.</Empty>
                ) : (
                  <BookForm
                    patientId={patient.id}
                    providerId={effectiveProvider}
                    visitType={typeId}
                    start={toLocalDateTime(start)}
                    reason={reason}
                    rescheduleId={moving?.id}
                    open={startOpen}
                    summary={`${fullName(patient)} · ${vt.label} (${vt.minutes} min) · ${fmtDayShort(start)} at ${fmtTime(start)} · ${providerName(effectiveProvider)}`}
                    changeHref={keep({ start: undefined })}
                  />
                )}
              </Panel>
            ) : (
              <Panel title={`3. Open times${effectiveProvider ? ` for ${providerName(effectiveProvider)}` : ", any provider"}`}>
                {!patient ? (
                  <Empty>Find the patient first.</Empty>
                ) : (
                  <SlotList days={slotDays} pick={(s) => keep({ start: toLocalDateTime(s.start), provider: s.providerId })} providerName={effectiveProvider ? null : providerName} />
                )}
                {patient && (
                  <div className="flex justify-end border-t border-line px-3 py-1.5">
                    <Link href={keep({ from: toLocalDate(new Date(from.getTime() + DAYS * 86_400_000)) })} className="text-[12.5px] text-accent hover:underline">
                      Later dates ›
                    </Link>
                  </div>
                )}
              </Panel>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

function SlotList({
  days,
  pick,
  providerName,
}: {
  days: { day: Date; slots: { start: Date; providerId: string }[] }[];
  pick: (s: { start: Date; providerId: string }) => string;
  providerName: ((id: string) => string) | null;
}) {
  const withSlots = days.filter((d) => d.slots.length);
  if (withSlots.length === 0) return <Empty>No open times in the next two weeks. Try later dates or another provider.</Empty>;
  return (
    <ul>
      {withSlots.map((d) => {
        // With "any provider", one row of times per provider.
        const groups = providerName ? [...new Set(d.slots.map((s) => s.providerId))].map((id) => ({ id, slots: d.slots.filter((s) => s.providerId === id) })) : [{ id: "", slots: d.slots }];
        return (
          <li key={d.day.getTime()} className="flex gap-3 border-t border-line px-3 py-2 first:border-t-0">
            <div className="w-24 shrink-0 pt-0.5 font-medium">{fmtDayShort(d.day)}</div>
            <div className="min-w-0 flex-1 space-y-1.5">
              {groups.map((g) => (
                <div key={g.id} className="flex gap-2">
                  {providerName && <div className="w-24 shrink-0 truncate pt-0.5 text-ink-2">{providerName(g.id)}</div>}
                  <div className="flex flex-wrap gap-1.5">
                    {g.slots.map((s) => (
                      <Link
                        key={`${s.providerId}-${s.start.getTime()}`}
                        href={pick(s)}
                        className="tabular rounded border border-accent/30 bg-accent-soft px-2 py-0.5 text-[12px] text-ink hover:border-accent hover:bg-accent hover:text-white"
                      >
                        {fmtTime(s.start)}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function searchPatients(q: string) {
  const words = q.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  const or: Prisma.PatientWhereInput[] = [
    { mrn: { contains: q, mode: "insensitive" } },
    { AND: words.map((w) => ({ OR: [{ firstName: { startsWith: w, mode: "insensitive" as const } }, { lastName: { contains: w, mode: "insensitive" as const } }] })) },
  ];
  const dob = q.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dob) or.push({ dob: new Date(Date.UTC(+dob[3], +dob[1] - 1, +dob[2])) });
  return db.patient.findMany({ where: { OR: or }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 10 });
}
