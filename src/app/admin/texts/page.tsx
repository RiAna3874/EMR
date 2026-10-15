import Link from "next/link";
import type { SmsStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fmtDateTime, fullName } from "@/lib/format";
import { gatewayConfig, gatewayProblem } from "@/lib/sms/gateway";
import { localNumber, smsParts } from "@/lib/sms/sms";
import { sendStuckTexts } from "@/lib/sms/server";
import { SmsStatusChip, SMS_KIND_LABEL } from "@/components/sms/sms-bits";

export const metadata = { title: "Text messages" };
export const dynamic = "force-dynamic";

const PAGE = 100;
const STATUSES: SmsStatus[] = ["sent", "failed", "logged", "queued"];

// Every text sent to patients, for checking that texts go out and what they cost.
export default async function TextLog({ searchParams }: { searchParams: Promise<{ status?: string; before?: string }> }) {
  await requireAdmin();
  await sendStuckTexts();
  const f = await searchParams;
  const status = STATUSES.includes(f.status as SmsStatus) ? (f.status as SmsStatus) : undefined;
  const before = f.before ? new Date(f.before) : null;
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const [rows, month] = await Promise.all([
    db.smsMessage.findMany({
      where: { status, ...(before && !isNaN(before.getTime()) ? { createdAt: { lt: before } } : {}) },
      orderBy: { createdAt: "desc" },
      take: PAGE + 1,
      include: { patient: { select: { id: true, firstName: true, lastName: true, mrn: true } }, sentBy: { select: { name: true } } },
    }),
    db.smsMessage.findMany({ where: { createdAt: { gte: monthStart }, status: "sent" }, select: { body: true } }),
  ]);
  const more = rows.length > PAGE;
  const page = rows.slice(0, PAGE);
  const smsThisMonth = month.reduce((n, m) => n + smsParts(m.body).parts, 0);
  const cfg = gatewayConfig();
  const problem = gatewayProblem();
  const qs = (extra: Record<string, string | undefined>) => new URLSearchParams(Object.entries({ status, ...extra }).filter(([, v]) => v) as [string, string][]).toString();

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-6xl px-6 py-6">
        <h1 className="text-[16px] font-semibold">Text messages</h1>
        <p className="mb-3 text-[12.5px] text-ink-2">
          Texts to patients&apos; phones: sent automatically when prescriptions and orders are signed or a refill is approved, and typed on a chart&apos;s Texts tab.{" "}
          {cfg ? (
            <>
              Sending through <span className="font-medium text-ink">{cfg.provider === "bulksmsbd" ? "BulkSMSBD" : "SSL Wireless"}</span> as &ldquo;{cfg.senderId}&rdquo;.
            </>
          ) : null}{" "}
          {month.length} sent this month ({smsThisMonth} SMS counting long and Bangla texts as several).
        </p>
        {problem && <p className="mb-3 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[12.5px]">{problem} See docs/SMS.md.</p>}

        <div className="mb-3 flex gap-1 text-[12.5px]">
          {[undefined, ...STATUSES].map((s) => (
            <Link
              key={s ?? "all"}
              href={`/admin/texts?${new URLSearchParams(s ? { status: s } : {}).toString()}`}
              className={`rounded border px-2.5 py-1 ${status === s ? "border-accent bg-accent-soft text-accent" : "border-line bg-panel text-ink-2 hover:text-ink"}`}
            >
              {s ? { sent: "Sent", failed: "Failed", logged: "Not sent (no gateway)", queued: "Sending" }[s] : "All"}
            </Link>
          ))}
        </div>

        {page.length === 0 ? (
          <p className="rounded-md border border-line bg-panel px-3 py-6 text-center text-ink-3">No texts{status ? " with that status" : " yet"}.</p>
        ) : (
          <table className="w-full overflow-hidden rounded-md border border-line bg-panel text-[12.5px]">
            <thead className="bg-panel-muted text-left text-[11.5px] text-ink-3">
              <tr>
                <th className="w-40 px-3 py-1.5 font-medium">When</th>
                <th className="w-52 px-3 py-1.5 font-medium">Patient</th>
                <th className="px-3 py-1.5 font-medium">Text</th>
                <th className="w-36 px-3 py-1.5 font-medium">Why</th>
                <th className="w-44 px-3 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {page.map((m) => (
                <tr key={m.id} className="border-t border-line align-top">
                  <td className="tabular whitespace-nowrap px-3 py-1.5">{fmtDateTime(m.createdAt)}</td>
                  <td className="px-3 py-1.5">
                    <Link href={`/patients/${m.patient.id}/texts`} className="hover:underline">
                      {fullName(m.patient)}
                    </Link>
                    <span className="block font-mono text-[11px] text-ink-3">
                      {m.patient.mrn} · {localNumber(m.to)}
                    </span>
                  </td>
                  <td className="whitespace-pre-wrap px-3 py-1.5">{m.body}</td>
                  <td className="px-3 py-1.5 text-ink-2">
                    {SMS_KIND_LABEL[m.kind]}
                    {m.sentBy && <span className="block text-[11px] text-ink-3">{m.sentBy.name}</span>}
                  </td>
                  <td className="px-3 py-1.5">
                    <SmsStatusChip status={m.status} />
                    {m.error && <span className="mt-0.5 block text-[11px] text-ink-3">{m.error}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {more && (
          <div className="mt-3 text-center">
            <Link href={`/admin/texts?${qs({ before: page[page.length - 1].createdAt.toISOString() })}`} className="text-accent hover:underline">
              Older texts
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
