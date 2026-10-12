import Link from "next/link";
import type { NoteStatus, NoteType, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { can } from "@/lib/roles";
import { fmtDate } from "@/lib/format";
import { editorContext } from "@/lib/notes/server";
import { blankTemplate, noteTypes, noteTypeShort, templateById, templates } from "@/lib/notes/library";
import { expand } from "@/lib/notes/smarttext";
import { Empty } from "@/components/panel";
import { inputCls } from "@/components/form";
import { NoteEditor } from "@/components/notes/note-editor";
import { NoteDocument, NoteStatusChip } from "@/components/notes/note-view";
import { addAddendum, cosignNote, deleteDraft, saveNote } from "./actions";

export const dynamic = "force-dynamic";

type SP = {
  note?: string;
  new?: string;
  template?: string;
  copy?: string;
  addend?: string;
  cosign?: string;
  error?: string;
  type?: string;
  status?: string;
  author?: string;
  q?: string;
};

const STATUS_FILTERS: { id: string; label: string; where: Prisma.NoteWhereInput }[] = [
  { id: "all", label: "All statuses", where: {} },
  { id: "unsigned", label: "Pended", where: { status: "draft" } },
  { id: "cosign", label: "Needs cosign", where: { status: "pending_cosign" } },
  { id: "signed", label: "Signed", where: { status: { in: ["signed", "addended"] as NoteStatus[] } } },
];

export default async function Notes({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params;
  const sp = await searchParams;
  const base = `/patients/${id}/notes`;
  const currentUser = await requirePermission("viewClinical");
  const canWrite = can(currentUser.role, "writeNotes");

  // Filters live in the URL so a filtered list survives opening a note.
  const filters = new URLSearchParams();
  for (const k of ["type", "status", "author", "q"] as const) if (sp[k]) filters.set(k, sp[k]!);
  const withFilters = (extra: Record<string, string>) => {
    const u = new URLSearchParams(filters);
    for (const [k, v] of Object.entries(extra)) u.set(k, v);
    return `${base}?${u}`;
  };

  const type = noteTypes.some((t) => t.id === sp.type) ? (sp.type as NoteType) : undefined;
  const status = STATUS_FILTERS.find((s) => s.id === sp.status) ?? STATUS_FILTERS[0];
  const q = sp.q?.trim();
  const notes = await db.note.findMany({
    where: {
      patientId: id,
      type,
      ...status.where,
      ...(sp.author === "me" ? { authorId: currentUser.id } : {}),
      ...(q ? { OR: [{ body: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ serviceAt: "desc" }, { createdAt: "desc" }],
    include: { author: true, _count: { select: { addenda: true } } },
  });

  const creating = sp.new === "1" && canWrite;
  const selectedId = creating ? null : (sp.note ?? notes[0]?.id);
  const selected = selectedId
    ? await db.note.findFirst({
        where: { id: selectedId, patientId: id },
        include: { author: true, cosigner: true, encounter: true, addenda: { include: { author: true }, orderBy: { signedAt: "asc" } } },
      })
    : null;
  const editingDraft = !!selected && selected.status === "draft" && selected.authorId === currentUser.id;
  const addending = !!selected && canWrite && sp.addend === "1" && selected.status !== "draft";
  const canCosign = !!selected && can(currentUser.role, "cosignNotes") && selected.status === "pending_cosign" && selected.cosignerId === currentUser.id;
  const cosigning = canCosign && sp.cosign === "1";
  const template = creating ? (sp.copy ? undefined : templateById(sp.template)) : undefined;
  const copyFrom = creating && sp.copy ? await db.note.findFirst({ where: { id: sp.copy, patientId: id } }) : null;
  const needsEditor = editingDraft || addending || cosigning || !!template || !!copyFrom;
  const ctx = needsEditor ? await editorContext(id, currentUser) : null;
  const todayEncounter = ctx?.encounters.find((e) => new Date(e.start).toDateString() === new Date().toDateString());

  let pane: React.ReactNode;
  if (creating && ctx && (template || copyFrom)) {
    const phrases = Object.fromEntries(ctx.phrases.map((p) => [p.name, p]));
    pane = (
      <NoteEditor
        key={`new-${sp.template ?? sp.copy}`}
        action={saveNote.bind(null, id, null)}
        ctx={ctx}
        cancelHref={base}
        initial={
          copyFrom
            ? { title: copyFrom.title, type: copyFrom.type, body: copyFrom.body, templateId: copyFrom.templateId, encounterId: todayEncounter?.id }
            : { title: template!.title, type: template!.type, body: expand(template!.body, { phrases, links: ctx.links }), templateId: template!.id, encounterId: todayEncounter?.id }
        }
      />
    );
  } else if (creating) {
    pane = <NewNotePicker base={base} copyable={notes.find((n) => n.status !== "draft")} />;
  } else if (editingDraft && ctx && selected) {
    pane = (
      <NoteEditor
        key={selected.id}
        action={saveNote.bind(null, id, selected.id)}
        onDelete={deleteDraft.bind(null, id, selected.id)}
        ctx={ctx}
        error={sp.error}
        initial={{ title: selected.title, type: selected.type, body: selected.body, templateId: selected.templateId, encounterId: selected.encounterId, cosignerId: selected.cosignerId }}
      />
    );
  } else if (selected) {
    pane = (
      <div className="flex h-full flex-col">
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-line bg-panel-muted px-4 py-1.5">
          {canCosign && !cosigning && <ToolbarLink href={withFilters({ note: selected.id, cosign: "1" })} primary>Cosign</ToolbarLink>}
          {canWrite && selected.status !== "draft" && !addending && <ToolbarLink href={withFilters({ note: selected.id, addend: "1" })}>Addend</ToolbarLink>}
          {canWrite && <ToolbarLink href={`${base}?new=1&copy=${selected.id}`}>Copy to new note</ToolbarLink>}
          <ToolbarLink href={`/print/note?id=${selected.id}`}>Print</ToolbarLink>
          {selected.status === "draft" && <span className="ml-auto text-[12px] text-ink-3">Pended by {selected.author.name}; only the author can edit it.</span>}
        </div>
        <div className={`min-h-0 overflow-y-auto ${addending || cosigning ? "basis-1/2 border-b border-line" : "flex-1"}`}>
          <div className="mx-auto max-w-3xl px-6 py-5">
            <NoteDocument note={selected} />
          </div>
        </div>
        {(addending || cosigning) && ctx && (
          <div className="flex min-h-0 basis-1/2 flex-col">
            <div className="border-b border-line bg-panel px-4 py-1.5 text-[12.5px] font-semibold">{addending ? "Addendum" : "Cosign with attestation"}</div>
            <div className="min-h-0 flex-1">
              <NoteEditor
                key={`${addending ? "add" : "co"}-${selected.id}`}
                mode={addending ? "addendum" : "cosign"}
                action={addending ? addAddendum.bind(null, id, selected.id) : cosignNote.bind(null, id, selected.id, null)}
                ctx={ctx}
                error={sp.error}
                cancelHref={withFilters({ note: selected.id })}
                initial={{
                  title: "",
                  type: selected.type,
                  body: addending ? "" : expand(".attest", { phrases: Object.fromEntries(ctx.phrases.map((p) => [p.name, p])), links: ctx.links }),
                }}
              />
            </div>
          </div>
        )}
      </div>
    );
  } else {
    pane = <Empty>No note selected. Start a new note from the list.</Empty>;
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-panel">
        <div className="space-y-2 border-b border-line p-2">
          <div className="flex items-center gap-2">
            {canWrite && (
              <Link href={`${base}?new=1`} className="whitespace-nowrap rounded bg-accent px-2.5 py-1 text-[12.5px] font-medium text-white hover:bg-accent/90">
                New note
              </Link>
            )}
            <form action={base} className="flex min-w-0 flex-1 gap-1">
              {type && <input type="hidden" name="type" value={type} />}
              {sp.status && <input type="hidden" name="status" value={sp.status} />}
              {sp.author && <input type="hidden" name="author" value={sp.author} />}
              <input name="q" defaultValue={q} placeholder="Search note text" className={`${inputCls} min-w-0 flex-1 py-0.5`} />
            </form>
          </div>
          <div className="flex flex-wrap gap-0.5 text-[11.5px]">
            <FilterLink href={hrefWith(base, filters, { type: null })} active={!type} label="All" />
            {noteTypes.map((t) => (
              <FilterLink key={t.id} href={hrefWith(base, filters, { type: t.id })} active={type === t.id} label={t.short} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-0.5 text-[11.5px]">
            {STATUS_FILTERS.map((s) => (
              <FilterLink key={s.id} href={hrefWith(base, filters, { status: s.id === "all" ? null : s.id })} active={status.id === s.id} label={s.label} />
            ))}
            <span className="mx-1 h-3 w-px bg-line" />
            <FilterLink href={hrefWith(base, filters, { author: sp.author === "me" ? null : "me" })} active={sp.author === "me"} label="Mine" />
          </div>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {notes.length === 0 && <Empty>No notes match.</Empty>}
          {notes.map((n) => (
            <li key={n.id} className="border-b border-line">
              <Link
                href={withFilters({ note: n.id })}
                className={`block border-l-[3px] px-3 py-2 ${n.id === selected?.id && !creating ? "border-accent bg-accent-soft" : "border-transparent hover:bg-panel-muted"}`}
              >
                <div className="flex justify-between gap-2">
                  <span className="truncate font-medium">{n.title}</span>
                  <span className="shrink-0 text-ink-3">{fmtDate(n.serviceAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-ink-2">
                  <span className="truncate">
                    {noteTypeShort[n.type]} · {n.author.name}
                    {n.author.credentials ? `, ${n.author.credentials}` : ""}
                  </span>
                  <NoteStatusChip status={n.status} addenda={n._count.addenda} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-w-0 flex-1 bg-panel">{pane}</section>
    </div>
  );
}

// Choosing what to write: a note type and its template, or a copy of the last note.
function NewNotePicker({ base, copyable }: { base: string; copyable?: { id: string; title: string; serviceAt: Date } }) {
  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <h1 className="text-[16px] font-semibold">New note</h1>
      <p className="mb-4 text-ink-2">Pick a template. Chart data is pulled in when it opens; fill the highlighted blanks, then sign.</p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {noteTypes.map((t) => (
          <section key={t.id} className="rounded-md border border-line">
            <h2 className="border-b border-line bg-panel-muted px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-ink-2">{t.label}</h2>
            <ul>
              {[...templates.filter((x) => x.type === t.id), blankTemplate(t.id)].map((x) => (
                <li key={x.id} className="border-t border-line first:border-t-0">
                  <Link href={`${base}?new=1&template=${x.id}`} className="flex items-baseline justify-between gap-3 px-3 py-2 hover:bg-accent-soft/50">
                    <span className="font-medium text-accent">{x.name}</span>
                    <span className="truncate text-[12px] text-ink-3">{x.description}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {copyable && (
        <p className="mt-5 text-ink-2">
          Or{" "}
          <Link href={`${base}?new=1&copy=${copyable.id}`} className="font-medium text-accent hover:underline">
            copy the last note ({copyable.title}, {fmtDate(copyable.serviceAt)})
          </Link>{" "}
          and update it.
        </p>
      )}
    </div>
  );
}

function hrefWith(base: string, current: URLSearchParams, change: Record<string, string | null>) {
  const u = new URLSearchParams(current);
  for (const [k, v] of Object.entries(change)) {
    if (v === null) u.delete(k);
    else u.set(k, v);
  }
  const s = u.toString();
  return s ? `${base}?${s}` : base;
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`rounded px-1.5 py-0.5 ${active ? "bg-chrome text-white" : "text-ink-2 hover:bg-panel-muted"}`}>
      {label}
    </Link>
  );
}

function ToolbarLink({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded border px-2.5 py-0.5 text-[12.5px] font-medium ${primary ? "border-accent bg-accent text-white hover:bg-accent/90" : "border-line bg-panel text-ink hover:bg-panel-muted"}`}
    >
      {children}
    </Link>
  );
}
