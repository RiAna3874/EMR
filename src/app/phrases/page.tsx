import Link from "next/link";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { chartLinks, systemPhrases } from "@/lib/notes/library";
import { Button, Field, inputCls } from "@/components/form";
import { Empty } from "@/components/panel";
import { deletePhrase, savePhrase } from "./actions";

export const dynamic = "force-dynamic";

// The clinician's own dot phrases, plus the shared library to copy from.
export default async function Phrases({ searchParams }: { searchParams: Promise<{ edit?: string; new?: string; copy?: string; error?: string; saved?: string }> }) {
  const sp = await searchParams;
  const mine = await db.smartPhrase.findMany({ where: { ownerId: currentUser.id }, orderBy: { name: "asc" } });
  const editing = sp.edit ? mine.find((p) => p.id === sp.edit) : undefined;
  const copying = sp.copy ? systemPhrases.find((p) => p.name === sp.copy) : undefined;
  const showForm = !!editing || !!copying || sp.new === "1";
  const initial = editing ?? (copying ? { name: `my${copying.name}`, description: copying.description, body: copying.body } : { name: "", description: "", body: "" });

  return (
    <div className="flex h-full">
      <aside className="flex w-80 shrink-0 flex-col border-r border-line bg-panel">
        <div className="flex items-center justify-between border-b border-line p-2">
          <h1 className="px-1 text-[15px] font-semibold">My phrases</h1>
          <Link href="/phrases?new=1" className="rounded bg-accent px-2.5 py-1 text-[12.5px] font-medium text-white hover:bg-accent/90">
            New phrase
          </Link>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {mine.length === 0 && <Empty>No phrases of your own yet.</Empty>}
          {mine.map((p) => (
            <li key={p.id} className="border-b border-line">
              <Link href={`/phrases?edit=${p.id}`} className={`block border-l-[3px] px-3 py-2 ${p.id === editing?.id ? "border-accent bg-accent-soft" : "border-transparent hover:bg-panel-muted"}`}>
                <span className="font-mono font-semibold text-accent">.{p.name}</span>
                <span className="block truncate text-[12px] text-ink-2">{p.description || p.body.split("\n")[0]}</span>
              </Link>
            </li>
          ))}
          <li className="bg-panel-muted px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-3">Shared library</li>
          {systemPhrases.map((p) => (
            <li key={p.name} className="flex items-center justify-between gap-2 border-b border-line bg-panel-muted px-3 py-1.5">
              <span className="min-w-0">
                <span className="font-mono text-[12px] font-semibold text-ink-2">.{p.name}</span>
                <span className="block truncate text-[11.5px] text-ink-3">{p.description}</span>
              </span>
              <Link href={`/phrases?copy=${p.name}`} className="shrink-0 text-[11.5px] font-medium text-accent hover:underline">
                Copy
              </Link>
            </li>
          ))}
        </ul>
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto bg-panel">
        {showForm ? (
          <form key={editing?.id ?? sp.copy ?? "new"} action={savePhrase.bind(null, editing?.id ?? null)} className="mx-auto max-w-3xl space-y-3 px-6 py-5">
            <h2 className="text-[16px] font-semibold">{editing ? `Edit .${editing.name}` : "New phrase"}</h2>
            {sp.error && <p className="rounded bg-warn-soft px-3 py-1.5 text-warn">{sp.error}</p>}
            {sp.saved && <p className="rounded bg-accent-soft px-3 py-1.5 text-accent">Saved. Type .{editing?.name} in any note to use it.</p>}
            <div className="flex gap-3">
              <Field label="Name (what you type after the dot)" className="w-60">
                <input name="name" defaultValue={initial.name} required className={`${inputCls} font-mono`} />
              </Field>
              <Field label="Description" className="flex-1">
                <input name="description" defaultValue={initial.description} className={inputCls} />
              </Field>
            </div>
            <Field label="Text">
              <textarea name="body" defaultValue={initial.body} rows={14} className={`${inputCls} font-mono text-[13px] leading-relaxed`} />
            </Field>
            <div className="flex items-center gap-2">
              <Button type="submit">Save phrase</Button>
              {editing && (
                <Button type="submit" formAction={deletePhrase.bind(null, editing.id)} formNoValidate variant="danger">
                  Delete
                </Button>
              )}
            </div>
            <SyntaxHelp />
          </form>
        ) : (
          <div className="mx-auto max-w-3xl px-6 py-5">
            <h2 className="text-[16px] font-semibold">Phrases</h2>
            <p className="mt-1 text-ink-2">
              A phrase is text you reuse. Type a dot and its name in any note (for example <code className="font-mono">.dmplan</code>) and it expands in place. Yours
              take priority over the shared library when names match.
            </p>
            <SyntaxHelp />
          </div>
        )}
      </section>
    </div>
  );
}

function SyntaxHelp() {
  return (
    <div className="mt-4 rounded-md border border-line bg-panel-muted p-4 text-[12.5px]">
      <h3 className="mb-2 font-semibold">What a phrase can contain</h3>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
        <dt className="font-mono text-warn">***</dt>
        <dd>A blank to fill in. Notes can&apos;t be signed until every blank is replaced; F2 jumps between them.</dd>
        <dt className="font-mono text-accent">{"{Label:one|two|three}"}</dt>
        <dd>A pick list. Choose one option with a number key or click.</dd>
        <dt className="font-mono text-accent">{"{Label::one|two|three}"}</dt>
        <dd>A pick list where several options can be chosen.</dd>
        <dt className="font-mono">@NAME@</dt>
        <dd>Live chart data: {chartLinks.map((l) => `@${l.name}@`).join(", ")}.</dd>
        <dt className="font-mono">.other</dt>
        <dd>Another phrase, expanded inside this one.</dd>
      </dl>
    </div>
  );
}
