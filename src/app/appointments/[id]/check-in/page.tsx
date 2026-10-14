import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { age, fmtDob, fmtTime, fullName, sexShort } from "@/lib/format";
import { visitType } from "@/lib/scheduling/visit-types";
import { Button, Field, inputCls } from "@/components/form";
import { Panel } from "@/components/panel";
import { checkInPatient } from "@/app/schedule/actions";
import { LANGUAGES } from "@/lib/registration/registration";
import { PAYMENT_METHODS } from "@/lib/scheduling/workflow";

export const dynamic = "force-dynamic";


// Front desk check-in: confirm who the patient is, how to reach them and their
// coverage, take the visit fee if there is one, then mark them arrived.
export default async function CheckIn({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const { id } = await params;
  const { error } = await searchParams;
  await requirePermission("checkIn");
  const appt = await db.encounter.findUnique({ where: { id }, include: { patient: true, provider: true } });
  if (!appt) notFound();
  if (appt.status !== "planned") redirect(`/appointments/${id}`);
  const p = appt.patient;
  const vt = visitType(appt.visitType);
  const late = Date.now() - appt.start.getTime() > 15 * 60_000;

  return (
    <main className="h-full overflow-y-auto">
      <form action={checkInPatient.bind(null, appt.id)} className="mx-auto max-w-3xl space-y-4 p-5">
        <input type="hidden" name="next" value="/" />
        <div>
          <h1 className="text-xl font-semibold">Check in {fullName(p)}</h1>
          <p className="text-ink-2">
            {fmtTime(appt.start)} {vt.label.toLowerCase()} with {appt.provider?.name}
            {appt.reason && appt.reason !== vt.label ? ` · ${appt.reason}` : ""}
          </p>
          {late && <p className="mt-1 text-high">Arriving more than 15 minutes after the appointment time.</p>}
        </div>

        <Panel title="Confirm identity">
          <p className="px-3 py-2">
            Ask for name and date of birth: <span className="font-medium">{p.firstName} {p.lastName}</span>, born{" "}
            <span className="tabular font-medium">{fmtDob(p.dob)}</span> ({age(p.dob)} y {sexShort(p.sex)}), MRN <span className="font-mono">{p.mrn}</span>.
          </p>
        </Panel>

        <Panel title="Contact">
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-[180px_1fr_160px]">
            <Field label="Phone">
              <input name="phone" defaultValue={p.phone ?? ""} className={inputCls} />
            </Field>
            <Field label="Address">
              <input name="address" defaultValue={p.address ?? ""} className={inputCls} />
            </Field>
            <Field label="Preferred language">
              <select name="language" defaultValue={LANGUAGES.includes(p.preferredLanguage) ? p.preferredLanguage : "Other"} className={inputCls}>
                {LANGUAGES.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </Field>
          </div>
        </Panel>

        <Panel title="Coverage">
          <div className="grid grid-cols-1 gap-3 p-3 sm:grid-cols-2">
            <Field label="Insurance (blank for self-pay)">
              <input name="insurancePayer" defaultValue={p.insurancePayer ?? ""} className={inputCls} />
            </Field>
            <Field label="Member ID">
              <input name="insuranceMemberId" defaultValue={p.insuranceMemberId ?? ""} className={`${inputCls} font-mono`} />
            </Field>
          </div>
        </Panel>

        <Panel title="Payment">
          <div className="flex flex-wrap items-end gap-3 p-3">
            <Field label="Amount paid (৳)">
              <input name="copay" type="number" min={0} step="any" inputMode="decimal" placeholder="0" className={`${inputCls} w-28`} />
            </Field>
            <fieldset className="flex items-center gap-3 pb-1">
              {PAYMENT_METHODS.map((m) => (
                <label key={m.id} className="flex items-center gap-1">
                  <input type="radio" name="copayMethod" value={m.id} />
                  {m.label}
                </label>
              ))}
            </fieldset>
            <span className="pb-1 text-[12px] text-ink-3">Leave blank if nothing was paid.</span>
          </div>
          {error === "payment" && <p className="px-3 pb-3 text-crit">Choose how it was paid.</p>}
        </Panel>

        <div className="flex items-center gap-3">
          <Button type="submit">Check in</Button>
          <Link href={`/appointments/${appt.id}`} className="text-ink-2 hover:text-accent">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
