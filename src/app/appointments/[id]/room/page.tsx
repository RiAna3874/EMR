import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { latestVitals } from "@/lib/chart";
import { fmtTime, fullName } from "@/lib/format";
import { todayRange } from "@/lib/queries";
import { ROOMS, visitType } from "@/lib/scheduling/visit-types";
import { Button, inputCls } from "@/components/form";
import { Panel, Empty } from "@/components/panel";
import { VitalsFields } from "@/components/vitals-fields";
import { roomPatient } from "@/app/schedule/actions";

export const dynamic = "force-dynamic";

// Rooming: pick an exam room, take the chief complaint and vitals, and review
// allergies and medications, so the visit is ready for the provider.
export default async function Room({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; detail?: string }> }) {
  const { id } = await params;
  const { error, detail } = await searchParams;
  const user = await requirePermission("roomPatients");
  const appt = await db.encounter.findUnique({
    where: { id },
    include: {
      provider: true,
      patient: { include: { allergies: true, medications: { where: { status: { in: ["active", "on_hold"] } }, orderBy: { drug: "asc" } } } },
    },
  });
  if (!appt) notFound();
  if (appt.status !== "arrived") redirect(`/appointments/${id}`);
  const p = appt.patient;
  const { start, end } = todayRange();
  const [occupied, vitals] = await Promise.all([
    db.encounter.findMany({ where: { start: { gte: start, lt: end }, status: { in: ["roomed", "in_progress"] }, room: { not: null } }, include: { patient: true } }),
    latestVitals(p.id),
  ]);
  const inRoom = new Map(occupied.map((o) => [o.room!, o]));
  const office = appt.type === "office";
  const lastHeight = vitals.find((v) => v.code === "8302-2")?.valueNum;

  return (
    <main className="h-full overflow-y-auto">
      <form action={roomPatient.bind(null, appt.id)} className="mx-auto max-w-4xl space-y-4 p-5">
        <input type="hidden" name="next" value="/" />
        <div>
          <h1 className="text-xl font-semibold">Room {fullName(p)}</h1>
          <p className="text-ink-2">
            {fmtTime(appt.start)} {visitType(appt.visitType).label.toLowerCase()} with {appt.provider?.name}
            {appt.bookingNote ? ` · Note: ${appt.bookingNote}` : ""}
          </p>
        </div>

        {office && (
          <Panel title="Exam room">
            <div className="flex flex-wrap gap-2 p-3">
              {ROOMS.map((r, i) => {
                const taken = inRoom.get(r);
                return (
                  <label
                    key={r}
                    className={`flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft ${
                      taken ? "border-line bg-panel-muted text-ink-3" : "border-line"
                    }`}
                  >
                    <input type="radio" name="room" value={r} defaultChecked={!taken && ROOMS.findIndex((x) => !inRoom.has(x)) === i} />
                    <span className="font-medium">{r}</span>
                    {taken && <span className="text-[11px]">({taken.patient.lastName})</span>}
                  </label>
                );
              })}
            </div>
            {error === "room" && <p className="px-3 pb-3 text-crit">Pick a room.</p>}
          </Panel>
        )}

        <Panel title="Chief complaint">
          <div className="p-3">
            <input name="chiefComplaint" defaultValue={appt.reason ?? ""} className={`${inputCls} w-full`} />
          </div>
        </Panel>

        {can(user.role, "recordVitals") && (
          <Panel title="Vitals">
            <div className="flex flex-wrap items-end gap-2 p-3">
              <VitalsFields lastHeight={lastHeight} />
            </div>
            {error === "vitals" && detail && <p className="px-3 pb-3 text-crit">{detail}</p>}
          </Panel>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel title="Allergies" action={<Link href={`/patients/${p.id}/allergies`} className="text-[12px] text-accent hover:underline">Edit</Link>}>
            {p.allergies.length === 0 ? (
              <Empty>{p.allergyStatus === "no_known_allergies" ? "No known allergies." : "Not reviewed yet. Ask, and record any on the Allergies tab."}</Empty>
            ) : (
              <ul>
                {p.allergies.map((a) => (
                  <li key={a.id} className="border-t border-line px-3 py-1.5 first:border-t-0">
                    <span className="font-medium">{a.substance}</span>
                    <span className="text-ink-3"> · {a.reaction ?? "reaction not recorded"} · {a.severity}</span>
                  </li>
                ))}
              </ul>
            )}
            <label className="flex items-center gap-2 border-t border-line px-3 py-2 font-medium">
              <input type="checkbox" name="allergiesReviewed" /> Reviewed with patient
            </label>
          </Panel>
          <Panel title="Medications" action={<Link href={`/patients/${p.id}/meds`} className="text-[12px] text-accent hover:underline">Open list</Link>}>
            {p.medications.length === 0 ? (
              <Empty>No active medications.</Empty>
            ) : (
              <ul className="max-h-56 overflow-y-auto">
                {p.medications.map((m) => (
                  <li key={m.id} className="border-t border-line px-3 py-1.5 first:border-t-0">
                    <span className="font-medium">{m.drug}</span>
                    <span className="text-ink-3">
                      {" "}
                      · {m.dose} {m.route}, {m.frequency}
                      {m.status === "on_hold" ? " · on hold" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <label className="flex items-center gap-2 border-t border-line px-3 py-2 font-medium">
              <input type="checkbox" name="medsReviewed" /> Reviewed with patient
            </label>
          </Panel>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit">{office ? "Room patient" : "Ready for provider"}</Button>
          <Link href={`/appointments/${appt.id}`} className="text-ink-2 hover:text-accent">
            Cancel
          </Link>
        </div>
      </form>
    </main>
  );
}
