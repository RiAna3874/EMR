"use client";

import { useEffect, useRef, useState } from "react";
import type { Box } from "@/lib/labs/draft";

export type PageDoc = { id: string; url: string; mimeType: string; fileName: string };
export type PageMark = { id: string; file: number; box: Box | null; label: string; tone?: string };

// The source pages beside a review form. Marks show where each part was read
// from; clicking one selects it in the form, and selecting in the form scrolls here.
export function PageViewer({
  docs,
  file,
  setFile,
  marks,
  selected,
  onSelect,
  hint = "Click a highlighted area to find it in the form. Highlights are approximate; the page is the source of truth.",
}: {
  docs: PageDoc[];
  file: number;
  setFile: (n: number) => void;
  marks: PageMark[];
  selected: string | null;
  onSelect: (id: string) => void;
  hint?: string;
}) {
  const [zoom, setZoom] = useState(1);
  const [boxes, setBoxes] = useState(true);
  const selectedRef = useRef<HTMLButtonElement>(null);
  const doc = docs[file];

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [selected, file, zoom]);

  return (
    <div className="flex min-h-[50vh] flex-col bg-[#e9edf0] lg:w-[42%] lg:min-w-[360px]">
      <div className="flex flex-wrap items-center gap-1 border-b border-line bg-panel px-2 py-1.5 text-[12px]">
        {docs.map((d, i) => (
          <button key={d.id} onClick={() => setFile(i)} className={`rounded px-2 py-0.5 ${i === file ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}>
            Page {i + 1}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1">
          {doc?.mimeType.startsWith("image/") && (
            <>
              <label className="mr-2 flex items-center gap-1 text-ink-2">
                <input type="checkbox" checked={boxes} onChange={(e) => setBoxes(e.target.checked)} /> Highlights
              </label>
              {[1, 1.5, 2.5].map((z) => (
                <button key={z} onClick={() => setZoom(z)} className={`rounded px-2 py-0.5 ${zoom === z ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}>
                  {z === 1 ? "Fit" : `${z * 100}%`}
                </button>
              ))}
            </>
          )}
          {doc && (
            <a href={doc.url} target="_blank" rel="noreferrer" className="ml-1 rounded px-2 py-0.5 text-accent hover:bg-panel-muted">
              Open original
            </a>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {!doc ? (
          <p className="text-ink-3">No document.</p>
        ) : doc.mimeType === "application/pdf" ? (
          <iframe src={doc.url} title={doc.fileName} className="h-full min-h-[70vh] w-full rounded border border-line bg-panel" />
        ) : (
          <div className="relative mx-auto shadow-md" style={{ width: `${zoom * 100}%` }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={doc.url} alt={`Page ${file + 1}`} className="block w-full select-none" draggable={false} />
            {boxes &&
              marks
                .filter((m) => m.file === file && m.box)
                .map((m) => {
                  const b = m.box!;
                  const isSel = m.id === selected;
                  return (
                    <button
                      key={m.id}
                      ref={isSel ? selectedRef : undefined}
                      onClick={() => onSelect(m.id)}
                      title={m.label}
                      className={`absolute rounded-sm border ${isSel ? "z-10 border-2 border-accent bg-accent/15 ring-4 ring-accent/20" : `${m.tone ?? "border-accent/40"} hover:bg-accent/10`}`}
                      style={{ left: `${b.x0 * 100}%`, top: `${b.y0 * 100}%`, width: `${(b.x1 - b.x0) * 100}%`, height: `${(b.y1 - b.y0) * 100}%` }}
                    />
                  );
                })}
          </div>
        )}
      </div>
      <p className="border-t border-line bg-panel px-3 py-1 text-[11px] text-ink-3">{hint}</p>
    </div>
  );
}
