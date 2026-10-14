"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ORDERABLES,
  ORDER_SETS,
  orderableByCode,
  orderableFor,
  orderSetById,
  searchOrderSets,
  searchOrderables,
  typeLabels,
  type OrderSet,
  type Orderable,
} from "@/lib/orders/catalog";
import { orderWarnings, type OrderContext } from "@/lib/orders/checks";
import { OrderTypeIcon } from "./order-bits";
import { RxForm, type PharmacyOption } from "@/components/meds/rx-form";
import { productByCode } from "@/lib/meds/formulary";
import type { ProblemOption } from "@/components/problem-picker";

type BasketResult = { added?: string; error?: string };

type Props = {
  ctx: OrderContext;
  problems: ProblemOption[];
  initialCode?: string;
  // Starred orders ("SET:<id>" for an order set) and the clinician's most-used orders.
  favorites: string[];
  frequent: string[];
  // Codes already in the order basket.
  basketCodes: string[];
  addOrder: (form: FormData) => Promise<void>;
  quickAdd: (code: string) => Promise<BasketResult>;
  addOrderSet: (setId: string) => Promise<BasketResult>;
  toggleFavorite: (code: string) => Promise<void>;
  pharmacies: PharmacyOption[];
  preferredPharmacyId: string | null;
};

type Hit = { kind: "set"; set: OrderSet } | { kind: "order"; o: Orderable };
const hitKey = (h: Hit) => (h.kind === "set" ? `SET:${h.set.id}` : h.o.code);

// One search box for labs, imaging, procedures, referrals, medications and order sets.
// Picking an order puts it straight into the order basket with sensible defaults; a
// medication opens the prescription form first, since it needs a sig. With nothing
// typed, the clinician's favorites, frequent orders and order sets are one click away.
export function OrderComposer({ ctx, problems, initialCode, favorites, frequent, basketCodes, addOrder, quickAdd, addOrderSet, toggleFavorite, pharmacies, preferredPharmacyId }: Props) {
  const [q, setQ] = useState("");
  const [browse, setBrowse] = useState(false);
  const [rx, setRx] = useState<Orderable | null>(() => {
    const o = initialCode ? orderableByCode.get(initialCode) : undefined;
    return o?.type === "medication" ? o : null;
  });
  const [active, setActive] = useState(0);
  const [flash, setFlash] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const searchRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const inBasket = useMemo(() => new Set(basketCodes), [basketCodes]);
  const favs = useMemo(() => new Set(favorites), [favorites]);

  const hits: Hit[] = useMemo(() => {
    const first = q.trim().toLowerCase().split(/\s+/)[0];
    if (!first) return [];
    // Orders whose name or abbreviation starts with what was typed, then order sets, then the rest.
    const orders = searchOrderables(q, 14).map((o) => ({ kind: "order" as const, o }));
    const lead = orders.filter(({ o }) => [o.display, ...(o.keywords ?? [])].some((k) => k.toLowerCase().startsWith(first)));
    const sets = searchOrderSets(q, 3).map((set) => ({ kind: "set" as const, set }));
    const setLead = sets.filter(({ set }) => set.name.toLowerCase().startsWith(first));
    return [...setLead, ...lead, ...sets.filter((s) => !setLead.includes(s)), ...orders.filter((o) => !lead.includes(o))];
  }, [q]);

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  // From the command palette (?add=CODE): straight into the basket.
  const handled = useRef(false);
  useEffect(() => {
    if (handled.current || !initialCode) return;
    handled.current = true;
    const o = orderableByCode.get(initialCode);
    if (o && o.type !== "medication") add(o);
    router.replace(pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function done(res: BasketResult) {
    setFlash(res.error ? { text: res.error, error: true } : { text: `Added ${res.added} to the order basket.` });
    setQ("");
    setActive(0);
    searchRef.current?.focus();
  }

  function add(o: Orderable) {
    if (o.type === "medication") {
      setRx(o);
      setQ("");
      return;
    }
    if (inBasket.has(o.code)) return done({ error: `${o.display} is already in the order basket.` });
    start(async () => done(await quickAdd(o.code)));
  }

  function addSet(s: OrderSet) {
    start(async () => done(await addOrderSet(s.id)));
  }

  function choose(h: Hit) {
    if (h.kind === "set") addSet(h.set);
    else add(h.o);
  }

  function star(code: string) {
    start(() => toggleFavorite(code));
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      choose(hits[active]);
    } else if (e.key === "Escape") {
      setQ("");
    }
  }

  const favoriteHits = favorites
    .map((c): Hit | null => {
      if (c.startsWith("SET:")) {
        const set = orderSetById.get(c.slice(4));
        return set ? { kind: "set", set } : null;
      }
      const o = orderableFor(c);
      return o ? { kind: "order", o } : null;
    })
    .filter((h): h is Hit => !!h);
  const frequentHits = frequent
    .filter((c) => !favs.has(c))
    .map((c) => orderableFor(c))
    .filter((o): o is Orderable => !!o)
    .map((o): Hit => ({ kind: "order", o }));

  const chip = (h: Hit) => (
    <PickChip key={hitKey(h)} hit={h} ctx={ctx} inBasket={h.kind === "order" && inBasket.has(h.o.code)} starred={favs.has(hitKey(h))} disabled={pending} onPick={() => choose(h)} onStar={() => star(hitKey(h))} />
  );

  return (
    <section className="rounded-md border border-line bg-panel">
      <div className="border-b border-line p-3">
        <div className="relative">
          <svg aria-hidden viewBox="0 0 20 20" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="9" r="6" />
            <path d="m14 14 4 4" strokeLinecap="round" />
          </svg>
          <input
            ref={searchRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
              setRx(null);
            }}
            onKeyDown={onKey}
            placeholder="Find an order: CBC, chest x-ray, echo, Napa, diabetes order set…"
            className="w-full rounded-md border border-line bg-panel py-2 pl-9 pr-3 text-[14px] outline-none focus:border-accent focus:ring-2 focus:ring-accent/15"
            aria-label="Search orders"
            autoFocus={!initialCode}
          />
        </div>
        <div className="mt-1.5 flex min-h-5 items-center justify-between gap-2 text-[12px]">
          {flash ? (
            <span role="status" className={flash.error ? "text-warn" : "text-ok"}>
              {flash.error ? "" : "✓ "}
              {flash.text}
            </span>
          ) : (
            <span className="text-ink-3">Click an order or press Enter to put it in the basket. Change details there, then sign.</span>
          )}
          {pending && <span className="text-ink-3">Adding…</span>}
        </div>
      </div>

      {rx && productByCode.get(rx.code) ? (
        <RxForm
          key={rx.code}
          product={productByCode.get(rx.code)!}
          ctx={ctx}
          problems={problems}
          pharmacies={pharmacies}
          preferredPharmacyId={preferredPharmacyId}
          pending={pending}
          submitLabel="Add to order basket"
          onCancel={() => {
            setRx(null);
            searchRef.current?.focus();
          }}
          onSubmit={(form) =>
            start(async () => {
              await addOrder(form);
              setRx(null);
              done({ added: rx.display });
            })
          }
        />
      ) : q.trim() ? (
        <ul role="listbox" aria-label="Matching orders" className="max-h-[420px] overflow-y-auto">
          {hits.length === 0 && <li className="px-3 py-4 text-ink-3">Nothing matches “{q}”. Try another name or an abbreviation (CBC, CXR, TSH).</li>}
          {hits.map((h, i) => (
            <ResultRow
              key={hitKey(h)}
              hit={h}
              ctx={ctx}
              active={i === active}
              inBasket={h.kind === "order" && inBasket.has(h.o.code)}
              starred={favs.has(hitKey(h))}
              disabled={pending}
              onHover={() => setActive(i)}
              onPick={() => choose(h)}
              onStar={() => star(hitKey(h))}
            />
          ))}
        </ul>
      ) : (
        <div className="space-y-4 p-3">
          <PickGroup title="Favorites" empty="Star (☆) any order or order set to keep it here.">
            {favoriteHits.map(chip)}
          </PickGroup>
          {frequentHits.length > 0 && <PickGroup title="Your frequent orders">{frequentHits.map(chip)}</PickGroup>}
          <PickGroup title="Order sets">{ORDER_SETS.map((set) => chip({ kind: "set", set }))}</PickGroup>
          <div>
            <button onClick={() => setBrowse((b) => !b)} className="text-[12px] font-medium text-accent hover:underline">
              {browse ? "Hide the full list" : `Browse all ${ORDERABLES.length} orders`}
            </button>
            {browse && <BrowseAll ctx={ctx} inBasket={inBasket} disabled={pending} onPick={add} />}
          </div>
        </div>
      )}
    </section>
  );
}

function PickGroup({ title, empty, children }: { title: string; empty?: string; children: React.ReactNode[] }) {
  return (
    <div>
      <h3 className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">{title}</h3>
      {children.length ? <div className="flex flex-wrap gap-1.5">{children}</div> : <p className="text-[12px] text-ink-3">{empty}</p>}
    </div>
  );
}

function alertOf(o: Orderable, ctx: OrderContext) {
  const w = orderWarnings(o, ctx);
  return w.some((x) => x.level === "stop") ? "stop" : w.length ? "caution" : null;
}

function AlertTag({ level }: { level: "stop" | "caution" | null }) {
  if (!level) return null;
  return level === "stop" ? (
    <span className="rounded bg-crit-soft px-1 text-[10px] font-semibold text-crit">ALERT</span>
  ) : (
    <span className="rounded bg-warn-soft px-1 text-[10px] font-semibold text-warn">CHECK</span>
  );
}

function StarButton({ starred, label, onClick, disabled }: { starred: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={starred ? `Remove ${label} from favorites` : `Add ${label} to favorites`}
      aria-pressed={starred}
      title={starred ? "Remove from favorites" : "Add to favorites"}
      disabled={disabled}
      // Keep the cursor in the search box.
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded px-1 text-[14px] leading-none ${starred ? "text-warn" : "text-ink-3 hover:text-warn"}`}
    >
      {starred ? "★" : "☆"}
    </button>
  );
}

function PickChip({ hit, ctx, inBasket, starred, disabled, onPick, onStar }: { hit: Hit; ctx: OrderContext; inBasket: boolean; starred: boolean; disabled: boolean; onPick: () => void; onStar: () => void }) {
  const name = hit.kind === "set" ? hit.set.name : hit.o.display;
  return (
    <span
      className={`group inline-flex items-center gap-1 rounded-full border py-0.5 pl-1 pr-1.5 ${inBasket ? "border-accent/40 bg-accent-soft" : "border-line bg-panel hover:border-accent hover:bg-accent-soft/40"}`}
    >
      <button type="button" disabled={disabled || inBasket} onClick={onPick} title={hit.kind === "set" ? hit.set.description : undefined} className="inline-flex items-center gap-1.5 text-left">
        {hit.kind === "set" ? <span className="inline-block w-8 shrink-0 rounded bg-chrome text-center text-[9.5px] font-bold leading-4 text-white">SET</span> : <OrderTypeIcon type={hit.o.type} />}
        <span className="text-[12.5px]">{name}</span>
        {hit.kind === "order" && !inBasket && <AlertTag level={alertOf(hit.o, ctx)} />}
        {inBasket && <span className="text-[11px] font-medium text-accent">✓ in basket</span>}
      </button>
      <StarButton starred={starred} label={name} onClick={onStar} disabled={disabled} />
    </span>
  );
}

function ResultRow({ hit, ctx, active, inBasket, starred, disabled, onHover, onPick, onStar }: { hit: Hit; ctx: OrderContext; active: boolean; inBasket: boolean; starred: boolean; disabled: boolean; onHover: () => void; onPick: () => void; onStar: () => void }) {
  const name = hit.kind === "set" ? hit.set.name : hit.o.display;
  return (
    <li role="option" aria-selected={active} onMouseMove={active ? undefined : onHover} className={`flex items-center gap-2 border-t border-line px-3 first:border-t-0 ${active ? "bg-accent-soft" : ""}`}>
      <button type="button" disabled={disabled} onClick={onPick} className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left">
        {hit.kind === "set" ? <span className="inline-block w-8 shrink-0 rounded bg-chrome text-center text-[9.5px] font-bold leading-4 text-white">SET</span> : <OrderTypeIcon type={hit.o.type} />}
        <span className="min-w-0 flex-1">
          <span className="font-medium">{name}</span>
          {hit.kind === "set" && <span className="ml-2 text-[12px] text-ink-3">{hit.set.description}</span>}
          {hit.kind === "order" && hit.o.specimen && <span className="ml-2 text-[11.5px] text-ink-3">{hit.o.specimen}</span>}
        </span>
        {hit.kind === "order" && !inBasket && <AlertTag level={alertOf(hit.o, ctx)} />}
        {inBasket ? (
          <span className="text-[11px] font-medium text-accent">✓ in basket</span>
        ) : (
          <span className="text-[11px] text-ink-3">{hit.kind === "set" ? "Order set" : hit.o.type === "medication" ? "Prescribe…" : typeLabels[hit.o.type]}</span>
        )}
      </button>
      <StarButton starred={starred} label={name} onClick={onStar} disabled={disabled} />
    </li>
  );
}

const BROWSE_GROUPS: [string, (o: Orderable) => boolean][] = [
  ["Labs", (o) => o.type === "lab"],
  ["Imaging and tests", (o) => o.type === "imaging" || o.type === "procedure"],
  ["Referrals", (o) => o.type === "referral"],
  ["Medications", (o) => o.type === "medication"],
];

function BrowseAll({ ctx, inBasket, disabled, onPick }: { ctx: OrderContext; inBasket: Set<string>; disabled: boolean; onPick: (o: Orderable) => void }) {
  return (
    <div className="mt-2 grid max-h-96 grid-cols-1 gap-3 overflow-y-auto rounded border border-line p-2 md:grid-cols-2">
      {BROWSE_GROUPS.map(([title, test]) => (
        <div key={title}>
          <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</h4>
          <ul>
            {ORDERABLES.filter(test).map((o) => (
              <li key={o.code}>
                <button type="button" disabled={disabled || inBasket.has(o.code)} onClick={() => onPick(o)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[12.5px] hover:bg-accent-soft/50 disabled:opacity-60">
                  <span className="flex-1">{o.display}</span>
                  {inBasket.has(o.code) ? <span className="text-[11px] text-accent">✓</span> : <AlertTag level={alertOf(o, ctx)} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
