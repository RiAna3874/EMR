"use client";

import { useState, useTransition } from "react";
import type { OrderPriority } from "@prisma/client";
import { Button, inputCls } from "@/components/form";
import type { ProblemOption } from "@/components/problem-picker";
import { OrderTypeIcon, WarningList, type BasketRow } from "./order-bits";

export type { BasketRow };

const OVERRIDE_REASONS = ["Benefit outweighs risk", "Tolerated before without reaction", "Will monitor closely", "Dose intended", "Alert not applicable"];
const PRIORITIES: [OrderPriority, string][] = [
  ["routine", "Routine"],
  ["urgent", "Urgent"],
  ["stat", "STAT"],
];

const commentLabel = (r: BasketRow) =>
  r.type === "medication" ? "Note to pharmacy" : r.type === "referral" ? "Comments for the specialist" : r.type === "lab" ? "Comments for the lab" : "Comments";

// The unsigned orders for this patient, each with its details editable in place
// (priority, date, problem, comments) and its warnings beside it, and one Sign
// button for the lot. Nurses pend: their basket waits for a physician or resident.
export function OrderBasket({
  rows,
  problems,
  remove,
  update,
  linkAll,
  sign,
  cosigners,
}: {
  rows: BasketRow[];
  problems: ProblemOption[];
  remove: (id: string) => Promise<void>;
  update: (id: string, form: FormData) => Promise<void>;
  linkAll?: (conditionId: string) => Promise<void>;
  // Absent when the user can pend but not sign (nursing).
  sign?: (form: FormData) => Promise<{ error: string } | void>;
  // Attendings to pick from when a resident signs prescriptions.
  cosigners?: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [override, setOverride] = useState("");
  const stops = rows.filter((r) => r.warnings.some((w) => w.level === "stop"));
  const checks = rows.filter((r) => r.warnings.length && !stops.includes(r));
  const hasRx = rows.some((r) => r.type === "medication");

  function save(id: string, field: string, value: string) {
    const f = new FormData();
    f.set(field, value);
    start(() => update(id, f));
  }

  return (
    <section className="rounded-md border border-line bg-panel shadow-sm">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="text-[13px] font-semibold">Order basket</h2>
        {rows.length > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-semibold text-white">{rows.length}</span>}
        <span className="ml-auto text-[11.5px] text-ink-3">{pending ? "Saving…" : rows.length ? "Not signed yet" : ""}</span>
      </header>

      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-ink-3">
          <div className="text-[13px] text-ink-2">The basket is empty.</div>
          <div className="mt-1 text-[12px]">Search, or click a favorite, frequent order or order set. Orders land here with defaults you can change before signing.</div>
        </div>
      ) : (
        <>
          {linkAll && rows.length > 1 && problems.length > 0 && (
            <div className="flex items-center gap-2 border-b border-line bg-panel-muted px-3 py-1.5 text-[12px]">
              <span className="text-ink-3">Link all to</span>
              <select
                aria-label="Link every order in the basket to a problem"
                value=""
                disabled={pending}
                onChange={(e) => e.target.value && start(() => linkAll(e.target.value))}
                className={`${inputCls} min-w-0 flex-1 py-0 text-[12px]`}
              >
                <option value="">Choose a problem…</option>
                {problems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.display}
                  </option>
                ))}
              </select>
            </div>
          )}
          <ul className="max-h-[calc(100vh-300px)] overflow-y-auto">
            {rows.map((r) => (
              <BasketItem key={r.id} r={r} problems={problems} disabled={pending} save={(field, value) => save(r.id, field, value)} onRemove={() => start(() => remove(r.id))} />
            ))}
          </ul>
        </>
      )}

      {rows.length > 0 && !sign && (
        <p className="border-t border-line bg-panel-muted p-3 text-[12px] text-ink-2">Pended. A physician or resident reviews and signs these.</p>
      )}
      {rows.length > 0 && sign && (
        <form
          action={(form) =>
            start(async () => {
              setError(null);
              const res = await sign(form);
              if (res?.error) setError(res.error);
            })
          }
          className="space-y-2 border-t border-line bg-panel-muted p-3"
        >
          {/* What the signer is looking at: the server refuses to sign if the list or its alerts changed meanwhile. */}
          {rows.map((r) => (
            <input key={r.id} type="hidden" name="orderId" value={r.id} />
          ))}
          {stops.map((r) => (
            <input key={r.id} type="hidden" name="alertedId" value={r.id} />
          ))}
          {stops.length > 0 && (
            <label className="block">
              <span className="text-[11.5px] font-medium text-crit">
                Override reason for {stops.length === 1 ? stops[0].display : `${stops.length} alerted orders`}
              </span>
              <input
                name="overrideReason"
                value={override}
                onChange={(e) => setOverride(e.target.value)}
                className={`${inputCls} mt-0.5 w-full`}
                placeholder="Pick one or type a reason"
              />
              <span className="mt-1 flex flex-wrap gap-1">
                {OVERRIDE_REASONS.map((r) => (
                  <button key={r} type="button" onClick={() => setOverride(r)} className="rounded border border-line bg-panel px-1.5 text-[11px] text-ink-2 hover:border-accent hover:text-accent">
                    {r}
                  </button>
                ))}
              </span>
            </label>
          )}
          {hasRx && cosigners && (
            <label className="block">
              <span className="text-[11.5px] font-medium text-ink-2">Cosigning attending (prescriptions)</span>
              <select name="cosignerId" defaultValue="" className={`${inputCls} mt-0.5 w-full`}>
                <option value="">Choose an attending</option>
                {cosigners.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(stops.length > 0 || checks.length > 0) && (
            <p className="text-[11.5px] text-ink-3">
              {[stops.length && `${stops.length} with an alert`, checks.length && `${checks.length} to check`].filter(Boolean).join(", ")}. Warnings are shown on each order above.
            </p>
          )}
          {error && <p className="text-[12px] text-crit">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full py-2 text-[13px]">
            Sign {rows.length} order{rows.length === 1 ? "" : "s"}
          </Button>
        </form>
      )}
    </section>
  );
}

function BasketItem({ r, problems, disabled, save, onRemove }: { r: BasketRow; problems: ProblemOption[]; disabled: boolean; save: (field: string, value: string) => void; onRemove: () => void }) {
  const stop = r.warnings.some((w) => w.level === "stop");
  const linked = r.conditionId && problems.some((p) => p.id === r.conditionId);
  const [commenting, setCommenting] = useState(false);
  return (
    <li className={`space-y-1 border-t border-line px-3 py-2.5 first:border-t-0 ${stop ? "bg-crit-soft/30" : ""}`}>
      <div className="flex items-start gap-2">
        <OrderTypeIcon type={r.type} />
        <div className="min-w-0 flex-1">
          <div className="font-medium leading-tight">{r.display}</div>
          {r.sig && <div className="text-[12px] text-ink-2">{r.sig}</div>}
          {(r.orderSet || r.pendedBy) && (
            <div className="text-[11.5px] text-ink-3">{[r.orderSet && `From ${r.orderSet}`, r.pendedBy && `Pended by ${r.pendedBy}`].filter(Boolean).join(" · ")}</div>
          )}
        </div>
        <button aria-label={`Remove ${r.display}`} title="Remove from basket" disabled={disabled} onClick={onRemove} className="rounded px-1.5 text-[15px] leading-5 text-ink-3 hover:bg-crit-soft hover:text-crit">
          ×
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 pl-10">
        {r.type !== "medication" && (
          <div role="radiogroup" aria-label={`Priority for ${r.display}`} className="flex overflow-hidden rounded border border-line text-[11.5px]">
            {PRIORITIES.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={r.priority === value}
                disabled={disabled}
                onClick={() => r.priority !== value && save("priority", value)}
                className={`border-l border-line px-2 py-0.5 first:border-l-0 ${
                  r.priority === value ? (value === "stat" ? "bg-crit text-white" : value === "urgent" ? "bg-warn text-white" : "bg-chrome text-white") : "text-ink-2 hover:bg-panel-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {r.takesDate && (
          <input
            key={r.expectedAt ?? ""}
            type="date"
            aria-label={`Date for ${r.display}`}
            defaultValue={r.expectedAt ?? ""}
            disabled={disabled}
            onChange={(e) => e.target.value !== (r.expectedAt ?? "") && save("expectedAt", e.target.value)}
            className={`${inputCls} py-0 text-[11.5px]`}
          />
        )}
      </div>

      <div className="pl-10">
        <select
          aria-label={`Problem for ${r.display}`}
          value={linked ? r.conditionId! : ""}
          disabled={disabled}
          onChange={(e) => save("conditionId", e.target.value)}
          className={`${inputCls} w-full py-0 text-[12px] ${linked ? "" : "text-ink-3"}`}
        >
          <option value="">{r.indication && !linked ? `For: ${r.indication}` : problems.length ? "Link to a problem (optional)" : "No active problems"}</option>
          {problems.map((p) => (
            <option key={p.id} value={p.id}>
              For: {p.display}
            </option>
          ))}
        </select>
      </div>

      {commenting || r.instructions ? (
        <div className="pl-10">
          <input
            key={r.instructions ?? ""}
            aria-label={`${commentLabel(r)} for ${r.display}`}
            defaultValue={r.instructions ?? ""}
            placeholder={commentLabel(r)}
            autoFocus={commenting && !r.instructions}
            disabled={disabled}
            onBlur={(e) => {
              if (e.target.value.trim() !== (r.instructions ?? "")) save("instructions", e.target.value);
              else if (!e.target.value.trim()) setCommenting(false);
            }}
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
            className={`${inputCls} w-full py-0.5 text-[12px]`}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setCommenting(true)} className="ml-10 text-[11.5px] font-medium text-accent hover:underline">
          + {commentLabel(r)}
        </button>
      )}

      {r.warnings.length > 0 && (
        <div className="pl-10">
          <WarningList warnings={r.warnings} />
        </div>
      )}
    </li>
  );
}
