import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { clinic } from "@/lib/clinic";
import { age, fmtDate, fmtDateTime, fmtDob, fmtRange, fmtValue, isAbnormal, sexShort, unitLabel } from "@/lib/format";
import { aboutTest, resultInWords } from "@/lib/labs/plain-language";
import { Letterhead, PrintFooter, PrintShell } from "@/components/print/print-shell";
import { logChartView } from "@/lib/audit/server";

export const dynamic = "force-dynamic";

// A clean lab report built from filed results: one or more panels collected
// together, as the clinician's copy or as a plain-language letter for the patient.
export default async function PrintResults({ searchParams }: { searchParams: Promise<{ report?: string | string[]; copy?: string }> }) {
  const sp = await searchParams;
  const currentUser = await requirePermission("viewClinical");
  const ids = [sp.report ?? []].flat();
  const reports = await db.diagnosticReport.findMany({
    where: { id: { in: ids } },
    orderBy: [{ effectiveAt: "asc" }, { display: "asc" }],
    include: {
      observations: { orderBy: { sortOrder: "asc" } },
      verifiedBy: true,
      reviewedBy: true,
      order: { include: { orderedBy: true } },
      importJob: { include: { documents: { select: { fileName: true, uploadedAt: true }, orderBy: { position: "asc" } }, createdBy: true } },
      patient: { include: { pcp: true } },
    },
  });
  if (!reports.length) notFound();
  const patient = reports[0].patient;
  if (reports.some((r) => r.patientId !== patient.id)) notFound();
  await logChartView(patient.id, "Lab report", "print");

  const patientCopy = sp.copy === "patient";
  const query = reports.map((r) => `report=${r.id}`).join("&");
  const first = reports[0];
  const tabs = [
    { label: "Clinician copy", href: `/print/results?${query}`, active: !patientCopy },
    { label: "Patient letter", href: `/print/results?${query}&copy=patient`, active: patientCopy },
  ];
  const back = `/patients/${patient.id}/results?view=reports&report=${first.id}`;

  if (patientCopy) {
    const abnormal = reports.flatMap((r) => r.observations).filter((o) => isAbnormal(o.flag)).length;
    return (
      <PrintShell back={back} tabs={tabs}>
        <Letterhead title="Your test results" right={fmtDate(new Date())} />
        <div className="mt-5 space-y-3 text-[12.5px]">
          <p>
            {patient.firstName} {patient.lastName}
            <br />
            {patient.address}
          </p>
          <p>Dear {patient.firstName},</p>
          <p>
            Here are the results of the tests collected on {fmtDate(first.effectiveAt)}.{" "}
            {abnormal === 0
              ? "All of them are within the normal range."
              : `${abnormal} ${abnormal === 1 ? "result is" : "results are"} outside the normal range and marked below. A result outside the range does not always mean something is wrong; your care team will tell you if anything needs to change.`}
          </p>
        </div>
        {reports.map((r) => (
          <section key={r.id} className="mt-5 break-inside-avoid">
            <h2 className="border-b border-black pb-0.5 text-[13px] font-bold">{r.display}</h2>
            <table className="w-full table-fixed">
              <colgroup>
                <col />
                <col className="w-28" />
                <col className="w-28" />
                <col className="w-48" />
              </colgroup>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide">
                  <th className="py-1 pr-2 font-semibold">Test</th>
                  <th className="py-1 pr-2 text-right font-semibold">Your result</th>
                  <th className="py-1 pr-2 font-semibold">Normal range</th>
                  <th className="py-1 font-semibold">What it shows</th>
                </tr>
              </thead>
              <tbody>
                {r.observations.map((o) => {
                  const words = resultInWords(o.flag);
                  return (
                    <tr key={o.id} className="border-t border-black/20 align-top">
                      <td className="py-1.5 pr-2">
                        <div className="font-semibold">{o.display}</div>
                        {aboutTest(o.code) && <div className="text-[11px] text-black/70">{aboutTest(o.code)}</div>}
                      </td>
                      <td className="tabular whitespace-nowrap py-1.5 pr-2 text-right font-semibold">
                        {fmtValue(o)} <span className="font-normal">{unitLabel(o.unit)}</span>
                      </td>
                      <td className="tabular whitespace-nowrap py-1.5 pr-2">{fmtRange(o) || "—"}</td>
                      <td className={`py-1.5 ${words.tone === "normal" ? "" : "font-semibold"}`}>
                        {words.tone !== "normal" && "● "}
                        {words.text}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        ))}
        <div className="mt-6 space-y-3 text-[12.5px]">
          <p>If you have questions about these results, call us at {clinic.phone}. If you feel very unwell, call 911 or go to the nearest emergency department.</p>
          <p>
            Sincerely,
            <br />
            {patient.pcp ? `${patient.pcp.name}, ${patient.pcp.credentials}` : `${currentUser.name}, ${currentUser.credentials}`}
            <br />
            {clinic.name}
          </p>
        </div>
        <PrintFooter />
      </PrintShell>
    );
  }

  const history = await db.observation.findMany({
    where: { patientId: patient.id, category: "laboratory", code: { in: reports.flatMap((r) => r.observations.map((o) => o.code)) }, effectiveAt: { lt: first.effectiveAt } },
    orderBy: { effectiveAt: "desc" },
  });
  const previous = new Map<string, (typeof history)[number]>();
  for (const h of history) if (!previous.has(h.code)) previous.set(h.code, h);

  const imported = reports.find((r) => r.source === "imported");
  const orderers = [...new Set(reports.flatMap((r) => (r.order ? [`${r.order.orderedBy.name}, ${r.order.orderedBy.credentials ?? ""}`] : [])))];
  const performers = [...new Set(reports.map((r) => r.performer))];
  const lastIssued = new Date(Math.max(...reports.map((r) => r.issuedAt.getTime())));
  const reviews = [
    ...new Set(
      reports.map((r) =>
        r.reviewedAt ? `Reviewed by ${r.reviewedBy?.name ?? "unknown"} on ${fmtDateTime(r.reviewedAt)}.` : "Not yet reviewed by a clinician.",
      ),
    ),
  ];
  const anyCritical = reports.some((r) => r.observations.some((o) => o.flag === "LL" || o.flag === "HH"));

  return (
    <PrintShell back={back} tabs={tabs}>
      <Letterhead title="Laboratory report" right={<>Final · Printed {fmtDateTime(new Date())}</>} />

      <section className="mt-3 grid grid-cols-[1.2fr_1fr] gap-x-6 border-b border-black pb-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="font-semibold">Patient</dt>
          <dd className="font-bold">
            {patient.lastName.toUpperCase()}, {patient.firstName}
          </dd>
          <dt className="font-semibold">DOB</dt>
          <dd>
            {fmtDob(patient.dob)} ({age(patient.dob)} y) · Sex {sexShort(patient.sex)}
          </dd>
          <dt className="font-semibold">MRN</dt>
          <dd className="font-mono">{patient.mrn}</dd>
          <dt className="font-semibold">Phone</dt>
          <dd>{patient.phone}</dd>
        </dl>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="font-semibold">Collected</dt>
          <dd>{fmtDateTime(first.effectiveAt)}</dd>
          <dt className="font-semibold">Reported</dt>
          <dd>{fmtDateTime(lastIssued)}</dd>
          <dt className="font-semibold">Ordered by</dt>
          <dd>{orderers.length ? orderers.join("; ") : imported ? "Outside order" : "—"}</dd>
          <dt className="font-semibold">PCP</dt>
          <dd>{patient.pcp ? `${patient.pcp.name}, ${patient.pcp.credentials}` : "—"}</dd>
          <dt className="font-semibold">Performed at</dt>
          <dd>{performers.join("; ")}</dd>
        </dl>
      </section>

      {anyCritical && <p className="mt-2 border-2 border-black px-2 py-1 text-[12px] font-bold">CRITICAL VALUE(S) PRESENT: see results marked HH or LL.</p>}

      {reports.map((r) => (
        <section key={r.id} className="mt-4 break-inside-avoid">
          <h2 className="flex justify-between border-b border-black pb-0.5 text-[13px] font-bold">
            <span>{r.display}</span>
            <span className="text-[11px] font-normal">
              {r.source === "imported" ? "Outside report, transcribed" : `Status: ${r.status}`}
            </span>
          </h2>
          <table className="w-full table-fixed">
            <colgroup>
              <col />
              <col className="w-20" />
              <col className="w-12" />
              <col className="w-28" />
              <col className="w-32" />
              <col className="w-40" />
            </colgroup>
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wide">
                <th className="py-1 pr-2 font-semibold">Test</th>
                <th className="py-1 pr-2 text-right font-semibold">Result</th>
                <th className="w-10 py-1 pr-2 font-semibold">Flag</th>
                <th className="py-1 pr-2 font-semibold">Units</th>
                <th className="py-1 pr-2 font-semibold">Reference interval</th>
                <th className="py-1 text-right font-semibold">Previous</th>
              </tr>
            </thead>
            <tbody>
              {r.observations.map((o) => {
                const prev = previous.get(o.code);
                const flagged = isAbnormal(o.flag);
                return (
                  <tr key={o.id} className={`border-t border-black/15 ${flagged ? "font-bold" : ""}`}>
                    <td className="py-[3px] pr-2">{o.display}</td>
                    <td className="tabular py-[3px] pr-2 text-right">{fmtValue(o)}</td>
                    <td className="py-[3px] pr-2">{flagged ? o.flag : ""}</td>
                    <td className="py-[3px] pr-2 font-normal">{unitLabel(o.unit)}</td>
                    <td className="tabular py-[3px] pr-2 font-normal">{fmtRange(o)}</td>
                    <td className="tabular whitespace-nowrap py-[3px] text-right font-normal">
                      {prev && prev.unit === o.unit ? (
                        <>
                          {fmtValue(prev)}
                          {isAbnormal(prev.flag) ? ` ${prev.flag}` : ""} <span className="text-[10px] text-black/60">({fmtDate(prev.effectiveAt)})</span>
                        </>
                      ) : (
                        ""
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {r.reviewComment && <p className="mt-1 text-[10.5px]">Clinician comment: {r.reviewComment}</p>}
        </section>
      ))}

      {reviews.length > 0 && <p className="mt-4 text-[10.5px]">{reviews.join(" ")}</p>}
      <p className="mt-1 text-[10.5px]">Flags: H high, L low, HH critically high, LL critically low, A abnormal. Previous shows the most recent earlier result for the same test.</p>

      <PrintFooter>
        {imported && (
          <p className="mb-1">
            Source: results transcribed from an outside report
            {imported.importJob && (
              <>
                {" "}
                ({imported.importJob.documents.map((d) => d.fileName).join(", ")}, uploaded {fmtDateTime(imported.importJob.documents[0]?.uploadedAt ?? imported.importJob.createdAt)} by {imported.importJob.createdBy.name})
              </>
            )}
            {imported.verifiedBy && imported.verifiedAt && <> and verified against the original by {imported.verifiedBy.name} on {fmtDateTime(imported.verifiedAt)}</>}. The
            original document is kept in the patient&apos;s chart.
          </p>
        )}
        <div>
          Printed by {currentUser.name}, {currentUser.credentials} on {fmtDateTime(new Date())}.
        </div>
      </PrintFooter>
    </PrintShell>
  );
}
