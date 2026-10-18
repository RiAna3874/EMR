"use client";

import { useEffect, useState } from "react";
import type { PatientCard } from "@/app/api/patients/[id]/card/route";
import { Hover } from "./hover-card";
import { HoverRows, HoverText, HoverTitle } from "./card-parts";

// A patient's name anywhere in the app: hover it for who they are, allergies, problems and meds.
// The card is fetched when it opens, so long lists cost nothing until someone hovers.
const cache = new Map<string, { at: number; card: PatientCard }>();
const KEEP_MS = 60_000;

export function PatientHover({ id, children, className, as }: { id: string; children: React.ReactNode; className?: string; as?: "span" | "div" | "td" }) {
  return (
    <Hover as={as} className={className} card={<PatientCardBody id={id} />} width={320}>
      {children}
    </Hover>
  );
}

function PatientCardBody({ id }: { id: string }) {
  const [card, setCard] = useState<PatientCard | null | "error">(() => {
    const hit = cache.get(id);
    return hit && Date.now() - hit.at < KEEP_MS ? hit.card : null;
  });
  useEffect(() => {
    if (card) return;
    let stop = false;
    fetch(`/api/patients/${id}/card`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((c: PatientCard) => {
        cache.set(id, { at: Date.now(), card: c });
        if (!stop) setCard(c);
      })
      .catch(() => !stop && setCard("error"));
    return () => {
      stop = true;
    };
  }, [id, card]);

  if (card === "error") return <HoverText muted>Couldn&apos;t load this patient.</HoverText>;
  if (!card) return <HoverText muted>Loading…</HoverText>;
  return (
    <>
      <HoverTitle sub={card.line}>{card.name}</HoverTitle>
      <div className={`px-3 py-1.5 ${card.allergyStatus === "listed" ? (card.allergies.some((a) => a.severe) ? "bg-crit text-white" : "bg-crit-soft text-crit") : card.allergyStatus === "not_reviewed" ? "bg-warn-soft text-warn" : "text-ok"}`}>
        {card.allergyStatus === "not_reviewed"
          ? "Allergies not reviewed"
          : card.allergyStatus === "none"
            ? "No known allergies"
            : card.allergies.map((a) => (
                <div key={a.substance} className="font-medium">
                  {a.substance}
                  {a.reaction && <span className="font-normal opacity-80"> · {a.reaction}</span>}
                </div>
              ))}
      </div>
      {card.codeStatus !== "Full code" && <div className="bg-ink px-3 py-1 text-[11.5px] font-semibold text-white">Code status: {card.codeStatus}</div>}
      <HoverRows
        rows={[
          ["MRN", <span key="m" className="font-mono">{card.mrn}</span>],
          ["Phone", card.phone],
          ["PCP", card.pcp ?? "None"],
          ["Language", card.language],
          ["Next visit", card.next],
          ["Last BP", card.clinical?.vitals],
        ]}
      />
      {card.clinical && card.clinical.problems.length > 0 && (
        <HoverText>
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Problems</div>
          {card.clinical.problems.map((p) => (
            <div key={p}>{p}</div>
          ))}
          {card.clinical.moreProblems > 0 && <div className="text-ink-3">+{card.clinical.moreProblems} more</div>}
        </HoverText>
      )}
      {card.clinical && card.clinical.meds.length > 0 && (
        <HoverText>
          <div className="mb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Medications</div>
          {card.clinical.meds.map((m) => (
            <div key={m} className="truncate">
              {m}
            </div>
          ))}
          {card.clinical.moreMeds > 0 && <div className="text-ink-3">+{card.clinical.moreMeds} more</div>}
        </HoverText>
      )}
    </>
  );
}
