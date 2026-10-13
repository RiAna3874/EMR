import Link from "next/link";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { fmtDate, fmtTime } from "@/lib/format";
import { visitType } from "@/lib/scheduling/visit-types";
import { Empty, Panel } from "@/components/panel";
import { VisitStatusChip } from "@/components/schedule/status-chip";
import { NextStepButton } from "@/components/schedule/next-step";
import { logChartView } from "@/lib/audit/server";

// The patient's appointments: upcoming first, then past ones including
// cancellations and no-shows. Every role can see and book these.
export default async function Appointments({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  await logChartView(id, "Appointments");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const appts = await db.encounter.findMany({
    where: { patientId: id, type: { in: ["office", "telehealth"] } },
    orderBy: { start: "desc" },
    include: { provider: true },
  });
  const upcoming = appts.filter((a) => a.start >= today && ["planned", "arrived", "roomed", "in_progress", "finished"].includes(a.status)).reverse();
  const past = appts.filter((a) => !upcoming.includes(a));
  const missed = past.filter((a) => a.status === "no_show").length;

  const row = (a: (typeof appts)[number]) => (
    <tr key={a.id} className="border-t border-line hover:bg-accent-soft/40">
      <td className="tabular whitespace-nowrap px-3 py-2">
        <Link href={`/appointments/${a.id}`} className="font-medium hover:text-accent">
          {fmtDate(a.start)} {fmtTime(a.start)}
        </Link>
      </td>
      <td className="px-3 py-2">
        {visitType(a.visitType).label}
        {a.reason && a.reason !== visitType(a.visitType).label && <span className="text-ink-3"> · {a.reason}</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-ink-2">{a.provider?.name}</td>
      <td className="px-3 py-2">
        <VisitStatusChip status={a.status} />
        {a.cancelReason && <span className="ml-2 text-[11.5px] text-ink-3">{a.cancelReason}</span>}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5 text-right">
        {a.start >= today && a.start.getTime() < today.getTime() + 86_400_000 && <NextStepButton appt={a} role={user.role} />}
      </td>
    </tr>
  );
  const table = (list: typeof appts) => (
    <table className="w-full table-fixed">
      <colgroup>
        <col className="w-52" />
        <col />
        <col className="w-40" />
        <col className="w-64" />
        <col className="w-32" />
      </colgroup>
      <tbody>{list.map(row)}</tbody>
    </table>
  );

  return (
    <div className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-ink-2">
          {upcoming.length} upcoming
          {missed > 0 && <span className="ml-2 rounded bg-crit-soft px-1.5 py-0.5 text-[11.5px] font-medium text-crit">{missed} no-show{missed > 1 ? "s" : ""}</span>}
        </p>
        {can(user.role, "bookAppointments") && (
          <Link href={`/schedule/book?patient=${id}`} className="rounded border border-accent bg-accent px-2.5 py-1 text-[12.5px] font-medium text-white hover:bg-accent/90">
            Make appointment
          </Link>
        )}
      </div>
      <Panel title="Upcoming">{upcoming.length ? table(upcoming) : <Empty>No upcoming appointments.</Empty>}</Panel>
      <Panel title="Past and cancelled">{past.length ? table(past) : <Empty>None.</Empty>}</Panel>
    </div>
  );
}
