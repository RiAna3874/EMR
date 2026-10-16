"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMedia } from "@/app/patients/[id]/media/actions";
import { Button, Field, inputCls } from "@/components/form";
import { BODY_SITES, checkMediaDetails, MAX_MEDIA_FILES, MEDIA_CATEGORIES, suggestedTitle, takesBodySite, type MediaCategory } from "@/lib/media/categories";

type Picked = {
  key: string;
  file: File;
  preview: string | null;
  title: string;
  named: boolean; // the user typed a name; stop suggesting one
  category: MediaCategory;
  bodySite: string;
  description: string;
  takenOn: string;
};

// Long edge kept for clinical photos (sharp enough to zoom on a finding) and for grid thumbnails.
const MAX_EDGE = 2400;
const THUMB_EDGE = 360;

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Taking or uploading photos and scans for the Media tab, naming each one before it is filed.
// savedHref: where to go once filed (the phone view's Media screen); the full site's Media tab by default.
export function AddMedia({ patientId, onClose, savedHref }: { patientId: string; onClose: () => void; savedHref?: (firstId: string) => string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Picked[]>([]);
  const [camera, setCamera] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [pending, start] = useTransition();
  const chooser = useRef<HTMLInputElement>(null);
  const phoneCamera = useRef<HTMLInputElement>(null);
  const last = picked[picked.length - 1];

  function add(files: File[]) {
    setError(null);
    const ok = files.filter((f) => f.type.startsWith("image/") || f.type === "application/pdf");
    if (ok.length < files.length) setError("Only photos and PDFs can be added.");
    // New items start as the previous one was filed (a series of photos of one finding).
    const category: MediaCategory = last?.category ?? "clinical_photo";
    const bodySite = last?.bodySite ?? "";
    setPicked((p) =>
      [
        ...p,
        ...ok.map((file) => ({
          key: `${file.name}-${file.size}-${Math.random()}`,
          file,
          preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
          title: suggestedTitle(category, bodySite),
          named: false,
          category,
          bodySite,
          description: "",
          takenOn: today(),
        })),
      ].slice(0, MAX_MEDIA_FILES),
    );
  }

  function set(key: string, patch: Partial<Picked>) {
    setPicked((p) =>
      p.map((x) => {
        if (x.key !== key) return x;
        const next = { ...x, ...patch };
        if (!next.named && ("category" in patch || "bodySite" in patch)) next.title = suggestedTitle(next.category, takesBodySite(next.category) ? next.bodySite : "");
        return next;
      }),
    );
  }

  function takePhoto() {
    // Phones and tablets open their own camera app; computers use the webcam in a window here.
    if (window.matchMedia("(pointer: coarse)").matches || !navigator.mediaDevices?.getUserMedia) phoneCamera.current?.click();
    else setCamera(true);
  }

  function save() {
    const errors = picked.flatMap((p) => checkMediaDetails(p, today()).map((e) => `${p.title.trim() || p.file.name}: ${e}`));
    if (errors.length) return setError(errors[0]);
    setError(null);
    start(async () => {
      try {
        setStage("Preparing…");
        const fd = new FormData();
        const items = [];
        for (const p of picked) {
          const { file, thumb, width, height } = await prepare(p.file);
          fd.append("files", file);
          fd.append("thumbs", thumb ?? new Blob([]));
          items.push({ title: p.title, category: p.category, bodySite: takesBodySite(p.category) ? p.bodySite : "", description: p.description, takenOn: p.takenOn, width, height });
        }
        fd.append("items", JSON.stringify(items));
        setStage("Saving…");
        const res = await addMedia(patientId, fd);
        if ("error" in res) return setError(res.error);
        picked.forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
        setPicked([]);
        router.push(savedHref ? savedHref(res.ids[0]) : `/patients/${patientId}/media?item=${res.ids[0]}`);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Saving failed.");
      } finally {
        setStage(null);
      }
    });
  }

  return (
    <section className="rounded-md border border-accent/40 bg-panel">
      <header className="flex items-center justify-between border-b border-line px-3 py-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">Add to Media</h2>
        <button type="button" className="text-ink-3 hover:text-ink" onClick={onClose} title="Close">
          ✕
        </button>
      </header>
      <div className="space-y-3 p-3">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            add([...e.dataTransfer.files]);
          }}
          className={`flex flex-wrap items-center gap-2 rounded-md border-2 border-dashed px-3 py-3 ${dragging ? "border-accent bg-accent-soft" : "border-line bg-panel-muted"}`}
        >
          <Button type="button" onClick={takePhoto} className="flex items-center gap-1.5 px-3 py-1.5">
            <CameraIcon /> Take photo
          </Button>
          <Button type="button" variant="secondary" onClick={() => chooser.current?.click()} className="px-3 py-1.5">
            Choose photos or PDFs
          </Button>
          <span className="text-[12px] text-ink-3">or drop them here. Clinical photos, wounds, skin, reports, ECG strips, consent forms.</span>
          <input
            ref={chooser}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              add([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
          <input
            ref={phoneCamera}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              add([...(e.target.files ?? [])]);
              e.target.value = "";
            }}
          />
        </div>

        {camera && <CameraWindow onCapture={(f) => add([f])} onClose={() => setCamera(false)} />}

        {picked.length > 0 && (
          <ul className="space-y-2">
            {picked.map((p, i) => (
              <li key={p.key} className="flex flex-col gap-3 rounded border border-line p-2 sm:flex-row">
                <div className="flex h-36 w-full shrink-0 items-center justify-center overflow-hidden rounded bg-panel-muted sm:w-44">
                  {p.preview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.preview} alt={`New item ${i + 1}`} className="h-full w-full object-contain" />
                  ) : (
                    <span className="rounded bg-crit-soft px-2 py-1 text-[11px] font-bold text-crit">PDF</span>
                  )}
                </div>
                <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field label="Name" className="sm:col-span-2">
                    <input className={`${inputCls} font-medium`} value={p.title} maxLength={120} onChange={(e) => set(p.key, { title: e.target.value, named: true })} />
                  </Field>
                  <Field label="What is it">
                    <select className={inputCls} value={p.category} onChange={(e) => set(p.key, { category: e.target.value as MediaCategory })}>
                      {MEDIA_CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {takesBodySite(p.category) ? (
                    <Field label="Body site">
                      <input className={inputCls} list="media-body-sites" value={p.bodySite} maxLength={80} onChange={(e) => set(p.key, { bodySite: e.target.value })} placeholder="e.g. Right hand" />
                    </Field>
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                  <Field label="Date taken">
                    <input type="date" className={inputCls} value={p.takenOn} max={today()} onChange={(e) => set(p.key, { takenOn: e.target.value })} />
                  </Field>
                  <Field label="Description (optional)">
                    <input className={inputCls} value={p.description} maxLength={2000} onChange={(e) => set(p.key, { description: e.target.value })} placeholder="What it shows" />
                  </Field>
                </div>
                <button
                  type="button"
                  className="self-start px-1 text-ink-3 hover:text-crit"
                  title="Remove"
                  onClick={() => {
                    if (p.preview) URL.revokeObjectURL(p.preview);
                    setPicked((x) => x.filter((y) => y.key !== p.key));
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        <datalist id="media-body-sites">
          {BODY_SITES.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>

        {error && <p className="rounded bg-crit-soft px-3 py-2 text-crit">{error}</p>}

        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={!picked.length || pending} className="px-4 py-1.5 disabled:opacity-50">
            {pending ? (stage ?? "Saving…") : picked.length > 1 ? `File ${picked.length} items to Media` : "File to Media"}
          </Button>
          <span className="text-[12px] text-ink-3">Kept as is in the chart. To read a report into Results or Documents, use Import.</span>
        </div>
      </div>
    </section>
  );
}

// The computer's webcam: a live picture and a shutter. Several photos can be taken in a row.
function CameraWindow({ onCapture, onClose }: { onCapture: (f: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [count, setCount] = useState(0);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => setError("The camera couldn't be opened. Allow camera access in the browser, or use Choose photos."));
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [facing]);

  function shoot() {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    canvas.toBlob(
      (b) => {
        if (!b) return;
        const n = count + 1;
        setCount(n);
        onCapture(new File([b], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-label="Camera">
      <div className="w-full max-w-3xl overflow-hidden rounded-md bg-panel">
        <div className="relative flex aspect-video items-center justify-center bg-black">
          {error ? <p className="px-6 text-center text-white">{error}</p> : <video ref={video} autoPlay playsInline muted className="h-full w-full object-contain" />}
        </div>
        <div className="flex items-center gap-2 px-3 py-2">
          <Button type="button" onClick={shoot} disabled={!!error} className="flex items-center gap-1.5 px-4 py-1.5 disabled:opacity-50">
            <CameraIcon /> Capture
          </Button>
          <Button type="button" variant="secondary" onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))}>
            Switch camera
          </Button>
          <span className="flex-1 text-[12px] text-ink-3">{count ? `${count} taken. Name them below when you're done.` : "Hold steady and fill the frame with the finding."}</span>
          <Button type="button" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

// Applies EXIF rotation, shrinks photos and makes a grid thumbnail; PDFs pass through.
async function prepare(file: File): Promise<{ file: File; thumb: Blob | null; width: number | null; height: number | null }> {
  if (file.type === "application/pdf") return { file, thumb: null, width: null, height: null };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`Couldn't open ${file.name}. Try a JPEG or PNG.`);
  }
  const draw = async (edge: number, qualities: number[]) => {
    const scale = Math.min(1, edge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    let blob: Blob | null = null;
    for (const q of qualities) {
      blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", q));
      if (blob && blob.size < 4.5 * 1024 * 1024) break;
    }
    return { blob, width: canvas.width, height: canvas.height };
  };
  const full = await draw(MAX_EDGE, [0.9, 0.8, 0.65]);
  const thumb = await draw(THUMB_EDGE, [0.75]);
  bitmap.close();
  if (!full.blob) throw new Error(`Couldn't process ${file.name}.`);
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return { file: new File([full.blob], name, { type: "image/jpeg" }), thumb: thumb.blob, width: full.width, height: full.height };
}

function CameraIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
