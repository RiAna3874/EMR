"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { ORDERABLES, ORDER_SETS, orderableByCode, searchOrderables, typeLabels, type Orderable } from "@/lib/orders/catalog";
import { orderWarnings, type OrderContext } from "@/lib/orders/checks";
import { Button, Field, inputCls } from "@/components/form";
import { OrderTypeIcon, WarningList } from "./order-bits";

type Props = {
  ctx: OrderContext;
  problems: string[];
  initialCode?: string;
  addOrder: (form: FormData) => Promise<void>;
  addOrderSet: (setId: string) => Promise<void>;
};

const FILTERS = ["all", "lab", "imaging", "medication", "referral"] as const;

export function OrderComposer({ ctx, problems, initialCode, addOrder, addOrderSet }: Props) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [selected, setSelected] = useState<Orderable | null>(() => (initialCode ? (orderableByCode.get(initialCode) ?? null) : null));
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const list = q.trim() ? searchOrderables(q, 40) : ORDERABLES;
    return (filter === "all" ? list : list.filter((o) => o.type === filter || (filter === "imaging" && o.type === "procedure"))).slice(0, q.trim() ? 12 : 60);
  }, [q, filter]);

  function pick(o: Orderable) {
    setSelected(o);
    setQ("");
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      pick(results[active]);
    }
  }

  return (
    <div className="space-y-3">
      <section className="rounded-md border border-line bg-panel">
        <div className="flex flex-wrap items-center gap-2 border-b border-line p-2">
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            placeholder="Search labs, imaging, medications, referrals…"
            className={`${inputCls} min-w-64 flex-1 py-1.5`}
            aria-label="Search orderables"
            autoFocus={!initialCode}
          />
          <div className="flex overflow-hidden rounded border border-line text-[12px]">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`border-l border-line px-2.5 py-1 capitalize first:border-l-0 ${filter === f ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}
              >
                {f === "all" ? "All" : f === "imaging" ? "Imaging & tests" : `${typeLabels[f]}s`}
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <Composer
            key={selected.code}
            o={selected}
            ctx={ctx}
            problems={problems}
            pending={pending}
            onCancel={() => {
              setSelected(null);
              searchRef.current?.focus();
            }}
            onSubmit={(form) =>
              start(async () => {
                await addOrder(form);
                setSelected(null);
                searchRef.current?.focus();
              })
            }
          />
        ) : (
          <ul className="max-h-72 overflow-y-auto" role="listbox">
            {results.length === 0 && <li className="px-3 py-3 text-ink-3">Nothing matches “{q}”.</li>}
            {results.map((o, i) => {
              const warnings = orderWarnings(o, ctx);
              return (
                <li key={o.code} role="option" aria-selected={i === active}>
                  <button
                    onClick={() => pick(o)}
                    onMouseEnter={() => setActive(i)}
                    className={`flex w-full items-center gap-2 border-t border-line px-3 py-1.5 text-left first:border-t-0 ${i === active && q ? "bg-accent-soft" : "hover:bg-accent-soft/50"}`}
                  >
                    <OrderTypeIcon type={o.type} />
                    <span className="flex-1">{o.display}</span>
                    {warnings.some((w) => w.level === "stop") ? (
                      <span className="rounded bg-crit-soft px-1.5 text-[10.5px] font-semibold text-crit">ALERT</span>
                    ) : warnings.length ? (
                      <span className="rounded bg-warn-soft px-1.5 text-[10.5px] font-semibold text-warn">CHECK</span>
                    ) : null}
                    <span className="text-[11px] text-ink-3">{typeLabels[o.type]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-md border border-line bg-panel">
        <header className="border-b border-line px-3 py-2 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Order sets</header>
        <div className="grid grid-cols-1 gap-2 p-2 md:grid-cols-2 2xl:grid-cols-3">
          {ORDER_SETS.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded border border-line px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.name}</div>
                <div className="truncate text-[12px] text-ink-3">{s.description}</div>
              </div>
              <Button variant="secondary" disabled={pending} onClick={() => start(() => addOrderSet(s.id))}>
                Add
              </Button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Composer({
  o,
  ctx,
  problems,
  pending,
  onCancel,
  onSubmit,
}: {
  o: Orderable;
  ctx: OrderContext;
  problems: string[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const warnings = orderWarnings(o, ctx);
  return (
    <form
      action={(form) => onSubmit(form)}
      className="space-y-3 bg-accent-soft/30 p-3"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <input type="hidden" name="code" value={o.code} />
      <div className="flex items-center gap-2">
        <OrderTypeIcon type={o.type} />
        <h3 className="text-[14px] font-semibold">{o.display}</h3>
        <span className="text-[11.5px] text-ink-3">{typeLabels[o.type]}</span>
        {o.specimen && <span className="ml-auto text-[11.5px] text-ink-3">Specimen: {o.specimen}</span>}
      </div>
      <WarningList warnings={warnings} />
      <div className="flex flex-wrap items-end gap-3">
        {o.type !== "medication" && (
          <Field label="Priority">
            <select name="priority" defaultValue="routine" className={inputCls}>
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="stat">STAT</option>
            </select>
          </Field>
        )}
        {o.med && (
          <>
            <Field label="Dose">
              <input name="dose" defaultValue={o.med.dose} className={`${inputCls} w-40`} />
            </Field>
            <Field label="Route">
              <input name="route" defaultValue={o.med.route} className={`${inputCls} w-24`} />
            </Field>
            <Field label="Frequency">
              <input name="frequency" defaultValue={o.med.frequency} className={`${inputCls} w-60`} />
            </Field>
            <Field label="Dispense">
              <input name="quantity" defaultValue={o.med.quantity} className={`${inputCls} w-28`} />
            </Field>
            <Field label="Refills">
              <input name="refills" type="number" min={0} max={11} defaultValue={o.med.refills} className={`${inputCls} w-16`} />
            </Field>
          </>
        )}
        {(o.type === "lab" || o.type === "imaging" || o.type === "procedure") && (
          <Field label="When">
            <input name="expectedAt" type="date" className={inputCls} defaultValue={new Date().toLocaleDateString("en-CA")} />
          </Field>
        )}
        <Field label={o.type === "referral" ? "Reason for referral" : "Indication"}>
          <input name="indication" list="order-indications" className={`${inputCls} w-72`} placeholder="Pick a problem or type one" />
        </Field>
        <datalist id="order-indications">
          {problems.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </div>
      <Field label={o.type === "medication" ? "Note to pharmacy" : "Instructions"}>
        <input name="instructions" className={`${inputCls} w-full`} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          Add to pending orders
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
