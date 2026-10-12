import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { fmtDate, fmtDateOnly } from "@/lib/format";
import { orderableByCode, typeLabels } from "@/lib/orders/catalog";
import { orderWarnings } from "@/lib/orders/checks";
import { orderContext } from "@/lib/orders/server";
import { Empty } from "@/components/panel";
import { OrderComposer } from "@/components/orders/order-composer";
import { PendingOrders, type PendingRow } from "@/components/orders/pending-orders";
import { medSig, OrderStatusChip, OrderTypeIcon, PriorityChip } from "@/components/orders/order-bits";
import { ActionButton } from "@/components/action-button";
import { addOrder, addOrderSet, completeOrder, discontinueOrder, removePendingOrder, signOrders, updatePendingOrder } from "./actions";

export default async function Orders({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ add?: string; history?: string }> }) {
  const { id } = await params;
  const currentUser = await requirePermission("viewClinical");
  const canPend = can(currentUser.role, "pendOrders");
  const canSign = can(currentUser.role, "signOrders");
  const sp = await searchParams;
  const [orders, problems, ctx] = await Promise.all([
    db.serviceRequest.findMany({
      where: { patientId: id },
      orderBy: { createdAt: "desc" },
      include: { orderedBy: true, reports: { select: { id: true }, take: 1 } },
    }),
    db.condition.findMany({ where: { patientId: id, status: "active" }, orderBy: { priority: "asc" }, select: { display: true } }),
    orderContext(id),
  ]);

  const pending = orders.filter((o) => o.status === "pending").reverse();
  const active = orders.filter((o) => o.status === "signed");
  const past = orders.filter((o) => o.status === "completed" || o.status === "discontinued");
  const shownPast = sp.history === "all" ? past : past.slice(0, 15);

  const rows: PendingRow[] = pending.map((o) => {
    const def = orderableByCode.get(o.code);
    const others = { ...ctx, openOrders: orders.filter((x) => x.id !== o.id && (x.status === "pending" || x.status === "signed")) };
    return {
      id: o.id,
      type: o.type,
      display: o.display,
      priority: o.priority,
      indication: o.indication,
      sig: medSig(o.details),
      orderSet: o.orderSet,
      pendedBy: o.orderedById === currentUser.id ? null : o.orderedBy.name,
      warnings: def ? orderWarnings(def, others) : [],
    };
  });

  return (
    <div className="flex flex-col gap-4 p-4 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 space-y-4">
        {canPend && (
          <OrderComposer
            key={sp.add ?? ""}
            ctx={ctx}
            problems={problems.map((p) => p.display)}
            initialCode={sp.add}
            addOrder={addOrder.bind(null, id)}
            addOrderSet={addOrderSet.bind(null, id)}
          />
        )}

        <section className="rounded-md border border-line bg-panel">
          <header className="flex items-center justify-between border-b border-line px-3 py-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Active orders</h2>
            {active.some((o) => o.type !== "medication") && (
              <Link href={`/print/orders?patient=${id}`} className="text-[12px] font-medium text-accent hover:underline">
                Print requisition
              </Link>
            )}
          </header>
          {active.length === 0 ? <Empty>No active orders.</Empty> : <OrderTable orders={active} patientId={id} showActions={canSign} />}
        </section>

        <section className="rounded-md border border-line bg-panel">
          <header className="flex items-center justify-between border-b border-line px-3 py-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Order history</h2>
            {past.length > shownPast.length && (
              <Link href={`?history=all`} className="text-[12px] font-medium text-accent hover:underline">
                Show all {past.length}
              </Link>
            )}
          </header>
          {past.length === 0 ? <Empty>No completed or discontinued orders.</Empty> : <OrderTable orders={shownPast} patientId={id} />}
        </section>
      </div>

      <div className="xl:sticky xl:top-4 xl:w-[380px]">
        {canPend && (
          <PendingOrders
            rows={rows}
            remove={removePendingOrder.bind(null, id)}
            setPriority={updatePendingOrder.bind(null, id)}
            sign={canSign ? signOrders.bind(null, id) : undefined}
          />
        )}
      </div>
    </div>
  );
}

type OrderRow = Awaited<ReturnType<typeof db.serviceRequest.findMany<{ include: { orderedBy: true; reports: { select: { id: true } } } }>>>[number];

function OrderTable({ orders, patientId, showActions }: { orders: OrderRow[]; patientId: string; showActions?: boolean }) {
  return (
    <table className="w-full">
      <thead className="text-left text-[11.5px] text-ink-3">
        <tr>
          <th className="px-3 py-1.5 font-medium">Order</th>
          <th className="px-3 py-1.5 font-medium">Indication</th>
          <th className="px-3 py-1.5 font-medium">Ordered</th>
          <th className="px-3 py-1.5 font-medium">Status</th>
          <th className="px-3 py-1.5" />
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => (
          <tr key={o.id} className="border-t border-line align-top hover:bg-accent-soft/30">
            <td className="px-3 py-1.5">
              <div className="flex items-center gap-2">
                <OrderTypeIcon type={o.type} />
                <span className="font-medium">{o.display}</span>
                <PriorityChip priority={o.priority} />
              </div>
              {o.type === "medication" && <div className="pl-10 text-[12px] text-ink-2">{medSig(o.details)}</div>}
              {o.instructions && <div className="whitespace-pre-line pl-10 text-[12px] text-ink-3">{o.instructions}</div>}
            </td>
            <td className="px-3 py-1.5 text-ink-2">{o.indication ?? <span className="text-ink-3">—</span>}</td>
            <td className="whitespace-nowrap px-3 py-1.5 text-ink-2">
              <div className="tabular">{fmtDate(o.signedAt ?? o.createdAt)}</div>
              <div className="text-[11.5px] text-ink-3">{o.orderedBy.name}</div>
              {o.expectedAt && o.status === "signed" && <div className="text-[11.5px] text-ink-3">Due {fmtDateOnly(o.expectedAt)}</div>}
            </td>
            <td className="whitespace-nowrap px-3 py-1.5">
              <OrderStatusChip status={o.status} />
              {o.reports[0] && (
                <Link href={`/patients/${patientId}/results?view=reports&report=${o.reports[0].id}`} className="ml-2 text-[12px] font-medium text-accent hover:underline">
                  Result
                </Link>
              )}
              {o.completedAt && <div className="tabular mt-0.5 text-[11.5px] text-ink-3">{fmtDate(o.completedAt)}</div>}
            </td>
            <td className="whitespace-nowrap px-3 py-1.5 text-right">
              {showActions && (
                <div className="flex justify-end gap-1">
                  {o.type !== "lab" && o.type !== "medication" && (
                    <ActionButton variant="ghost" action={completeOrder.bind(null, patientId, o.id)}>
                      Mark done
                    </ActionButton>
                  )}
                  <ActionButton variant="danger" action={discontinueOrder.bind(null, patientId, o.id)} confirm={`Discontinue ${o.display}?`}>
                    Discontinue
                  </ActionButton>
                </div>
              )}
              {!showActions && <span className="text-[11px] text-ink-3">{typeLabels[o.type]}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
