"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AddMedia } from "./add-media";

// A media image that fits the pane, and opens to full size (scrollable) on click to look closer.
export function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(false);
  return (
    <div className={`relative rounded bg-[#1d2327] ${zoom ? "max-h-[75vh] overflow-auto" : "flex items-center justify-center"}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={() => setZoom((z) => !z)}
        className={zoom ? "max-w-none cursor-zoom-out" : "max-h-[62vh] w-auto max-w-full cursor-zoom-in object-contain"}
      />
      <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[11px] text-white">{zoom ? "Click to fit" : "Click to zoom"}</span>
    </div>
  );
}

// The add panel at the top of the Media tab (opened with ?add=1); closing it returns to the item shown.
export function AddMediaPanel({ patientId, closeHref }: { patientId: string; closeHref: string }) {
  const router = useRouter();
  return <AddMedia patientId={patientId} onClose={() => router.push(closeHref)} />;
}
