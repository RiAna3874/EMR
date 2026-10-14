import Link from "next/link";
import type { Note, NoteAddendum, NoteStatus, NoteVersion, Practitioner } from "@prisma/client";
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
  editedBy: Practitioner | null;
  addenda: (NoteAddendum & { author: Practitioner })[];
  versions: (NoteVersion & { signedBy: Practitioner })[];
};

// A note as it reads in the chart: header, body, signatures, then addenda in order.
// historyHref links to the earlier versions when the note has been edited.
export function NoteDocument({ note, historyHref }: { note: FullNote; historyHref?: string }) {
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
        {note.editedAt && note.editedBy && (
          <p className="text-ok">
            Edited and re-signed by {signer(note.editedBy)} on {fmtDateTime(note.editedAt)}
            {historyHref && note.versions.length > 0 && (
              <>
                {" · "}
                <Link href={historyHref} className="font-medium text-accent hover:underline">
                  {note.versions.length === 1 ? "See the earlier version" : `See ${note.versions.length} earlier versions`}
                </Link>
              </>
            )}
          </p>
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

// Every version of an edited note, newest first: the current text, then each one it replaced.
export function NoteHistory({ note, backHref }: { note: FullNote; backHref: string }) {
  const current = currentVersion(note);
  const rows = [current, ...note.versions.map((v) => ({ ...v, current: false }))].sort((a, b) => b.number - a.number);
  return (
    <article>
      <header className="mb-4 flex items-baseline justify-between gap-3 border-b border-line pb-3">
        <div>
          <h1 className="text-[17px] font-semibold">Version history</h1>
          <p className="text-[12.5px] text-ink-2">
            {note.title} · {rows.length} versions. Earlier versions are kept as they were signed and cannot be changed.
          </p>
        </div>
        <Link href={backHref} className="shrink-0 text-[12.5px] font-medium text-accent hover:underline">
          Back to the note
        </Link>
      </header>
      {rows.map((v) => (
        <section key={v.number} className={`mb-4 rounded-md border ${v.current ? "border-accent" : "border-line"}`}>
          <h2 className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line bg-panel-muted px-3 py-1.5 text-[12px] font-semibold text-ink-2">
            <span>
              Version {v.number}
              {v.current ? " (current)" : ""} · {v.title}
              {v.type !== note.type && ` · ${noteTypeLabel[v.type]}`}
            </span>
            <span className="font-normal">
              {v.number === 1 ? "Signed" : "Edited and re-signed"} by {signer(v.signedBy)} on {fmtDateTime(v.signedAt)}
              {v.replacedAt && <> · replaced {fmtDateTime(v.replacedAt)}</>}
            </span>
          </h2>
          <NoteBody text={v.body} className="px-3 py-2" />
        </section>
      ))}
    </article>
  );
}

function currentVersion(note: FullNote) {
  return {
    number: note.versions.length + 1,
    title: note.title,
    type: note.type as NoteVersion["type"],
    body: note.body,
    signedBy: note.editedBy ?? note.author,
    signedAt: note.editedAt ?? note.signedAt ?? note.createdAt,
    replacedAt: null as Date | null,
    current: true,
  };
}
