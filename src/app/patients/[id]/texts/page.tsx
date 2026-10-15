import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { brand } from "@/lib/brand";
import { fmtDateTime } from "@/lib/format";
import { gatewayProblem } from "@/lib/sms/gateway";
import { cantText, sendStuckTexts } from "@/lib/sms/server";
import { localNumber, smsLang, smsNumber } from "@/lib/sms/sms";
import { Empty, Panel } from "@/components/panel";
import { ActionButton } from "@/components/action-button";
import { TextComposer } from "@/components/sms/text-composer";
import { RefreshWhileSending } from "@/components/sms/refresh-while-sending";
import { SmsStatusChip, SMS_KIND_LABEL } from "@/components/sms/sms-bits";
import { logChartView } from "@/lib/audit/server";
import { resendText, setTextsOff } from "./actions";

export const dynamic = "force-dynamic";

// Text messages to the patient's phone: the ones sent automatically when prescriptions and
// orders are signed, ones staff typed, and whether the patient wants texts at all.
export default async function Texts({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePermission("textPatients");
  await logChartView(id, "Texts");
  await sendStuckTexts({ patientId: id });
  const [patient, messages] = await Promise.all([
    db.patient.findUnique({ where: { id }, select: { phone: true, preferredLanguage: true, smsOptOutAt: true, smsOptOutById: true } }),
    db.smsMessage.findMany({ where: { patientId: id }, orderBy: { createdAt: "desc" }, take: 200, include: { sentBy: { select: { name: true } } } }),
  ]);
  if (!patient) notFound();
  const optedOutBy = patient.smsOptOutById ? await db.practitioner.findUnique({ where: { id: patient.smsOptOutById }, select: { name: true } }) : null;
  const why = cantText(patient);
  const to = smsNumber(patient.phone);
  const problem = gatewayProblem();
  // "Send again" only on the latest try of a failed text, so one failure isn't resent twice.
  const seen = new Set<string>();
  const retryable = new Set(messages.filter((m) => !seen.has(m.body) && seen.add(m.body) && m.status === "failed").map((m) => m.id));

  return (
    <div className="space-y-3 p-4">
      <RefreshWhileSending sending={messages.some((m) => m.status === "queued")} />
      {problem && <p className="rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[12.5px] text-ink">{problem}</p>}

      <Panel
        title="Text the patient"
        action={
          patient.smsOptOutAt ? (
            <ActionButton action={setTextsOff.bind(null, id, false)}>Turn texts back on</ActionButton>
          ) : (
            <ActionButton action={setTextsOff.bind(null, id, true)} variant="ghost" confirm="Turn off texts for this patient? Nothing will be sent to their phone, including texts when prescriptions and orders are signed.">
              Patient doesn&apos;t want texts
            </ActionButton>
          )
        }
      >
        <div className="border-b border-line px-3 py-2 text-[12.5px] text-ink-2">
          {patient.smsOptOutAt ? (
            <span className="font-medium text-crit">
              Texts are off. The patient asked not to get them ({fmtDateTime(patient.smsOptOutAt)}
              {optedOutBy && `, recorded by ${optedOutBy.name}`}).
            </span>
          ) : to ? (
            <>
              Texts go to <span className="tabular font-medium text-ink">{localNumber(to)}</span> in {smsLang(patient.preferredLanguage) === "bn" ? "Bangla" : "English"}. A text is sent
              automatically when prescriptions or orders are signed or a refill is approved.
            </>
          ) : (
            <>
              {why}{" "}
              {can(user.role, "registerPatients") && (
                <Link href={`/patients/${id}/edit`} className="text-accent hover:underline">
                  Update the phone number
                </Link>
              )}
            </>
          )}
        </div>
        {!why && to && <TextComposer patientId={id} sender={brand.shortName} lang={smsLang(patient.preferredLanguage)} to={localNumber(to)} />}
      </Panel>

      <Panel title="Texts sent">
        {messages.length ? (
          <table className="w-full text-[12.5px]">
            <thead className="bg-panel-muted text-left text-[11.5px] text-ink-3">
              <tr>
                <th className="w-40 px-3 py-1.5 font-medium">When</th>
                <th className="px-3 py-1.5 font-medium">Text</th>
                <th className="w-36 px-3 py-1.5 font-medium">Why</th>
                <th className="w-44 px-3 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id} className="border-t border-line align-top">
                  <td className="tabular whitespace-nowrap px-3 py-2">
                    {fmtDateTime(m.createdAt)}
                    <span className="block text-[11px] text-ink-3">{localNumber(m.to)}</span>
                  </td>
                  <td className="whitespace-pre-wrap px-3 py-2">{m.body}</td>
                  <td className="px-3 py-2 text-ink-2">
                    {SMS_KIND_LABEL[m.kind]}
                    {m.sentBy && <span className="block text-[11px] text-ink-3">{m.sentBy.name}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <SmsStatusChip status={m.status} />
                    {m.error && <span className="mt-0.5 block text-[11px] text-ink-3">{m.error}</span>}
                    {retryable.has(m.id) && !why && (
                      <ActionButton action={resendText.bind(null, id, m.id)} className="mt-1">
                        Send again
                      </ActionButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty>No texts yet.</Empty>
        )}
      </Panel>
    </div>
  );
}
