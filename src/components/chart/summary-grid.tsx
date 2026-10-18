"use client";

import { Sortable, useArrangement, type SortItem } from "@/components/arrange";

// The Summary tab's panels in the person's order; a panel they made wide spans two columns.
export function SummaryGrid({ panels }: { panels: SortItem[] }) {
  const wide = useArrangement("summary")?.wide ?? [];
  return (
    <Sortable
      area="summary"
      label="Summary panels"
      grip="top"
      className="grid grid-cols-1 gap-3 p-4 pt-2 xl:grid-cols-3"
      items={panels.map((p) => ({ ...p, className: `[&>section]:h-full ${wide.includes(p.key) ? "xl:col-span-2" : ""}` }))}
    />
  );
}
