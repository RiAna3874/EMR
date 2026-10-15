import { baseDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { searchRegistered } from "@/lib/meds/dgda-server";
import { Button, inputCls } from "@/components/form";
import { RefreshWhile } from "@/components/import/refresh-while";
import { refreshDrugList } from "./actions";

export const metadata = { title: "Drug list" };
export const dynamic = "force-dynamic";

// Bangladesh's DGDA registered drug list: when it was last copied from the DGHS
// terminology server, a button to refresh it, and a search to try it.
export default async function DrugList({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const q = ((await searchParams).q ?? "").trim();
  const [count, imports, hits] = await Promise.all([
    baseDb.registeredDrug.count(),
    baseDb.drugListImport.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    q ? searchRegistered(baseDb, q, 30) : Promise.resolve([]),
  ]);
  const running = imports.find((i) => i.status === "running");
  const lastDone = imports.find((i) => i.status === "done");

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <RefreshWhile active={!!running} intervalMs={3000} />
      <div className="mx-auto max-w-5xl px-6 py-6">
        <h1 className="text-[16px] font-semibold">Drug list</h1>
        <p className="mb-3 max-w-3xl text-[12.5px] text-ink-2">
          Every drug product registered with the Directorate General of Drug Administration (DGDA), copied from the DGHS national terminology server. Prescribe and
          outside medications find these brands by name, generic or company. The registry has brand, generic, strength, form and company only, so the prescriber writes the
          dose and frequency; allergy, interaction and dose checks run on the generic when the clinic&apos;s drug list knows it.
        </p>

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md border border-line bg-panel px-3 py-2.5 text-[12.5px]">
          <span>
            <span className="text-[15px] font-semibold tabular">{count.toLocaleString("en-US")}</span> registered products
            {lastDone?.finishedAt && <span className="text-ink-3"> · last refreshed {fmtDateTime(lastDone.finishedAt)}</span>}
          </span>
          <form action={refreshDrugList} className="ml-auto">
            <Button type="submit" disabled={!!running}>
              {running ? "Refreshing…" : count ? "Refresh from DGDA" : "Download from DGDA"}
            </Button>
          </form>
        </div>

        {running && (
          <p className="mb-3 rounded-md border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px]">
            Downloading: page {running.pages} done, {running.count.toLocaleString("en-US")} products so far. The current list stays in use until the download finishes.
          </p>
        )}
        {imports[0]?.status === "failed" && (
          <p className="mb-3 rounded-md border border-warn/40 bg-warn-soft px-3 py-2 text-[12.5px]">
            The last refresh ({fmtDateTime(imports[0].startedAt)}) failed: {imports[0].error}. The list from before was kept. If this server can&apos;t reach the DGHS
            server, load the list from a computer that can with <code className="font-mono">npm run drugs:dgda</code> (see docs/DRUG-LIST.md).
          </p>
        )}

        <form className="mb-2 flex gap-2">
          <input name="q" defaultValue={q} placeholder="Try a brand, generic or company: napa, amlodipine, square" className={`${inputCls} w-80`} />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        {q &&
          (hits.length ? (
            <table className="w-full overflow-hidden rounded-md border border-line bg-panel text-[12.5px]">
              <thead className="bg-panel-muted text-left text-[11.5px] text-ink-3">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Brand</th>
                  <th className="px-3 py-1.5 font-medium">Generic and strength</th>
                  <th className="px-3 py-1.5 font-medium">Form</th>
                  <th className="px-3 py-1.5 font-medium">Company</th>
                  <th className="px-3 py-1.5 font-medium">DAR number</th>
                </tr>
              </thead>
              <tbody>
                {hits.map((h) => (
                  <tr key={h.code} className="border-t border-line">
                    <td className="px-3 py-1.5 font-medium">{h.tradeName}</td>
                    <td className="px-3 py-1.5">{h.generic}</td>
                    <td className="px-3 py-1.5 text-ink-2">{h.dosageForm}</td>
                    <td className="px-3 py-1.5 text-ink-2">{h.company}</td>
                    <td className="px-3 py-1.5 font-mono text-[11.5px] text-ink-3">{h.darNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="rounded-md border border-line bg-panel px-3 py-6 text-center text-ink-3">{count ? "Nothing in the registry matches that." : "The list hasn't been downloaded yet."}</p>
          ))}
      </div>
    </div>
  );
}
