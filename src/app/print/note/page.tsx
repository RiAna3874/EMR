import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { age, fmtDate, fmtDateTime, fmtDob, sexShort } from "@/lib/format";
import { noteTypeLabel } from "@/lib/notes/library";
import { NoteBody } from "@/components/notes/note-view";
import { Letterhead, PrintFooter, PrintShell } from "@/components/print/print-shell";

export const dynamic = "force-dynamic";

const signer = (p: { name: string; credentials: string | null }) => `${p.name}${p.credentials ? `, ${p.credentials}` : ""}`;

// A note as a printable document, with its signatures and addenda.
export default async function PrintNote({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  const note = id
    ? await db.note.findUnique({
        where: { id },
        include: { patient: true, author: true, cosigner: true, addenda: { include: { author: true }, orderBy: { signedAt: "asc" } } },
      })
    : null;
  if (!note) notFound();
  const p = note.patient;

  return (
    <PrintShell back={`/patients/${p.id}/notes?note=${note.id}`}>
      <Letterhead title={noteTypeLabel[note.type]} right={<>Printed {fmtDateTime(new Date())}</>} />
      <section className="mt-3 grid grid-cols-2 gap-x-6 border-b border-black pb-2">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="font-semibold">Patient</dt>
          <dd className="font-bold">
            {p.lastName.toUpperCase()}, {p.firstName}
          </dd>
          <dt className="font-semibold">DOB</dt>
          <dd>
            {fmtDob(p.dob)} ({age(p.dob)} y) · Sex {sexShort(p.sex)}
          </dd>
          <dt className="font-semibold">MRN</dt>
          <dd className="font-mono">{p.mrn}</dd>
        </dl>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          <dt className="font-semibold">Note</dt>
          <dd>{note.title}</dd>
          <dt className="font-semibold">Date of service</dt>
          <dd>{fmtDate(note.serviceAt)}</dd>
          <dt className="font-semibold">Author</dt>
          <dd>{signer(note.author)}</dd>
        </dl>
      </section>

      {note.status === "draft" && <p className="mt-3 border border-black px-2 py-1 font-bold uppercase">Pended draft, not signed</p>}

      <NoteBody text={note.body} className="mt-4 text-[12px] leading-snug [&_h3]:text-black" />

      <div className="mt-5 space-y-0.5 border-t border-black/50 pt-2 text-[11px]">
        {note.signedAt && <p>Electronically signed by {signer(note.author)} on {fmtDateTime(note.signedAt)}</p>}
        {note.status === "pending_cosign" && note.cosigner && <p>Awaiting cosignature by {signer(note.cosigner)}</p>}
        {note.cosignedAt && note.cosigner && (
          <p>
            Cosigned by {signer(note.cosigner)} on {fmtDateTime(note.cosignedAt)}
            {note.cosignText && `: ${note.cosignText}`}
          </p>
        )}
      </div>

      {note.addenda.map((a) => (
        <section key={a.id} className="mt-4 border-t border-black pt-2">
          <h3 className="font-bold">
            Addendum · {signer(a.author)} · {fmtDateTime(a.signedAt)}
          </h3>
          <NoteBody text={a.body} className="mt-1 text-[12px] leading-snug" />
        </section>
      ))}

      <PrintFooter />
    </PrintShell>
  );
}
