"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { OrderContext } from "@/lib/orders/checks";
import { FORMULARY, offListProduct, productFor, type Product } from "@/lib/meds/formulary";
import { isControlled, medWarnings } from "@/lib/meds/checks";
import type { RxDetails } from "@/lib/meds/rx";
import { RxForm, type PharmacyOption } from "./rx-form";
import { useDrugSearch } from "./use-drug-search";
import type { ProblemOption } from "@/components/problem-picker";

export type RxStart = {
  code: string;
  initial?: Partial<RxDetails> & { indication?: string | null; conditionId?: string | null; pharmacyNote?: string | null };
  replaces?: { id: string; drug: string; mode: "reorder" | "modify" };
  refillRequestId?: string;
  // A prescription already in the order basket, being changed: saving swaps it out.
  editsOrderId?: string;
};

function search(q: string) {
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return FORMULARY.filter((p) => terms.every((t) => [p.display, ...(p.keywords ?? [])].join(" ").toLowerCase().includes(t))).slice(0, 10);
}

// New prescriptions from the Meds tab: search the formulary, write the sig, and
// add it to pending orders to sign. Reorders and changes start prefilled.
export function RxComposer({
  ctx,
  problems,
  pharmacies,
  preferredPharmacyId,
  start: initialStart,
  addOrder,
  canSign,
}: {
  ctx: OrderContext;
  problems: ProblemOption[];
  pharmacies: PharmacyOption[];
  preferredPharmacyId: string | null;
  start?: RxStart;
  addOrder: (form: FormData) => Promise<void>;
  canSign: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [start, setStart] = useState<RxStart | undefined>(initialStart);
  const [pending, startTransition] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const listed = useMemo(() => search(q), [q]);
  // Then every brand registered with the DGDA and every generic in the world (Admin > Drug list).
  const found = useDrugSearch(q, !start);
  const results = useMemo(() => {
    const seen = new Set(listed.map((p) => p.display.toLowerCase()));
    const more = found.flatMap((h) => {
      const p = productFor({ code: h.code });
      if (!p || seen.has(p.display.toLowerCase())) return [];
      seen.add(p.display.toLowerCase());
      return [p];
    });
    return [...listed, ...more];
  }, [listed, found]);
  const detailOf = useMemo(() => new Map(found.map((h) => [h.code, h.detail])), [found]);
  const product: Product | undefined = start ? productFor({ code: start.code }) : undefined;
  // Anything typed can be prescribed by name when the list doesn't have it.
  const offList = q.trim().length >= 3 ? offListProduct(q) : undefined;
  const pickOffList = () => offList && setStart({ code: `RX:${offList.rxnorm}` });

  const clear = () => {
    setStart(undefined);
    setQ("");
    // Drop ?rx= so a reload doesn't reopen the reorder.
    if (initialStart) router.replace("?", { scroll: false });
    searchRef.current?.focus();
  };

  return (
    <section id="prescribe" className="rounded-md border border-line bg-panel">
      <header className="flex items-center gap-3 border-b border-line px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Prescribe</h2>
        {!product && (
          <div className="relative flex-1">
            <input
              ref={searchRef}
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, results.length - 1));
                } else if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === "Enter" && results[active]) {
                  e.preventDefault();
                  setStart({ code: `RX:${results[active].rxnorm}` });
                } else if (e.key === "Enter" && offList) {
                  e.preventDefault();
                  pickOffList();
                }
              }}
              placeholder="Search medications by name, brand or use (e.g. napa, seclo, metformin, gout)…"
              className="w-full rounded border border-line bg-panel px-2 py-1 text-[13px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
              aria-label="Search medications"
            />
            {(results.length > 0 || offList) && (
              <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded border border-line bg-panel shadow-lg" role="listbox">
                {results.map((p, i) => {
                  const w = medWarnings(p.display, { dose: p.dose, frequency: p.frequency, refills: p.refills }, ctx);
                  return (
                    <li key={p.rxnorm} role="option" aria-selected={i === active}>
                      <button
                        type="button"
                        onMouseEnter={() => setActive(i)}
                        onClick={() => setStart({ code: `RX:${p.rxnorm}` })}
                        className={`flex w-full items-center gap-2 border-t border-line px-3 py-1.5 text-left first:border-t-0 ${i === active ? "bg-accent-soft" : ""}`}
                      >
                        <span className="flex-1">
                          {p.display}
                          <span className="ml-2 text-[11.5px] text-ink-3">
                            {p.dar || p.generic ? detailOf.get(`RX:${p.rxnorm}`) : `${p.dose} ${p.frequency}`}
                          </span>
                        </span>
                        {p.dar && <span className="rounded bg-panel-muted px-1 text-[10px] font-semibold text-ink-3">DGDA</span>}
                        {p.generic && <span className="rounded bg-panel-muted px-1 text-[10px] font-semibold text-ink-3">GENERIC</span>}
                        {isControlled(p.display) && <span className="rounded bg-crit-soft px-1 text-[10px] font-bold text-crit">Controlled</span>}
                        {w.some((x) => x.level === "stop") ? (
                          <span className="rounded bg-crit-soft px-1.5 text-[10.5px] font-semibold text-crit">ALERT</span>
                        ) : w.some((x) => x.kind !== "controlled") ? (
                          <span className="rounded bg-warn-soft px-1.5 text-[10.5px] font-semibold text-warn">CHECK</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
                {offList && (
                  <li role="option" aria-selected={!results.length}>
                    <button
                      type="button"
                      onClick={pickOffList}
                      className={`flex w-full items-center gap-2 border-t border-line px-3 py-1.5 text-left first:border-t-0 ${results.length ? "" : "bg-accent-soft"}`}
                    >
                      <span className="flex-1">
                        Prescribe “{offList.display}” by name
                        <span className="ml-2 text-[11.5px] text-ink-3">not on the list; checks may not cover it</span>
                      </span>
                    </button>
                  </li>
                )}
              </ul>
            )}
          </div>
        )}
        {!canSign && <span className="text-[11.5px] text-ink-3">Prescriptions you write are pended for a prescriber to sign.</span>}
      </header>
      {product && start ? (
        <RxForm
          key={`${start.code}:${start.replaces?.id ?? ""}:${start.editsOrderId ?? ""}`}
          product={product}
          ctx={ctx}
          problems={problems}
          pharmacies={pharmacies}
          preferredPharmacyId={preferredPharmacyId}
          initial={start.initial}
          replaces={start.replaces}
          refillRequestId={start.refillRequestId}
          editsOrderId={start.editsOrderId}
          pending={pending}
          onCancel={clear}
          onSubmit={(form) =>
            startTransition(async () => {
              await addOrder(form);
              clear();
            })
          }
        />
      ) : (
        <p className="px-3 py-2.5 text-[12px] text-ink-3">
          Checks run as you write: allergies, interactions with current medications, duplicate therapy, dose limits, kidney function, age, and controlled-drug rules. Every brand registered with the DGDA and every generic name in the world can be found too; anything else can be prescribed by name, unchecked.
        </p>
      )}
    </section>
  );
}
