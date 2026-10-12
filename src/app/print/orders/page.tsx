import { notFound } from "next/navigation";
import type { OrderType } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { age, fmtDateOnly, fmtDateTime, fmtDob, sexShort } from "@/lib/format";
import { orderableByCode } from "@/lib/orders/catalog";
import { Letterhead, PrintFooter, PrintShell } from "@/components/print/print-shell";

export const dynamic = "force-dynamic";

const sections: { title: string; types: OrderType[] }[] = [
  { title: "Laboratory", types: ["lab"] },
  { title: "Imaging and diagnostic tests", types: ["imaging", "procedure"] },
  { title: "Referrals", types: ["referral"] },
];

// A requisition for a patient's active (signed, not yet done) orders.
export default async function PrintOrders({ searchParams }: { searchParams: Promise<{ patient?: string; order?: string | string[] }> }) {
  const sp = await searchParams;
  const currentUser = await requirePermission("viewClinical");
  const only = [sp.order ?? []].flat();
  const patient = sp.patient ? await db.patient.findUnique({ where: { id: sp.patient }, include: { pcp: true, allergies: true } }) : null;
  if (!patient) notFound();
  const orders = await db.serviceRequest.findMany({
    where: { patientId: patient.id, status: "signed", type: { not: "medication" }, ...(only.length ? { id: { in: only } } : {}) },
    orderBy: { signedAt: "asc" },
    include: { orderedBy: true },
  });
  const signers = [...new Map(orders.map((o) => [o.orderedById, o])).values()];

  return (
    <PrintShell back={`/patients/${patient.id}/orders`}>
      <Letterhead title="Order requisition" right={<>Printed {fmtDateTime(new Date())}</>} />
      <section className="mt-3 grid grid-cols-2 gap-x-6 border-b border-black pb-2">
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
        </dl>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="font-semibold">Phone</dt>
          <dd>{patient.phone}</dd>
          <dt className="font-semibold">Address</dt>
          <dd>{patient.address}</dd>
          <dt className="font-semibold">Allergies</dt>
          <dd>{patient.allergies.length ? patient.allergies.map((a) => a.substance).join(", ") : patient.allergyStatus === "no_known_allergies" ? "No known allergies" : "Not reviewed"}</dd>
        </dl>
      </section>

      {orders.length === 0 && <p className="mt-6">No active orders to print.</p>}

      {sections.map((s) => {
        const rows = orders.filter((o) => s.types.includes(o.type));
        if (!rows.length) return null;
        return (
          <section key={s.title} className="mt-4 break-inside-avoid">
            <h2 className="border-b border-black pb-0.5 text-[13px] font-bold">{s.title}</h2>
            <table className="w-full">
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wide">
                  <th className="py-1 pr-2 font-semibold">Order</th>
                  <th className="py-1 pr-2 font-semibold">Code</th>
                  <th className="py-1 pr-2 font-semibold">Priority</th>
                  <th className="py-1 pr-2 font-semibold">Diagnosis / reason</th>
                  <th className="py-1 font-semibold">{s.types.includes("lab") ? "Specimen" : "Due"}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => {
                  const def = orderableByCode.get(o.code);
                  return (
                    <tr key={o.id} className="border-t border-black/15 align-top">
                      <td className="py-1 pr-2">
                        <div className="font-semibold">{o.display}</div>
                        {o.instructions && <div className="whitespace-pre-line text-[11px]">{o.instructions}</div>}
                      </td>
                      <td className="py-1 pr-2 font-mono text-[11px]">{o.code.replace(/^(CPT|REF):/, "")}</td>
                      <td className={`py-1 pr-2 uppercase ${o.priority !== "routine" ? "font-bold" : ""}`}>{o.priority}</td>
                      <td className="py-1 pr-2">{o.indication ?? "—"}</td>
                      <td className="py-1">
                        {s.types.includes("lab") ? def?.specimen ?? "—" : o.expectedAt ? fmtDateOnly(o.expectedAt) : "—"}
                        {s.types.includes("lab") && o.expectedAt && <div className="text-[11px]">Collect by {fmtDateOnly(o.expectedAt)}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}

      {signers.length > 0 && (
        <section className="mt-8 break-inside-avoid space-y-3">
          {signers.map((o) => (
            <div key={o.orderedById}>
              <div>
                Electronically signed by <span className="font-semibold">{o.orderedBy.name}, {o.orderedBy.credentials}</span>
                {o.signedAt && ` on ${fmtDateTime(o.signedAt)}`}
              </div>
              <div className="mt-6 w-72 border-t border-black text-[10.5px]">Signature</div>
            </div>
          ))}
        </section>
      )}

      <PrintFooter>
        <div>
          Results to {patient.pcp ? `${patient.pcp.name}, ${patient.pcp.credentials}` : "ordering provider"}. Printed by {currentUser.name}, {currentUser.credentials}.
        </div>
      </PrintFooter>
    </PrintShell>
  );
}
