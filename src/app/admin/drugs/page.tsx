import type { DrugListImport } from "@prisma/client";
import { baseDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { searchRegistered } from "@/lib/meds/dgda-server";
import { searchGenerics } from "@/lib/meds/generics-server";
import { Button, inputCls } from "@/components/form";
import { RefreshWhile } from "@/components/import/refresh-while";
import { refreshDrugList, refreshGenerics } from "./actions";

export const metadata = { title: "Drug list" };
export const dynamic = "force-dynamic";

const n = (x: number) => x.toLocaleString("en-US");

// The two downloaded drug lists: Bangladesh's DGDA registered brands and the worldwide
// generic names. When each was last refreshed, a button to refresh it, and a search to try them.
export default async function DrugList({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const q = ((await searchParams).q ?? "").trim();
  const [brands, generics, imports, brandHits, genericHits] = await Promise.all([
    baseDb.registeredDrug.count(),
    baseDb.genericDrug.count(),
    baseDb.drugListImport.findMany({ orderBy: { startedAt: "desc" }, take: 20 }),
    q ? searchRegistered(baseDb, q, 30) : Promise.resolve([]),
    q ? searchGenerics(baseDb, q, 30) : Promise.resolve([]),
  ]);
  const of = (source: string) => imports.filter((i) => i.source === source);
  const running = imports.some((i) => i.status === "running");

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <RefreshWhile active={running} intervalMs={3000} />
      <div className="mx-auto max-w-5xl px-6 py-6">
        <h1 className="text-[16px] font-semibold">Drug list</h1>
        <p className="mb-3 max-w-3xl text-[12.5px] text-ink-2">
          Prescribe and outside medications search the clinic&apos;s own list, then these two downloaded lists. Neither has doses: the prescriber writes the dose and
          frequency, and allergy, interaction and dose checks run on the generic when the clinic&apos;s safety checks know it.
        </p>

        <ListCard
          title="Bangladesh registered brands (DGDA)"
          about="Every drug product registered with the Directorate General of Drug Administration, from the DGHS national terminology server: brand, generic and strength, form, company and DAR number."
          count={brands}
          unit="registered products"
          imports={of("dgda")}
          progress={(i) => `page ${i.pages} done, ${n(i.count)} products so far`}
          action={refreshDrugList}
          button={brands ? "Refresh from DGDA" : "Download from DGDA"}
          fallback="npm run drugs:dgda"
        />
        <ListCard
          title="Generic names, worldwide (RxNorm and Wikidata)"
          about="Every ingredient in RxNorm (US National Library of Medicine), joined with Wikidata's medicines for international and British names (paracetamol, salbutamol), Bangla names and WHO ATC drug classes, so a search for a class like “macrolide” works too."
          count={generics}
          unit="generic names"
          imports={of("generics")}
          progress={(i) => `step ${i.pages} of 3 (${["", "RxNorm ingredients", "ATC classes", "Wikidata"][i.pages] ?? "starting"} done)`}
          action={refreshGenerics}
          button={generics ? "Refresh from RxNorm and Wikidata" : "Download from RxNorm and Wikidata"}
          fallback="npm run drugs:generics"
        />

        <form className="mb-2 mt-5 flex gap-2">
          <input name="q" defaultValue={q} placeholder="Try a brand, generic, class or company: napa, salbutamol, macrolide, square" className={`${inputCls} w-96`} />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        {q && (
          <>
            <h2 className="mb-1 mt-3 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Generic names ({genericHits.length})</h2>
            {genericHits.length ? (
              <table className="mb-4 w-full overflow-hidden rounded-md border border-line bg-panel text-[12.5px]">
                <thead className="bg-panel-muted text-left text-[11.5px] text-ink-3">
                  <tr>
                    <th className="px-3 py-1.5 font-medium">Generic</th>
                    <th className="px-3 py-1.5 font-medium">Other names</th>
                    <th className="px-3 py-1.5 font-medium">Bangla</th>
                    <th className="px-3 py-1.5 font-medium">Class</th>
                  </tr>
                </thead>
                <tbody>
                  {genericHits.map((h) => (
                    <tr key={h.code} className="border-t border-line align-top">
                      <td className="px-3 py-1.5 font-medium">{h.name}</td>
                      <td className="px-3 py-1.5 text-ink-2">{h.otherNames.split("; ").slice(0, 4).join(", ")}</td>
                      <td className="px-3 py-1.5">{h.bangla}</td>
                      <td className="px-3 py-1.5 text-ink-2">{h.classes.split("; ").slice(0, 2).join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <Empty text={generics ? "No generic name matches that." : "The generic names haven't been downloaded yet."} />
            )}
            <h2 className="mb-1 mt-3 text-[12px] font-semibold uppercase tracking-wide text-ink-2">Registered brands ({brandHits.length})</h2>
            {brandHits.length ? (
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
                  {brandHits.map((h) => (
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
              <Empty text={brands ? "No registered brand matches that." : "The DGDA list hasn't been downloaded yet."} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="mb-4 rounded-md border border-line bg-panel px-3 py-4 text-center text-ink-3">{text}</p>;
}

function ListCard(props: {
  title: string;
  about: string;
  count: number;
  unit: string;
  imports: DrugListImport[];
  progress: (i: DrugListImport) => string;
  action: () => Promise<void>;
  button: string;
  fallback: string;
}) {
  const running = props.imports.find((i) => i.status === "running");
  const lastDone = props.imports.find((i) => i.status === "done");
  const failed = props.imports[0]?.status === "failed" ? props.imports[0] : undefined;
  return (
    <section className="mb-3 rounded-md border border-line bg-panel px-3 py-2.5 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{props.title}</h2>
          <p className="max-w-3xl text-[12px] text-ink-3">{props.about}</p>
        </div>
        <span>
          <span className="text-[15px] font-semibold tabular">{n(props.count)}</span> {props.unit}
          {lastDone?.finishedAt && <span className="block text-[11.5px] text-ink-3">last refreshed {fmtDateTime(lastDone.finishedAt)}</span>}
        </span>
        <form action={props.action}>
          <Button type="submit" disabled={!!running}>
            {running ? "Refreshing…" : props.button}
          </Button>
        </form>
      </div>
      {running && (
        <p className="mt-2 rounded border border-accent/30 bg-accent-soft px-2.5 py-1.5">
          Downloading: {props.progress(running)}. The current list stays in use until the download finishes.
        </p>
      )}
      {failed && (
        <p className="mt-2 rounded border border-warn/40 bg-warn-soft px-2.5 py-1.5">
          The last refresh ({fmtDateTime(failed.startedAt)}) failed: {failed.error}. The list from before was kept. If this server can&apos;t reach the source, load the
          list from a computer that can with <code className="font-mono">{props.fallback}</code> (see docs/DRUG-LIST.md).
        </p>
      )}
    </section>
  );
}
