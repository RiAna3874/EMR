import Link from "next/link";
import { db } from "@/lib/db";
import { todayRange } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { isProvider } from "@/lib/roles";
import { age, fmtDob, fmtTime, fullName, sexShort } from "@/lib/format";
import { PhoneEmpty, PhoneHeader, PhoneSection, RowLink } from "@/components/phone/header";
import { PatientSearch } from "@/components/phone/patient-search";

export const metadata = { title: "Patients" };

const LISTS = { today: "Clinic today", mine: "My patients" } as const;

// Haiku's patient lists: search on top, then today's clinic or the provider's own panel.
export default async function PhonePatients({ searchParams }: { searchParams: Promise<{ list?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const lists = (Object.keys(LISTS) as (keyof typeof LISTS)[]).filter((k) => k !== "mine" || isProvider(user.role));
  const list = lists.find((l) => l === sp.list) ?? "today";
  const { start, end } = todayRange();
  const patients = await db.patient.findMany({
    where: list === "mine" ? { pcpId: user.id, mergedIntoId: null } : { encounters: { some: { start: { gte: start, lt: end }, status: { not: "cancelled" } } } },
    include: { encounters: { where: { start: { gte: start, lt: end }, status: { not: "cancelled" } }, orderBy: { start: "asc" }, take: 1 } },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: 200,
  });
  if (list === "today") patients.sort((a, b) => (a.encounters[0]?.start.getTime() ?? 0) - (b.encounters[0]?.start.getTime() ?? 0));

  return (
    <>
      <PhoneHeader title="Patients" />
      <PatientSearch />
      {lists.length > 1 && (
        <div className="flex gap-2 px-4 pt-4">
          {lists.map((l) => (
            <Link
              key={l}
              href={`/m/patients?list=${l}`}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-medium ${l === list ? "border-chrome bg-chrome text-white" : "border-line bg-panel text-ink-2"}`}
            >
              {LISTS[l]}
            </Link>
          ))}
        </div>
      )}
      <PhoneSection title={LISTS[list]}>
        {patients.length === 0 ? (
          <PhoneEmpty>{list === "mine" ? "No patients list you as their PCP." : "No one is booked today."}</PhoneEmpty>
        ) : (
          patients.map((p) => (
            <RowLink key={p.id} href={`/m/patients/${p.id}`}>
              <div className="flex items-baseline gap-2">
                <span className="truncate font-semibold">{fullName(p)}</span>
                {list === "today" && p.encounters[0] && <span className="tabular ml-auto shrink-0 text-[13px] text-ink-2">{fmtTime(p.encounters[0].start)}</span>}
              </div>
              <div className="truncate text-[13px] text-ink-3">
                {age(p.dob)} y {sexShort(p.sex)} · {fmtDob(p.dob)} · {p.mrn}
              </div>
            </RowLink>
          ))
        )}
      </PhoneSection>
    </>
  );
}
