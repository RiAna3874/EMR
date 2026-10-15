import { requireUser } from "@/lib/session";
import { logChartView } from "@/lib/audit/server";
import { searchChart } from "@/lib/search/chart";
import { isHitKind } from "@/lib/search/types";
import { ChartSearch } from "@/components/search/chart-search";

// Search everything in this chart. Typing searches again through the API route;
// a link with ?q= opens with the results already there.
export default async function Search({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string; kind?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const q = (sp.q ?? "").trim();
  const kind = sp.kind && isHitKind(sp.kind) ? sp.kind : null;
  const initial = q ? await searchChart(id, user, q, { kind: kind ?? undefined }) : null;
  if (q) await logChartView(id, "Search");
  return <ChartSearch key={id} patientId={id} initialQuery={q} initialKind={kind} initial={initial} />;
}
