import type { OrderPriority, OrderStatus, OrderType } from "@prisma/client";
import type { OrderWarning } from "@/lib/orders/checks";
import { rxSummary, type RxDetails } from "@/lib/meds/rx";
import { takesDueDate } from "@/lib/orders/defaults";

const typeStyles: Record<OrderType, [string, string]> = {
  lab: ["LAB", "bg-accent-soft text-accent"],
  imaging: ["IMG", "bg-low-soft text-low"],
  procedure: ["PRC", "bg-low-soft text-low"],
  medication: ["RX", "bg-high-soft text-high"],
  referral: ["REF", "bg-panel-muted text-ink-2"],
};

export function OrderTypeIcon({ type }: { type: OrderType }) {
  const [label, cls] = typeStyles[type];
  return <span className={`inline-block w-8 shrink-0 rounded text-center text-[9.5px] font-bold leading-4 ${cls}`}>{label}</span>;
}

export function PriorityChip({ priority }: { priority: OrderPriority }) {
  if (priority === "routine") return null;
  return (
    <span className={`rounded px-1 text-[10px] font-bold uppercase ${priority === "stat" ? "bg-crit text-white" : "bg-warn-soft text-warn"}`}>
      {priority}
    </span>
  );
}

const statusStyles: Record<OrderStatus, string> = {
  pending: "bg-warn-soft text-warn border-warn/30",
  signed: "bg-accent-soft text-accent border-accent/30",
  completed: "bg-panel-muted text-ink-2 border-line",
  discontinued: "bg-panel-muted text-ink-3 border-line line-through",
};

const statusLabels: Record<OrderStatus, string> = {
  pending: "Unsigned",
  signed: "Active",
  completed: "Completed",
  discontinued: "Discontinued",
};

export function OrderStatusChip({ status }: { status: OrderStatus }) {
  return <span className={`rounded border px-1.5 py-0.5 text-[11px] ${statusStyles[status]}`}>{statusLabels[status]}</span>;
}

export function WarningList({ warnings }: { warnings: OrderWarning[] }) {
  if (!warnings.length) return null;
  return (
    <ul className="space-y-1">
      {warnings.map((w, i) => (
        <li
          key={i}
          className={`rounded border px-2 py-1 text-[12px] ${w.level === "stop" ? "border-crit/30 bg-crit-soft text-crit" : "border-warn/30 bg-warn-soft text-warn"}`}
        >
          <span className="font-semibold">
            {w.level === "stop" ? "Stop" : "Check"}
            {w.kind && !w.text.toLowerCase().startsWith(w.kind) && <span className="font-normal opacity-80"> · {w.kind}</span>}:{" "}
          </span>
          {w.text}
        </li>
      ))}
    </ul>
  );
}

export const medSig = (details: unknown) => rxSummary(details as Partial<RxDetails> | null);

type BasketSource = {
  id: string;
  type: OrderType;
  display: string;
  priority: OrderPriority;
  indication: string | null;
  conditionId: string | null;
  expectedAt: Date | null;
  instructions: string | null;
  details: unknown;
  orderSet: string | null;
  orderedById: string;
  orderedBy: { name: string };
};

// A pending order as the order basket shows it.
export function basketRow(o: BasketSource, viewerId: string, warnings: OrderWarning[] = []): BasketRow {
  return {
    id: o.id,
    type: o.type,
    display: o.display,
    priority: o.priority,
    indication: o.indication,
    conditionId: o.conditionId,
    expectedAt: o.expectedAt ? o.expectedAt.toISOString().slice(0, 10) : null,
    takesDate: takesDueDate(o),
    instructions: o.instructions,
    sig: medSig(o.details),
    orderSet: o.orderSet,
    pendedBy: o.orderedById === viewerId ? null : o.orderedBy.name,
    warnings,
  };
}

export type BasketRow = {
  id: string;
  type: OrderType;
  display: string;
  priority: OrderPriority;
  indication: string | null;
  conditionId: string | null;
  // YYYY-MM-DD
  expectedAt: string | null;
  takesDate: boolean;
  instructions: string | null;
  sig: string;
  orderSet: string | null;
  // Set when someone other than the viewer pended it.
  pendedBy: string | null;
  warnings: OrderWarning[];
};
