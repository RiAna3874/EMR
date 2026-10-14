import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { fmtDate } from "@/lib/format";
import { Button, Field, inputCls } from "@/components/form";
import { addAllergy, markNoKnownAllergies, removeAllergy } from "../actions";
import { ALLERGY_REMOVAL_REASONS } from "@/components/entered-in-error";
import { logChartView } from "@/lib/audit/server";

const severityStyles = {
  mild: "bg-panel-muted text-ink-2",
  moderate: "bg-high-soft text-high",
  severe: "bg-crit text-white",
};

export default async function Allergies({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await requirePermission("viewClinical");
  await logChartView(id, "Allergies");
  const canEdit = can(currentUser.role, "editAllergies");
  const patient = await db.patient.findUnique({ where: { id }, include: { allergies: { orderBy: { recordedAt: "desc" } } } });
  if (!patient) notFound();
  const { allergies } = patient;

  return (
    <div className="space-y-4 p-4">
      <section className="rounded-md border border-line bg-panel">
        <header className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Allergies and intolerances</h2>
          <ReviewStatus status={patient.allergyStatus} />
        </header>
        {allergies.length === 0 ? (
          <div className="flex items-center justify-between px-3 py-4">
            <span className={patient.allergyStatus === "no_known_allergies" ? "font-medium text-ok" : "text-warn"}>
              {patient.allergyStatus === "no_known_allergies"
                ? "No known allergies (reviewed)."
                : "Allergies have not been reviewed. Ask the patient, then record them or mark No Known Allergies."}
            </span>
            {canEdit && patient.allergyStatus !== "no_known_allergies" && (
              <form action={markNoKnownAllergies.bind(null, id)}>
                <Button variant="secondary">Mark no known allergies</Button>
              </form>
            )}
          </div>
        ) : (
          <table className="w-full">
            <thead className="text-left text-[11.5px] text-ink-3">
              <tr>
                <th className="px-3 py-1.5 font-medium">Allergen</th>
                <th className="px-3 py-1.5 font-medium">Type</th>
                <th className="px-3 py-1.5 font-medium">Reaction</th>
                <th className="px-3 py-1.5 font-medium">Severity</th>
                <th className="px-3 py-1.5 font-medium">Verified</th>
                <th className="px-3 py-1.5 font-medium">Recorded</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {allergies.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <td className="px-3 py-1.5 font-semibold text-crit">{a.substance}</td>
                  <td className="px-3 py-1.5 capitalize text-ink-2">{a.type}</td>
                  <td className="px-3 py-1.5">{a.reaction}</td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold capitalize ${severityStyles[a.severity]}`}>{a.severity}</span>
                  </td>
                  <td className="px-3 py-1.5">{a.verified ? "Yes" : <span className="text-warn">Unverified</span>}</td>
                  <td className="tabular px-3 py-1.5 text-ink-2">{fmtDate(a.recordedAt)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {canEdit && (
                      <form action={removeAllergy.bind(null, id, a.id)} className="flex justify-end gap-1">
                        <select name="reason" required defaultValue="" aria-label={`Why remove ${a.substance}`} className={`${inputCls} py-0.5 text-[12px]`}>
                          <option value="" disabled>
                            Reason to remove
                          </option>
                          {ALLERGY_REMOVAL_REASONS.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <Button variant="danger">Remove</Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {canEdit && (
        <form action={addAllergy.bind(null, id)} className="rounded-md border border-line bg-panel p-3">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Add allergy</h2>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Allergen" className="min-w-56 flex-1">
              <input name="substance" required placeholder="e.g. Penicillin" className={inputCls} />
            </Field>
            <Field label="Type">
              <select name="type" className={inputCls} defaultValue="drug">
                {["drug", "food", "environment", "other"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Reaction">
              <input name="reaction" placeholder="Hives" className={`${inputCls} w-44`} />
            </Field>
            <Field label="Severity">
              <select name="severity" className={inputCls} defaultValue="moderate">
                {["mild", "moderate", "severe"].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <label className="flex items-center gap-1.5 pb-1.5 text-ink-2">
              <input type="checkbox" name="verified" /> Verified
            </label>
            <Button type="submit">Add</Button>
          </div>
        </form>
      )}
    </div>
  );
}

function ReviewStatus({ status }: { status: string }) {
  if (status === "not_reviewed") return <span className="rounded bg-warn-soft px-1.5 py-0.5 text-[11px] font-semibold text-warn">Not reviewed</span>;
  return <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold text-accent">Reviewed</span>;
}
