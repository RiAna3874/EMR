import type { Note, NoteAddendum, NoteStatus, Practitioner } from "@prisma/client";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { noteTypeLabel } from "@/lib/notes/library";

const signer = (p: Pick<Practitioner, "name" | "credentials">) => `${p.name}${p.credentials ? `, ${p.credentials}` : ""}`;

// All-caps lines ("ASSESSMENT AND PLAN") are section headings.
const isHeading = (l: string) => /^[A-Z][A-Z0-9 &/,()'-]{2,}$/.test(l.trim()) && /[A-Z]{3}/.test(l);

export function NoteBody({ text, className = "" }: { text: string; className?: string }) {
  const blocks = text.split("\n");
  return (
    <div className={`text-[13.5px] leading-relaxed ${className}`}>
      {blocks.map((l, i) =>
        isHeading(l) ? (
          <h3 key={i} className="mt-4 mb-0.5 text-[11.5px] font-semibold uppercase tracking-wider text-ink-2 first:mt-0">
            {l.trim()}
          </h3>
        ) : l.trim() === "" ? (
          <div key={i} className="h-2" />
        ) : (
          <p key={i} className={`whitespace-pre-wrap ${/^\s*(#|\d+\.)\s/.test(l) ? "mt-1 font-medium" : ""}`}>
            {l}
          </p>
        ),
      )}
    </div>
  );
}

export function NoteStatusChip({ status, addenda = 0 }: { status: NoteStatus; addenda?: number }) {
  const map: Record<NoteStatus, [string, string]> = {
    draft: ["Pended", "bg-warn-soft text-warn"],
    pending_cosign: ["Needs cosign", "bg-low-soft text-low"],
    signed: ["Signed", "text-ink-3"],
    addended: ["Addended", "text-ink-3"],
  };
  const [label, cls] = map[status];
  return (
    <span className={`whitespace-nowrap rounded px-1 text-[10.5px] font-semibold uppercase tracking-wide ${cls}`}>
      {label}
      {status === "addended" && addenda > 0 && ` +${addenda}`}
    </span>
  );
}

type FullNote = Note & {
  author: Practitioner;
  cosigner: Practitioner | null;
  encounter: { start: Date; reason: string | null; type: string } | null;
  addenda: (NoteAddendum & { author: Practitioner })[];
};

// A note as it reads in the chart: header, body, signatures, then addenda in order.
export function NoteDocument({ note }: { note: FullNote }) {
  return (
    <article>
      <header className="mb-4 border-b border-line pb-3">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-[17px] font-semibold">{note.title}</h1>
          <NoteStatusChip status={note.status} addenda={note.addenda.length} />
        </div>
        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-[12.5px] text-ink-2">
          <dt className="text-ink-3">Type</dt>
          <dd>{noteTypeLabel[note.type]}</dd>
          <dt className="text-ink-3">Author</dt>
          <dd>{signer(note.author)}</dd>
          <dt className="text-ink-3">Date of service</dt>
          <dd>
            {fmtDate(note.serviceAt)}
            {note.encounter && ` · ${note.encounter.type === "office" ? "Office visit" : note.encounter.type === "telehealth" ? "Telehealth" : "Phone"}${note.encounter.reason ? `, ${note.encounter.reason}` : ""}`}
          </dd>
          {note.cosigner && (
            <>
              <dt className="text-ink-3">Cosigner</dt>
              <dd>{signer(note.cosigner)}</dd>
            </>
          )}
        </dl>
      </header>

      <NoteBody text={note.body} />

      <footer className="mt-6 space-y-1 border-t border-line pt-3 text-[12px]">
        {note.status === "draft" ? (
          <p className="text-warn">Pended, not signed. Last saved {fmtDateTime(note.updatedAt)}.</p>
        ) : (
          note.signedAt && (
            <p className="text-ok">
              Electronically signed by {signer(note.author)} on {fmtDateTime(note.signedAt)}
            </p>
          )
        )}
        {note.status === "pending_cosign" && note.cosigner && <p className="text-low">Awaiting cosignature by {signer(note.cosigner)}.</p>}
        {note.cosignedAt && note.cosigner && (
          <div>
            <p className="text-ok">
              Cosigned by {signer(note.cosigner)} on {fmtDateTime(note.cosignedAt)}
            </p>
            {note.cosignText && <p className="mt-1 rounded bg-panel-muted px-2.5 py-1.5 text-[12.5px] text-ink">{note.cosignText}</p>}
          </div>
        )}
      </footer>

      {note.addenda.map((a) => (
        <section key={a.id} className="mt-4 rounded-md border border-line">
          <h3 className="border-b border-line bg-panel-muted px-3 py-1.5 text-[12px] font-semibold text-ink-2">
            Addendum · {signer(a.author)} · {fmtDateTime(a.signedAt)}
          </h3>
          <NoteBody text={a.body} className="px-3 py-2" />
          <p className="px-3 pb-2 text-[12px] text-ok">
            Electronically signed by {signer(a.author)} on {fmtDateTime(a.signedAt)}
          </p>
        </section>
      ))}
    </article>
  );
}
