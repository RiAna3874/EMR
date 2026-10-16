"use client";

import { useRef, useState, useTransition } from "react";
import { uploadReport } from "@/app/patients/[id]/import/actions";
import { Button } from "@/components/form";

type Picked = { key: string; file: File; preview: string | null };

// Long edge for photos sent to Claude: enough to read small print, small enough to
// stay well under the 5 MB image limit.
const MAX_EDGE = 2000;

export type ImportKindChoice = "auto" | "lab" | "document";

// phone: sent from the phone view, which returns to its chart instead of opening the review screen.
export function UploadForm({ patientId, initialKind = "auto", phone = false }: { patientId: string; initialKind?: ImportKindChoice; phone?: boolean }) {
  const [kind, setKind] = useState<ImportKindChoice>(initialKind);
  const [picked, setPicked] = useState<Picked[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function add(list: FileList | null) {
    if (!list) return;
    setError(null);
    const next = [...list]
      .filter((f) => f.type.startsWith("image/") || f.type === "application/pdf")
      .map((file) => ({ key: `${file.name}-${file.size}-${Math.random()}`, file, preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null }));
    if (next.length < list.length) setError("Only photos and PDFs can be imported.");
    setPicked((p) => [...p, ...next]);
  }

  function remove(key: string) {
    setPicked((p) => p.filter((x) => x.key !== key));
  }

  function move(key: string, by: number) {
    setPicked((p) => {
      const i = p.findIndex((x) => x.key === key);
      const j = i + by;
      if (j < 0 || j >= p.length) return p;
      const copy = [...p];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function submit() {
    if (!picked.length) return;
    setError(null);
    start(async () => {
      try {
        setStage("Preparing pages…");
        const fd = new FormData();
        const sizes: { width: number | null; height: number | null }[] = [];
        for (const p of picked) {
          const { file, width, height } = await prepare(p.file);
          fd.append("files", file);
          sizes.push({ width, height });
        }
        fd.append("sizes", JSON.stringify(sizes));
        fd.append("kind", kind);
        if (phone) fd.append("from", "phone");
        setStage("Uploading…");
        const res = await uploadReport(patientId, fd);
        if (res?.error) setError(res.error);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setStage(null);
      }
    });
  }

  return (
    <div>
      <div role="radiogroup" aria-label="What are you importing?" className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="radio"
            aria-checked={kind === k.id}
            onClick={() => setKind(k.id)}
            className={`rounded-md border px-3 py-2 text-left ${kind === k.id ? "border-accent bg-accent-soft ring-2 ring-accent/15" : "border-line bg-panel hover:border-accent/50"}`}
          >
            <div className="font-semibold">{k.label}</div>
            <div className="text-[12px] text-ink-3">{k.hint}</div>
          </button>
        ))}
      </div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          add(e.dataTransfer.files);
        }}
        onClick={() => input.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-8 text-center ${
          dragging ? "border-accent bg-accent-soft" : "border-line bg-panel-muted hover:border-accent/60"
        }`}
      >
        <UploadIcon />
        <div className="font-medium">Drop {kind === "lab" ? "a lab report" : kind === "document" ? "a document" : "the report"} here, or click to choose</div>
        <div className="text-[12px] text-ink-3">Phone photo, scan or PDF. For more than one page, add every page in order.</div>
        <input
          ref={input}
          type="file"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {picked.length > 0 && (
        <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {picked.map((p, i) => (
            <li key={p.key} className="overflow-hidden rounded border border-line bg-panel">
              <div className="flex h-28 items-center justify-center bg-panel-muted">
                {p.preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.preview} alt={`Page ${i + 1}`} className="h-full w-full object-cover object-top" />
                ) : (
                  <span className="rounded bg-crit-soft px-2 py-1 text-[11px] font-bold text-crit">PDF</span>
                )}
              </div>
              <div className="flex items-center gap-1 px-2 py-1 text-[11.5px]">
                <span className="font-semibold text-ink-2">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-ink-3" title={p.file.name}>
                  {p.file.name}
                </span>
                <button type="button" className="px-1 text-ink-3 hover:text-ink" title="Move earlier" onClick={() => move(p.key, -1)}>
                  ←
                </button>
                <button type="button" className="px-1 text-ink-3 hover:text-ink" title="Move later" onClick={() => move(p.key, 1)}>
                  →
                </button>
                <button type="button" className="px-1 text-ink-3 hover:text-crit" title="Remove" onClick={() => remove(p.key)}>
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      {error && <p className="mt-2 rounded bg-crit-soft px-3 py-2 text-crit">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <Button type="button" onClick={submit} disabled={!picked.length || pending} className="px-4 py-1.5 disabled:opacity-50">
          {pending ? (stage ?? "Working…") : `Read ${kind === "document" ? "document" : "report"}${picked.length > 1 ? ` (${picked.length} pages)` : ""}`}
        </Button>
        <span className="text-[12px] text-ink-3">Claude transcribes it; nothing is filed until you verify it.</span>
      </div>
    </div>
  );
}

const KINDS: { id: ImportKindChoice; label: string; hint: string }[] = [
  { id: "auto", label: "Any report", hint: "Claude works out whether it is lab results or a written report." },
  { id: "lab", label: "Lab results", hint: "Values go into Results with flags and trends." },
  { id: "document", label: "Written report or letter", hint: "MRI, CT, X-ray, ultrasound, echo, biopsy, discharge summary, referral or consult letter." },
];

// Applies EXIF rotation and shrinks photos; PDFs pass through untouched.
async function prepare(file: File): Promise<{ file: File; width: number | null; height: number | null }> {
  if (file.type === "application/pdf") return { file, width: null, height: null };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`Couldn't open ${file.name}. Try a JPEG or PNG.`);
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  let blob: Blob | null = null;
  for (const q of [0.9, 0.8, 0.65]) {
    blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
    if (blob && blob.size < 4.5 * 1024 * 1024) break;
  }
  if (!blob) throw new Error(`Couldn't process ${file.name}.`);
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { file: new File([blob], name, { type: "image/jpeg" }), width, height };
}

function UploadIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-accent" aria-hidden>
      <path d="M12 16V4m0 0-4 4m4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" strokeLinecap="round" />
    </svg>
  );
}
