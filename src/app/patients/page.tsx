import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { todayRange } from "@/lib/queries";
import { requireUser } from "@/lib/session";
import { can, isProvider } from "@/lib/roles";
import { age, fmtDob, fmtTime, fullName, sexShort } from "@/lib/format";
import { PatientHover } from "@/components/hover/patient-hover";
import { ViewMenu } from "@/components/view-menu";
import { getViewPrefs } from "@/lib/view-prefs-server";
import { shownIn, viewArea } from "@/lib/view-prefs";

export const dynamic = "force-dynamic";

const lists = [
  { key: "today", label: "Clinic Today" },
  { key: "mine", label: "My Patients" },
  { key: "all", label: "All Patients" },
] as const;
type ListKey = (typeof lists)[number]["key"];

const sorts = {
  name: "Name",
  age: "Age",
  mrn: "MRN",
  appt: "Appointment",
} as const;
type SortKey = keyof typeof sorts;

export default async function PatientLists({
  searchParams,
}: {
  searchParams: Promise<{ list?: string; q?: string; sort?: string; dir?: string }>;
}) {
  const sp = await searchParams;
  const currentUser = await requireUser();
  const clinical = can(currentUser.role, "viewClinical");
  const prefs = await getViewPrefs();
  const col = shownIn(prefs, "patients");
  const viewItems = viewArea("patients").items.filter((i) => clinical || i.key !== "patients:problems");
  const canRegister = can(currentUser.role, "registerPatients");
  // "My Patients" is a PCP panel, so only providers have one.
  const shownLists = lists.filter((l) => l.key !== "mine" || isProvider(currentUser.role));
  const list: ListKey = shownLists.some((l) => l.key === sp.list) ? (sp.list as ListKey) : "today";
  const sort: SortKey = sp.sort && sp.sort in sorts ? (sp.sort as SortKey) : list === "today" ? "appt" : "name";
  const dir = sp.dir === "desc" ? -1 : 1;
  const q = sp.q?.trim() ?? "";
  const { start, end } = todayRange();

  const where: Prisma.PatientWhereInput = {};
  if (list === "today") where.encounters = { some: { start: { gte: start, lt: end } } };
  if (list === "mine") where.pcpId = currentUser.id;
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { mrn: { contains: q, mode: "insensitive" } },
    ];
  }

  const recentCutoff = new Date(Date.now() - 30 * 86_400_000);
  const patients = await db.patient.findMany({
    where,
    include: {
      pcp: true,
      allergies: { select: { substance: true, reaction: true, severity: true } },
      encounters: { where: { start: { gte: start, lt: end } }, orderBy: { start: "asc" }, take: 1 },
      conditions: { where: { status: "active" }, orderBy: { priority: "asc" }, take: 2 },
      _count: {
        select: {
          observations: {
            where: { category: "laboratory", flag: { in: ["L", "H", "LL", "HH", "A"] }, effectiveAt: { gte: recentCutoff }, enteredInErrorAt: null },
          },
        },
      },
    },
  });

  const key = (p: (typeof patients)[number]) => {
    switch (sort) {
      case "age":
        return -p.dob.getTime();
      case "mrn":
        return p.mrn;
      case "appt":
        return p.encounters[0]?.start.getTime() ?? Infinity;
      default:
        return `${p.lastName} ${p.firstName}`.toLowerCase();
    }
  };
  patients.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return (ka < kb ? -1 : ka > kb ? 1 : 0) * dir;
  });

  const href = (over: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { list, q: q || undefined, sort, dir: dir === -1 ? "desc" : undefined, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    return `/patients?${params}`;
  };
  const sortHeader = (k: SortKey) => (
    <Link href={href({ sort: k, dir: sort === k && dir === 1 ? "desc" : undefined })} className="hover:text-ink">
      {sorts[k]}
      {sort === k && <span className="ml-0.5">{dir === 1 ? "▲" : "▼"}</span>}
    </Link>
  );

  return (
    <main className="flex h-full">
      <aside className="w-52 shrink-0 border-r border-line bg-panel py-3">
        <h2 className="px-4 pb-2 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Lists</h2>
        {shownLists.map((l) => (
          <Link
            key={l.key}
            href={`/patients?list=${l.key}`}
            className={`block border-l-[3px] px-4 py-1.5 ${
              l.key === list ? "border-accent bg-accent-soft font-medium text-ink" : "border-transparent text-ink-2 hover:bg-panel-muted"
            }`}
          >
            {l.label}
          </Link>
        ))}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2.5">
          <h1 className="text-base font-semibold">{lists.find((l) => l.key === list)?.label}</h1>
          <span className="text-ink-3">{patients.length} patients</span>
          <div className="ml-auto">
            <ViewMenu label="Patient list columns" items={viewItems} hidden={prefs.hidden} />
          </div>
          <form action="/patients">
            <input type="hidden" name="list" value={list} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search name or MRN"
              className="w-64 rounded border border-line bg-panel-muted px-2.5 py-1.5 outline-none focus:border-accent focus:bg-panel"
            />
          </form>
          {canRegister && (
            <Link href="/patients/new" className="rounded border border-accent bg-accent px-2.5 py-1.5 text-[12.5px] font-medium text-white hover:bg-accent/90">
              New patient
            </Link>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full bg-panel">
            <thead className="sticky top-0 bg-panel-muted text-left text-[11.5px] text-ink-3 shadow-[inset_0_-1px_0_var(--line)]">
              <tr>
                <th className="px-4 py-2 font-medium">{sortHeader("name")}</th>
                {col("age") && <th className="px-3 py-2 font-medium">{sortHeader("age")}</th>}
                {col("mrn") && <th className="px-3 py-2 font-medium">{sortHeader("mrn")}</th>}
                {col("dob") && <th className="px-3 py-2 font-medium">DOB</th>}
                {col("appt") && <th className="px-3 py-2 font-medium">{sortHeader("appt")}</th>}
                {clinical && col("problems") && <th className="px-3 py-2 font-medium">Top problems</th>}
                {col("pcp") && <th className="px-3 py-2 font-medium">PCP</th>}
                {col("alerts") && <th className="px-3 py-2 font-medium">Alerts</th>}
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => {
                const appt = p.encounters[0];
                const severe = p.allergies.some((a) => a.severity === "severe");
                return (
                  <tr key={p.id} className="border-t border-line hover:bg-accent-soft/40">
                    <td className="whitespace-nowrap px-4 py-2">
                      <PatientHover id={p.id}>
                        <Link href={`/patients/${p.id}`} className="font-medium hover:text-accent">
                          {fullName(p)}
                        </Link>
                      </PatientHover>
                    </td>
                    {col("age") && (
                      <td className="tabular whitespace-nowrap px-3 py-2 text-ink-2">
                        {age(p.dob)} y {sexShort(p.sex)}
                      </td>
                    )}
                    {col("mrn") && <td className="tabular px-3 py-2 font-mono text-[12px] text-ink-2">{p.mrn}</td>}
                    {col("dob") && <td className="tabular px-3 py-2 text-ink-2">{fmtDob(p.dob)}</td>}
                    {col("appt") && (
                    <td className="px-3 py-2">
                      {appt ? (
                        <>
                          <span className="tabular">{fmtTime(appt.start)}</span>
                          <span className="ml-1.5 text-ink-3">{appt.reason}</span>
                        </>
                      ) : (
                        <span className="text-ink-3">—</span>
                      )}
                    </td>
                    )}
                    {clinical && col("problems") && (
                      <td className="max-w-72 truncate px-3 py-2 text-ink-2" title={p.conditions.map((c) => c.display).join("; ")}>
                        {p.conditions.map((c) => c.display).join("; ")}
                      </td>
                    )}
                    {col("pcp") && <td className="whitespace-nowrap px-3 py-2 text-ink-2">{p.pcp?.name}</td>}
                    {col("alerts") && (
                    <td className="space-x-1 whitespace-nowrap px-3 py-2">
                      {p.allergies.length > 0 && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${severe ? "bg-crit text-white" : "bg-crit-soft text-crit"}`}
                          title={p.allergies.map((x) => `${x.substance}${x.reaction ? ` (${x.reaction})` : ""}`).join(", ")}
                        >
                          Allergies {p.allergies.length}
                        </span>
                      )}
                      {p.allergyStatus === "not_reviewed" && (
                        <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-medium text-warn">Allergies not reviewed</span>
                      )}
                      {clinical && p._count.observations > 0 && (
                        <Link
                          href={`/patients/${p.id}/results`}
                          className="rounded bg-high-soft px-1.5 py-0.5 text-[11px] font-medium text-high"
                        >
                          {p._count.observations} abnormal
                        </Link>
                      )}
                      {p.codeStatus !== "Full code" && (
                        <span className="rounded bg-ink px-1.5 py-0.5 text-[11px] font-medium text-white">{p.codeStatus}</span>
                      )}
                    </td>
                    )}
                  </tr>
                );
              })}
              {patients.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-ink-3">
                    No patients match.
                    {q && canRegister && (
                      <>
                        {" "}
                        <Link href={`/patients/new?q=${encodeURIComponent(q)}`} className="text-accent hover:underline">
                          Register a new patient
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
