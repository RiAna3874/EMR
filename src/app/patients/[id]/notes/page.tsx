import Link from "next/link";
import type { NoteType } from "@prisma/client";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { smartTextFor } from "@/lib/smart-text";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Empty } from "@/components/panel";
import { NoteEditor } from "@/components/chart/note-editor";
import { deleteDraft, saveNote } from "../actions";

const typeLabels: Record<string, string> = {
  progress: "Progress",
  history_physical: "H&P",
  consult: "Consult",
  phone: "Phone",
};

export default async function Notes({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ note?: string; new?: string; type?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const base = `/patients/${id}/notes`;
  const notes = await db.note.findMany({
    where: { patientId: id, type: sp.type && sp.type in typeLabels ? (sp.type as NoteType) : undefined },
    orderBy: { createdAt: "desc" },
    include: { author: true },
  });
  const selected = sp.new ? null : (notes.find((n) => n.id === sp.note) ?? notes[0]);
  const editing = sp.new === "1" || (selected?.status === "draft" && selected.authorId === currentUser.id);
  const smartText = editing ? await smartTextFor(id) : {};

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center gap-2 border-b border-line p-2">
          <Link href={`${base}?new=1`} className="whitespace-nowrap rounded bg-accent px-2.5 py-1 text-[12.5px] font-medium text-white hover:bg-accent/90">
            New note
          </Link>
          <div className="ml-auto flex gap-0.5 text-[11.5px]">
            <FilterLink href={base} active={!sp.type} label="All" />
            {Object.entries(typeLabels).map(([k, label]) => (
              <FilterLink key={k} href={`${base}?type=${k}`} active={sp.type === k} label={label} />
            ))}
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {notes.length === 0 && <Empty>No notes.</Empty>}
          {notes.map((n) => (
            <li key={n.id} className="border-b border-line">
              <Link
                href={`${base}?note=${n.id}${sp.type ? `&type=${sp.type}` : ""}`}
                className={`block border-l-[3px] px-3 py-2 ${
                  n.id === selected?.id ? "border-accent bg-accent-soft" : "border-transparent hover:bg-panel-muted"
                }`}
              >
                <div className="flex justify-between gap-2">
                  <span className="truncate font-medium">{n.title}</span>
                  <span className="shrink-0 text-ink-3">{fmtDate(n.createdAt)}</span>
                </div>
                <div className="flex justify-between text-ink-2">
                  <span>
                    {typeLabels[n.type]} · {n.author.name}
                  </span>
                  {n.status === "draft" ? (
                    <span className="rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-warn">DRAFT</span>
                  ) : (
                    <span className="text-[11px] text-ink-3">Signed</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-w-0 flex-1 bg-panel">
        {editing ? (
          <NoteEditor
            key={selected?.id ?? "new"}
            action={saveNote.bind(null, id, sp.new ? null : (selected?.id ?? null))}
            onDelete={!sp.new && selected ? deleteDraft.bind(null, id, selected.id) : undefined}
            smartText={smartText}
            initial={!sp.new && selected ? { title: selected.title, type: selected.type, body: selected.body } : undefined}
          />
        ) : selected ? (
          <article className="mx-auto max-w-3xl p-6">
            <header className="mb-4 border-b border-line pb-3">
              <h1 className="text-lg font-semibold">{selected.title}</h1>
              <p className="text-ink-2">
                {typeLabels[selected.type]} note · {selected.author.name}, {selected.author.credentials ?? ""} · {fmtDateTime(selected.createdAt)}
              </p>
              {selected.signedAt && <p className="text-[12px] text-ok">Electronically signed {fmtDateTime(selected.signedAt)}</p>}
            </header>
            <div className="whitespace-pre-wrap font-mono text-[13px] leading-relaxed">{selected.body}</div>
          </article>
        ) : (
          <Empty>Select a note or start a new one.</Empty>
        )}
      </section>
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`rounded px-1.5 py-0.5 ${active ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}>
      {label}
    </Link>
  );
}
