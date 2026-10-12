"use client";

import { useState, useTransition } from "react";
import type { OrderPriority, OrderType } from "@prisma/client";
import type { OrderWarning } from "@/lib/orders/checks";
import { Button, inputCls } from "@/components/form";
import { OrderTypeIcon, WarningList } from "./order-bits";

export type PendingRow = {
  id: string;
  type: OrderType;
  display: string;
  priority: OrderPriority;
  indication: string | null;
  sig: string;
  orderSet: string | null;
  // Set when someone other than the viewer pended it.
  pendedBy: string | null;
  warnings: OrderWarning[];
};

export function PendingOrders({
  rows,
  remove,
  setPriority,
  sign,
}: {
  rows: PendingRow[];
  remove: (id: string) => Promise<void>;
  setPriority: (id: string, form: FormData) => Promise<void>;
  // Absent when the user can pend but not sign (nursing).
  sign?: (form: FormData) => Promise<{ error: string } | void>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const stops = rows.filter((r) => r.warnings.some((w) => w.level === "stop"));

  return (
    <section className="rounded-md border border-line bg-panel">
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Pending orders</h2>
        <span className="text-[11.5px] text-ink-3">{rows.length ? `${rows.length} unsigned` : ""}</span>
      </header>
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-ink-3">Nothing pending. Search for an order or add an order set.</p>
      ) : (
        <ul>
          {rows.map((r) => (
            <li key={r.id} className="space-y-1 border-t border-line px-3 py-2 first:border-t-0">
              <div className="flex items-start gap-2">
                <OrderTypeIcon type={r.type} />
                <div className="min-w-0 flex-1">
                  <div className="font-medium leading-tight">{r.display}</div>
                  {r.sig && <div className="text-[12px] text-ink-2">{r.sig}</div>}
                  <div className="text-[11.5px] text-ink-3">
                    {r.indication ? `For: ${r.indication}` : "No indication"}
                    {r.orderSet && ` · ${r.orderSet}`}
                    {r.pendedBy && ` · pended by ${r.pendedBy}`}
                  </div>
                </div>
                {r.type !== "medication" && (
                  <select
                    aria-label={`Priority for ${r.display}`}
                    defaultValue={r.priority}
                    disabled={pending}
                    onChange={(e) => {
                      const f = new FormData();
                      f.set("priority", e.target.value);
                      start(() => setPriority(r.id, f));
                    }}
                    className={`${inputCls} py-0 text-[11.5px]`}
                  >
                    <option value="routine">Routine</option>
                    <option value="urgent">Urgent</option>
                    <option value="stat">STAT</option>
                  </select>
                )}
                <button
                  aria-label={`Remove ${r.display}`}
                  disabled={pending}
                  onClick={() => start(() => remove(r.id))}
                  className="rounded px-1.5 text-ink-3 hover:bg-crit-soft hover:text-crit"
                >
                  ×
                </button>
              </div>
              <WarningList warnings={r.warnings} />
            </li>
          ))}
        </ul>
      )}
      {rows.length > 0 && !sign && (
        <p className="border-t border-line bg-panel-muted p-3 text-[12px] text-ink-2">Pended for a physician or resident to review and sign.</p>
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
          {stops.length > 0 && (
            <label className="block">
              <span className="text-[11.5px] font-medium text-crit">
                Override reason for {stops.length === 1 ? stops[0].display : `${stops.length} alerted orders`}
              </span>
              <input name="overrideReason" className={`${inputCls} mt-0.5 w-full`} placeholder="e.g. Tolerated before without reaction" />
            </label>
          )}
          {error && <p className="text-[12px] text-crit">{error}</p>}
          <Button type="submit" disabled={pending} className="w-full py-1.5">
            Sign {rows.length} order{rows.length === 1 ? "" : "s"}
          </Button>
        </form>
      )}
    </section>
  );
}
