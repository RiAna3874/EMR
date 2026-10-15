import type { SmsKind, SmsStatus } from "@prisma/client";

export const SMS_KIND_LABEL: Record<SmsKind, string> = {
  orders: "Orders signed",
  refill: "Refill approved",
  manual: "Typed",
};

const STATUS: Record<SmsStatus, { label: string; cls: string }> = {
  queued: { label: "Sending", cls: "bg-panel-muted text-ink-2" },
  sent: { label: "Sent", cls: "bg-accent-soft text-accent" },
  failed: { label: "Not sent: failed", cls: "bg-crit-soft text-crit" },
  logged: { label: "Not sent: no gateway", cls: "bg-warn-soft text-warn" },
};

export function SmsStatusChip({ status }: { status: SmsStatus }) {
  const s = STATUS[status];
  return <span className={`inline-block rounded px-1.5 py-0.5 text-[11.5px] font-medium ${s.cls}`}>{s.label}</span>;
}
