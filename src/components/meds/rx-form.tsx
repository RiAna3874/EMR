"use client";

import { useMemo, useState } from "react";
import type { OrderContext } from "@/lib/orders/checks";
import { writesOwnSig, type Product } from "@/lib/meds/formulary";
import { isControlled, maxRefills, medWarnings } from "@/lib/meds/checks";
import { daysSupplyFor, suggestQuantity } from "@/lib/meds/sig";
import { RX_CLASSES, rxClassFor, rxSummary, type RxDetails } from "@/lib/meds/rx";
import { Button, Field, inputCls } from "@/components/form";
import { OrderTypeIcon, WarningList } from "@/components/orders/order-bits";
import { doseSuggestions } from "@/lib/meds/dosing";
import { ProblemPicker, type ProblemOption } from "@/components/problem-picker";
import { DoseInput, FrequencyInput, RouteInput } from "./dose-fields";
import { DrugInfo } from "./drug-info";

export type PharmacyOption = { id: string; name: string; address: string; mailOrder: boolean };

// The prescription fields with live checks: the sig, the quantity worked out
// from it, refills within the drug's schedule, and how and where it is sent.
export function RxForm({
  product,
  ctx,
  problems,
  pharmacies,
  preferredPharmacyId,
  initial,
  replaces,
  refillRequestId,
  editsOrderId,
  pending,
  submitLabel = "Add to order basket",
  onSubmit,
  onCancel,
}: {
  product: Product;
  ctx: OrderContext;
  problems: ProblemOption[];
  pharmacies: PharmacyOption[];
  preferredPharmacyId: string | null;
  initial?: Partial<RxDetails> & { indication?: string | null; conditionId?: string | null; pharmacyNote?: string | null };
  replaces?: { id: string; drug: string; mode: "reorder" | "modify" };
  refillRequestId?: string;
  editsOrderId?: string;
  pending: boolean;
  submitLabel?: string;
  onSubmit: (form: FormData) => void;
  onCancel: () => void;
}) {
  const shortCourse = product.refills === 0 && product.days > 0 && product.days <= 14;
  const [dose, setDose] = useState(initial?.dose ?? product.dose);
  const [route, setRoute] = useState(initial?.route ?? product.route);
  const [frequency, setFrequency] = useState((initial?.frequency ?? product.frequency).replace(/\s+for \d+ days?$/, ""));
  const [prn, setPrn] = useState(initial?.prn ?? (!!product.prnReason && /as needed/.test(product.frequency)));
  const [prnReason, setPrnReason] = useState(initial?.prnReason ?? product.prnReason ?? "");
  const [duration, setDuration] = useState<string>(String(initial?.durationDays ?? (shortCourse ? product.days : "")));
  const [quantity, setQuantity] = useState(initial?.quantity ?? product.quantity);
  // A reorder keeps its quantity; a change of dose recalculates it.
  const [qtyTouched, setQtyTouched] = useState(!!initial?.quantity && replaces?.mode !== "modify");
  const [refills, setRefills] = useState(Math.min(initial?.refills ?? product.refills, maxRefills(product.display)));
  const [rxClass, setRxClass] = useState(rxClassFor(initial?.rxClass));
  const [pharmacyId, setPharmacyId] = useState(initial?.pharmacyId ?? preferredPharmacyId ?? "");

  const doseOptions = useMemo(() => doseSuggestions(product.display, product), [product]);
  const days = Number(duration) || 0;
  // Keep the quantity in step with the sig until the prescriber types their own.
  const autoQty = useMemo(() => suggestQuantity(product, { dose, frequency }, days || product.days), [product, dose, frequency, days]);
  const shownQty = qtyTouched ? quantity : (autoQty ?? quantity);
  const daysSupply = daysSupplyFor(product, { dose, frequency }, shownQty) ?? (days || product.days);
  const limit = maxRefills(product.display);

  const warnings = useMemo(() => {
    const meds = [...ctx.activeMeds];
    if (replaces && meds.includes(replaces.drug)) meds.splice(meds.indexOf(replaces.drug), 1);
    const out = medWarnings(product.display, { dose, frequency, refills }, { ...ctx, activeMeds: meds });
    if (!replaces && ctx.openOrders.some((o) => o.code === `RX:${product.rxnorm}` && o.status === "pending")) {
      out.unshift({ level: "caution", kind: "duplicate", text: "Already in the order basket." });
    }
    return out;
  }, [ctx, product, dose, frequency, refills, replaces]);

  const summary = rxSummary({ dose, route, frequency, prn, prnReason, durationDays: days || null, quantity: shownQty, daysSupply, refills });
  const pharmacy = pharmacies.find((p) => p.id === pharmacyId);
  // An off-list, DGDA-registry or generic-list medication has no defaults, so the prescriber writes the whole sig.
  const incomplete = writesOwnSig(product) && (!dose.trim() || !frequency.trim() || !shownQty.trim());

  return (
    <form action={onSubmit} className="space-y-3 bg-accent-soft/30 p-3" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
      <input type="hidden" name="code" value={`RX:${product.rxnorm}`} />
      <input type="hidden" name="quantity" value={shownQty} />
      <input type="hidden" name="daysSupply" value={daysSupply || ""} />
      <input type="hidden" name="rxClass" value={rxClass} />
      {replaces && <input type="hidden" name="replacesId" value={replaces.id} />}
      {refillRequestId && <input type="hidden" name="refillRequestId" value={refillRequestId} />}
      {editsOrderId && <input type="hidden" name="editsOrderId" value={editsOrderId} />}

      <div className="flex flex-wrap items-center gap-2">
        <OrderTypeIcon type="medication" />
        <h3 className="text-[14px] font-semibold">{product.display}</h3>
        {isControlled(product.display) && <span className="rounded bg-crit-soft px-1.5 text-[10.5px] font-bold text-crit">Controlled</span>}
        {product.offList && <span className="rounded bg-warn-soft px-1.5 text-[10.5px] font-semibold text-warn">Not on the list</span>}
        {product.dar && (
          <span className="rounded bg-panel-muted px-1.5 text-[10.5px] font-semibold text-ink-2" title="Registered with the Directorate General of Drug Administration">
            DGDA {product.dar}
          </span>
        )}
        {product.generic && (
          <span className="rounded bg-panel-muted px-1.5 text-[10.5px] font-semibold text-ink-2" title="From the worldwide generic names list (RxNorm and Wikidata)">
            Generic
          </span>
        )}
        {product.otc && <span className="rounded bg-panel-muted px-1.5 text-[10.5px] font-semibold text-ink-2">OTC</span>}
        {replaces && (
          <span className="ml-auto rounded bg-warn-soft px-1.5 py-0.5 text-[11.5px] text-warn">
            {replaces.mode === "modify" ? "Changes" : "Reorders"} {replaces.drug}; signing replaces it
          </span>
        )}
      </div>
      <WarningList warnings={warnings} />
      <DrugInfo drug={product.display} />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Dose">
          <DoseInput value={dose} onChange={setDose} suggestions={doseOptions} autoFocus={replaces?.mode === "modify"} />
        </Field>
        <Field label="Route">
          <RouteInput value={route} onChange={setRoute} />
        </Field>
        <Field label="Frequency">
          <FrequencyInput value={frequency} onChange={setFrequency} className="w-64" />
        </Field>
        <label className="flex items-center gap-1.5 pb-1 text-[12.5px]">
          <input type="checkbox" name="prn" checked={prn} onChange={(e) => setPrn(e.target.checked)} />
          As needed
        </label>
        {prn && (
          <Field label="As needed for">
            <input name="prnReason" value={prnReason} onChange={(e) => setPrnReason(e.target.value)} className={`${inputCls} w-44`} placeholder="e.g. pain" />
          </Field>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Duration (days)">
          <input name="durationDays" type="number" min={1} max={365} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="ongoing" className={`${inputCls} w-28`} />
        </Field>
        <Field label="Dispense">
          <input
            value={shownQty}
            onChange={(e) => {
              setQtyTouched(true);
              setQuantity(e.target.value);
            }}
            className={`${inputCls} w-40`}
            aria-label="Dispense quantity"
          />
        </Field>
        <div className="pb-1 text-[12px] text-ink-2">
          {daysSupply ? `${daysSupply}-day supply` : ""}
          {qtyTouched && autoQty && autoQty !== quantity && (
            <button type="button" className="ml-2 text-accent hover:underline" onClick={() => setQtyTouched(false)}>
              Use {autoQty}
            </button>
          )}
        </div>
        <Field label={`Refills${limit < 11 ? ` (max ${limit})` : ""}`}>
          <input name="refills" type="number" min={0} max={limit} value={refills} onChange={(e) => setRefills(Math.max(0, Math.min(limit, Number(e.target.value) || 0)))} className={`${inputCls} w-20`} />
        </Field>
        <label className="flex items-center gap-1.5 pb-1 text-[12.5px]">
          <input type="checkbox" name="daw" defaultChecked={initial?.daw} />
          Dispense as written
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {RX_CLASSES.length > 1 && (
          <Field label="Send">
            <div className="flex overflow-hidden rounded border border-line text-[12px]">
              {RX_CLASSES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setRxClass(c.id)}
                  className={`border-l border-line px-2.5 py-1 first:border-l-0 ${rxClass === c.id ? "bg-chrome text-white" : "bg-panel text-ink-2 hover:bg-panel-muted"}`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </Field>
        )}
        {rxClass !== "print" && (
          <Field label="Pharmacy" className="min-w-72 flex-1">
            <select name="pharmacyId" value={pharmacyId} onChange={(e) => setPharmacyId(e.target.value)} className={inputCls} required>
              <option value="">Choose a pharmacy</option>
              {pharmacies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.id === preferredPharmacyId ? " (preferred)" : ""}
                </option>
              ))}
            </select>
          </Field>
        )}
        {rxClass === "print" && <p className="pb-1 text-[12px] text-ink-2">Printed for the patient to take to any pharmacy. Print it from the medication list once it&apos;s signed.</p>}
      </div>
      {pharmacy && rxClass !== "print" && <p className="-mt-2 text-[11.5px] text-ink-3">{pharmacy.address}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <ProblemPicker problems={problems} defaultConditionId={initial?.conditionId} defaultIndication={initial?.indication} />
        <Field label="Patient instructions" className="min-w-56 flex-1">
          <input name="patientInstructions" defaultValue={initial?.patientInstructions ?? ""} className={inputCls} placeholder="e.g. Take with food" />
        </Field>
        <Field label="Note to pharmacy" className="min-w-56 flex-1">
          <input name="pharmacyNote" defaultValue={initial?.pharmacyNote ?? ""} className={inputCls} />
        </Field>
      </div>

      <p className="rounded border border-line bg-panel px-2.5 py-1.5 text-[12.5px]">
        <span className="font-semibold">Sig: </span>
        {summary}
      </p>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending || incomplete}>
          {submitLabel}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {incomplete && <span className="text-[12px] text-ink-3">Fill in the dose, frequency and amount to dispense.</span>}
      </div>
    </form>
  );
}
