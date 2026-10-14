"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMedia } from "@/app/patients/[id]/media/actions";
import { Button, Field, inputCls } from "@/components/form";
import { MEDIA_CATEGORIES, takesBodySite, type MediaDetails } from "@/lib/media/categories";

// Renaming an item or correcting what it is, where, when and what it shows.
export function EditMediaDetails({ patientId, mediaId, initial }: { patientId: string; mediaId: string; initial: MediaDetails }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setD(initial);
          setOpen(true);
        }}
      >
        Rename or edit details
      </Button>
    );
  }

  const set = (patch: Partial<MediaDetails>) => setD((x) => ({ ...x, ...patch }));
  return (
    <form
      className="grid w-full grid-cols-1 gap-2 rounded border border-accent/40 bg-accent-soft/30 p-2 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateMedia(patientId, mediaId, { ...d, bodySite: takesBodySite(d.category as never) ? d.bodySite : "" });
          if (res?.error) return setError(res.error);
          setError(null);
          setOpen(false);
          router.refresh();
        });
      }}
    >
      <Field label="Name" className="sm:col-span-2">
        <input autoFocus className={`${inputCls} font-medium`} value={d.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} />
      </Field>
      <Field label="What is it">
        <select className={inputCls} value={d.category} onChange={(e) => set({ category: e.target.value })}>
          {MEDIA_CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      {takesBodySite(d.category as never) && (
        <Field label="Body site">
          <input className={inputCls} list="media-body-sites" value={d.bodySite} maxLength={80} onChange={(e) => set({ bodySite: e.target.value })} />
        </Field>
      )}
      <Field label="Date taken">
        <input type="date" className={inputCls} value={d.takenOn} onChange={(e) => set({ takenOn: e.target.value })} />
      </Field>
      <Field label="Description" className="sm:col-span-2">
        <textarea className={`${inputCls} min-h-16`} value={d.description} maxLength={2000} onChange={(e) => set({ description: e.target.value })} />
      </Field>
      {error && <p className="rounded bg-crit-soft px-2 py-1 text-crit sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
