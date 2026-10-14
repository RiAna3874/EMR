import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { inboxCounts, inboxFolderAllowed, inboxResults, refillsWhere } from "@/lib/inbox";
import { age, fmtDate, fmtDateTime, fmtRange, fmtValue, fullName, isAbnormal, relativeDays, sexShort, unitLabel } from "@/lib/format";
import { orderableFor } from "@/lib/orders/catalog";
import { orderWarnings } from "@/lib/orders/checks";
import { orderContext } from "@/lib/orders/server";
import { Empty } from "@/components/panel";
import { FlagBadge, flagText } from "@/components/flag";
import { Sparkline } from "@/components/sparkline";
import { Button, inputCls } from "@/components/form";
import { ImportStatusChip } from "@/components/import/status-chip";
import { medSig, OrderTypeIcon, PriorityChip, WarningList } from "@/components/orders/order-bits";
import { NoteBody } from "@/components/notes/note-view";
import { noteTypeShort } from "@/lib/notes/library";
import { unresolvedCount } from "@/lib/notes/smarttext";
import { acknowledgeAllNormal, acknowledgeResult, cosignFromInbox, signDraftNote } from "./actions";
import { acknowledgeDocument } from "@/app/patients/[id]/import/document-actions";
import { documentsWhere, filedDocInclude, toFiledDoc } from "@/lib/documents/server";
import { DocDraftSchema, docTypeLabel } from "@/lib/documents/draft";
import { DocTypeChip, DocView } from "@/components/documents/doc-view";
import { can, displayName, needsCosign, type SessionUser } from "@/lib/roles";
import { maxRefills, medWarnings } from "@/lib/meds/checks";
import { productFor } from "@/lib/meds/formulary";
import { rxClassLabel, rxSummary } from "@/lib/meds/rx";
import { sigText } from "@/lib/meds/sig";
import { refillReview, withoutMed } from "@/lib/meds/server";
import { ResultForm } from "@/components/meds/med-controls";
import { approveRefill, cosignPrescription, denyRefill, pendRefill } from "@/app/patients/[id]/meds/actions";
import { isUnassigned } from "@/lib/review-owner";

export const dynamic = "force-dynamic";

const FOLDERS = [
  { id: "abnormal", label: "Abnormal results" },
  { id: "normal", label: "Normal results" },
  { id: "documents", label: "Outside documents" },
  { id: "imports", label: "Imports to verify" },
  { id: "notes", label: "Notes to sign" },
  { id: "cosign", label: "Notes to cosign" },
  { id: "orders", label: "Orders to sign" },
  { id: "refills", label: "Refill requests" },
  { id: "rxcosign", label: "Prescriptions to cosign" },
] as const;
type FolderId = (typeof FOLDERS)[number]["id"];

type Item = { id: string; href: string; patient: { firstName: string; lastName: string }; title: string; sub: React.ReactNode; at: Date; critical?: boolean };

export default async function Inbox({ searchParams }: { searchParams: Promise<{ folder?: string; item?: string }> }) {
  const sp = await searchParams;
  const currentUser = await requirePermission("useInbox");
  const counts = await inboxCounts(currentUser);
  const folders = FOLDERS.filter((f) => inboxFolderAllowed(currentUser.role, f.id));
  const folder: FolderId = folders.some((f) => f.id === sp.folder)
    ? (sp.folder as FolderId)
    : (folders.find((f) => counts[f.id] > 0)?.id ?? folders[0].id);
  const href = (item?: string) => `/inbox?folder=${folder}${item ? `&item=${item}` : ""}`;

  let items: Item[] = [];
  let detail: React.ReactNode = null;

  if (folder === "abnormal" || folder === "normal") {
    const results = (await inboxResults(currentUser.id)).filter((r) => r.abnormal === (folder === "abnormal"));
    items = results.map((r) => ({
      id: r.id,
      href: href(r.id),
      patient: r.patient,
      title: r.display,
      at: r.issuedAt,
      critical: r.critical,
      sub: withPool(r.unassigned, r.abnormal ? (
        <span className="truncate">
          {r.observations
            .filter((o) => isAbnormal(o.flag))
            .slice(0, 3)
            .map((o, i) => (
              <span key={o.id} className={flagText(o.flag)}>
                {i > 0 && ", "}
                {o.display} {fmtValue(o)}
                {o.flag !== "A" && ` ${o.flag}`}
              </span>
            ))}
        </span>
      ) : (
        `${r.observations.length} components, all within range`
      )),
    }));
    const current = results.find((r) => r.id === sp.item) ?? results[0];
    if (current) {
      const idx = results.indexOf(current);
      const next = results[idx + 1] ?? results[idx - 1];
      detail = <ResultDetail reportId={current.id} next={next ? href(next.id) : href()} />;
    }
  } else if (folder === "notes") {
    const notes = await db.note.findMany({ where: { authorId: currentUser.id, status: "draft" }, orderBy: { createdAt: "asc" }, include: { patient: true } });
    items = notes.map((n) => {
      const left = unresolvedCount(n.body);
      return {
        id: n.id,
        href: href(n.id),
        patient: n.patient,
        title: n.title,
        at: n.createdAt,
        sub: (
          <span>
            {noteTypeShort[n.type]} · pended {relativeDays(n.updatedAt)}
            {left > 0 && <span className="ml-1.5 rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-warn">{left} to finish</span>}
          </span>
        ),
      };
    });
    const current = notes.find((n) => n.id === sp.item) ?? notes[0];
    if (current) {
      const next = notes[notes.indexOf(current) + 1];
      const left = unresolvedCount(current.body);
      detail = (
        <div className="flex h-full flex-col">
          <DetailHeader patient={current.patient} title={current.title} meta={`Pended · last saved ${fmtDateTime(current.updatedAt)}`} />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">{current.body ? <NoteBody text={current.body} /> : "(empty)"}</div>
          <div className="flex items-center gap-2 border-t border-line bg-panel-muted px-4 py-2.5">
            {left === 0 && (
              <form action={signDraftNote.bind(null, current.id, next ? href(next.id) : href())}>
                <Button type="submit">Sign note</Button>
              </form>
            )}
            <Link href={`/patients/${current.patientId}/notes?note=${current.id}`} className={`rounded border px-2.5 py-1 text-[12.5px] font-medium ${left ? "border-accent bg-accent text-white hover:bg-accent/90" : "border-line bg-panel hover:bg-panel-muted"}`}>
              {left ? "Finish in chart" : "Edit in chart"}
            </Link>
            {left > 0 && <span className="text-[12px] text-warn">{left} blank{left === 1 ? "" : "s"} or pick list{left === 1 ? "" : "s"} still to complete before signing.</span>}
          </div>
        </div>
      );
    }
  } else if (folder === "cosign") {
    const notes = await db.note.findMany({
      where: { cosignerId: currentUser.id, status: "pending_cosign" },
      orderBy: { signedAt: "asc" },
      include: { patient: true, author: true },
    });
    items = notes.map((n) => ({
      id: n.id,
      href: href(n.id),
      patient: n.patient,
      title: n.title,
      at: n.signedAt ?? n.createdAt,
      sub: `${noteTypeShort[n.type]} · ${n.author.name}, ${n.author.credentials ?? ""}`,
    }));
    const current = notes.find((n) => n.id === sp.item) ?? notes[0];
    if (current) {
      const next = notes[notes.indexOf(current) + 1];
      detail = (
        <div className="flex h-full flex-col">
          <DetailHeader
            patient={current.patient}
            title={current.title}
            meta={`Written by ${current.author.name}, ${current.author.credentials ?? ""} · signed ${current.signedAt ? fmtDateTime(current.signedAt) : ""}`}
          />
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
            <NoteBody text={current.body} />
          </div>
          <div className="flex gap-2 border-t border-line bg-panel-muted px-4 py-2.5">
            <form action={cosignFromInbox.bind(null, current.id, next ? href(next.id) : href())}>
              <Button type="submit">Cosign</Button>
            </form>
            <Link href={`/patients/${current.patientId}/notes?note=${current.id}&cosign=1`} className="rounded border border-line bg-panel px-2.5 py-1 text-[12.5px] font-medium hover:bg-panel-muted">
              Cosign with attestation
            </Link>
            <Link href={`/patients/${current.patientId}/notes?note=${current.id}&addend=1`} className="rounded border border-line bg-panel px-2.5 py-1 text-[12.5px] font-medium hover:bg-panel-muted">
              Addend
            </Link>
          </div>
        </div>
      );
    }
  } else if (folder === "documents") {
    const docs = await db.clinicalDocument.findMany({
      where: documentsWhere(currentUser.id),
      orderBy: { serviceDate: "desc" },
      include: { patient: true, order: { select: { orderedById: true } } },
    });
    items = docs.map((d) => ({
      id: d.id,
      href: href(d.id),
      patient: d.patient,
      title: d.title,
      at: d.filedAt,
      sub: withPool(
        isUnassigned(d, currentUser.id),
        <span className="flex min-w-0 items-center gap-1.5">
          <DocTypeChip type={d.type} />
          <span className="truncate">{d.organization}</span>
        </span>,
      ),
    }));
    const current = docs.find((d) => d.id === sp.item) ?? docs[0];
    if (current) {
      const doc = toFiledDoc(await db.clinicalDocument.findUniqueOrThrow({ where: { id: current.id }, include: filedDocInclude }));
      const next = docs[docs.indexOf(current) + 1];
      detail = (
        <div>
          <DetailHeader patient={current.patient} title={docTypeLabel[current.type]} meta={`Filed ${fmtDateTime(current.filedAt)} by ${doc.filedBy.name}`} />
          <div className="px-4 py-3">
            <DocView doc={doc} patientId={current.patientId} />
          </div>
          <form action={acknowledgeDocument.bind(null, current.id, next ? href(next.id) : href())} className="flex flex-wrap items-center gap-2 border-t border-line bg-panel-muted px-4 py-2.5">
            <input name="comment" className={`${inputCls} min-w-48 flex-1`} placeholder="Comment (optional)" />
            <Button type="submit">Mark reviewed</Button>
            <Link href={`/patients/${current.patientId}/documents?doc=${current.id}`} className="rounded border border-line bg-panel px-2.5 py-1 text-[12.5px] font-medium hover:bg-panel-muted">
              Open in chart
            </Link>
          </form>
        </div>
      );
    }
  } else if (folder === "imports") {
    const jobs = await db.importJob.findMany({
      where: { status: { in: ["needs_review", "failed"] } },
      orderBy: { createdAt: "asc" },
      include: { patient: true, createdBy: true, _count: { select: { documents: true } } },
    });
    items = jobs.map((j) => ({
      id: j.id,
      href: href(j.id),
      patient: j.patient,
      title: j.kind === "document" ? "Outside clinical document" : "Outside lab report",
      at: j.createdAt,
      sub: <ImportStatusChip status={j.status} />,
    }));
    const current = jobs.find((j) => j.id === sp.item) ?? jobs[0];
    if (current) {
      detail = (
        <div>
          <DetailHeader
            patient={current.patient}
            title={current.kind === "document" ? "Outside clinical document" : "Outside lab report"}
            meta={`Uploaded ${fmtDateTime(current.createdAt)} by ${current.createdBy.name}`}
          />
          <div className="space-y-3 px-4 py-4">
            <p>
              {current._count.documents} {current._count.documents === 1 ? "page" : "pages"}.{" "}
              {current.kind === "document"
                ? current.status === "failed"
                  ? "The document couldn't be read automatically; it can be typed in by hand."
                  : `${docSummary(current.draft)} It was transcribed from the pages and is waiting for verification before it's filed.`
                : current.status === "failed"
                  ? "The report couldn't be read automatically; results can be entered by hand."
                  : "Results were read from the image and are waiting for verification before they're filed."}
            </p>
            <Link href={`/patients/${current.patientId}/import/${current.id}`} className="inline-block rounded bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent/90">
              Review and file
            </Link>
          </div>
        </div>
      );
    }
  } else if (folder === "refills") {
    const requests = await db.refillRequest.findMany({
      where: refillsWhere(currentUser),
      orderBy: { requestedAt: "asc" },
      include: { patient: true, medication: true, pharmacy: true, pendedBy: true },
    });
    items = requests.map((r) => ({
      id: r.id,
      href: href(r.id),
      patient: r.patient,
      title: r.medication.drug,
      at: r.requestedAt,
      sub: (
        <span className="truncate">
          {r.status === "pended" ? <span className="mr-1 rounded bg-accent-soft px-1 text-[10.5px] font-semibold text-accent">PENDED</span> : null}
          {r.pharmacy?.name ?? "Pharmacy"}
          {r.pendedBy && ` · ${r.pendedBy.name}`}
        </span>
      ),
    }));
    const current = requests.find((r) => r.id === sp.item) ?? requests[0];
    if (current) {
      const next = requests[requests.indexOf(current) + 1];
      detail = <RefillDetail key={current.id} requestId={current.id} next={next ? href(next.id) : href()} user={currentUser} />;
    }
  } else if (folder === "rxcosign") {
    const meds = await db.medicationRequest.findMany({
      where: { cosignerId: currentUser.id, cosignedAt: null },
      orderBy: { authoredAt: "asc" },
      include: { patient: true, prescriber: true, prior: true, pharmacy: true },
    });
    items = meds.map((m) => ({
      id: m.id,
      href: href(m.id),
      patient: m.patient,
      title: m.drug,
      at: m.authoredAt,
      sub: `${m.prescriber?.name ?? ""}${m.prior ? ` · changed from ${m.prior.drug}` : ""}`,
    }));
    const current = meds.find((m) => m.id === sp.item) ?? meds[0];
    if (current) {
      const next = meds[meds.indexOf(current) + 1];
      const ctx = withoutMed(await orderContext(current.patientId), current.drug);
      const warnings = medWarnings(current.drug, { dose: current.dose, frequency: current.frequency, refills: current.refills }, ctx);
      detail = (
        <div>
          <DetailHeader
            patient={current.patient}
            title={current.drug}
            meta={`Prescribed by ${current.prescriber ? displayName(current.prescriber) : "unknown"} · ${fmtDateTime(current.authoredAt)} · ${rxClassLabel[current.rxClass]}${current.pharmacy ? ` to ${current.pharmacy.name}` : ""}`}
          />
          <div className="space-y-2 px-4 py-3">
            <p>
              <span className="font-semibold">Sig: </span>
              {rxSummary({ dose: current.dose, route: current.route, frequency: current.frequency, prn: current.prn, prnReason: current.prnReason, quantity: current.quantity ?? undefined, daysSupply: current.daysSupply, refills: current.refills, daw: current.daw })}
            </p>
            {current.indication && <p className="text-ink-2">For {current.indication}</p>}
            {current.prior && (
              <p className="text-ink-2">
                Replaces {current.prior.drug}, {current.prior.dose} {current.prior.frequency}.
              </p>
            )}
            <WarningList warnings={warnings} />
            <p className="text-[12px] text-ink-3">The prescription was sent when the resident signed it. Cosigning records your supervision.</p>
          </div>
          <div className="flex gap-2 border-t border-line bg-panel-muted px-4 py-2.5">
            <form action={cosignPrescription.bind(null, current.id, next ? href(next.id) : href())}>
              <Button type="submit">Cosign</Button>
            </form>
            <Link href={`/patients/${current.patientId}/meds`} className="rounded border border-line bg-panel px-2.5 py-1 text-[12.5px] font-medium hover:bg-panel-muted">
              Open medications
            </Link>
          </div>
        </div>
      );
    }
  } else {
    const orders = await db.serviceRequest.findMany({ where: { orderedById: currentUser.id, status: "pending" }, orderBy: { createdAt: "asc" }, include: { patient: true } });
    const byPatient = new Map<string, typeof orders>();
    for (const o of orders) byPatient.set(o.patientId, [...(byPatient.get(o.patientId) ?? []), o]);
    const groups = [...byPatient.values()];
    items = groups.map((g) => ({
      id: g[0].patientId,
      href: href(g[0].patientId),
      patient: g[0].patient,
      title: `${g.length} unsigned order${g.length === 1 ? "" : "s"}`,
      at: g[0].createdAt,
      sub: <span className="truncate">{g.map((o) => o.display).join(", ")}</span>,
    }));
    const current = groups.find((g) => g[0].patientId === sp.item) ?? groups[0];
    if (current) {
      const ctx = await orderContext(current[0].patientId);
      detail = (
        <div>
          <DetailHeader patient={current[0].patient} title="Unsigned orders" meta={`Started ${fmtDateTime(current[0].createdAt)}`} />
          <ul>
            {current.map((o) => {
              const def = orderableFor(o.code);
              const warnings = def ? orderWarnings(def, { ...ctx, openOrders: ctx.openOrders.filter((x) => x.status !== "pending") }) : [];
              return (
                <li key={o.id} className="space-y-1 border-b border-line px-4 py-2">
                  <div className="flex items-center gap-2">
                    <OrderTypeIcon type={o.type} />
                    <span className="font-medium">{o.display}</span>
                    <PriorityChip priority={o.priority} />
                  </div>
                  {o.type === "medication" && <div className="pl-10 text-[12px] text-ink-2">{medSig(o.details)}</div>}
                  <div className="pl-10 text-[12px] text-ink-3">{o.indication ? `For: ${o.indication}` : "No indication"}</div>
                  <div className="pl-10">
                    <WarningList warnings={warnings} />
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="px-4 py-3">
            <Link href={`/patients/${current[0].patientId}/orders`} className="inline-block rounded bg-accent px-3 py-1.5 font-medium text-white hover:bg-accent/90">
              Review and sign in chart
            </Link>
          </div>
        </div>
      );
    }
  }

  const selectedId = sp.item ?? items[0]?.id;

  return (
    <div className="flex h-full">
      <nav className="w-60 shrink-0 border-r border-line bg-panel py-2">
        <h1 className="px-4 pb-2 text-[15px] font-semibold">Inbox</h1>
        {folders.map((f) => (
          <Link
            key={f.id}
            href={`/inbox?folder=${f.id}`}
            className={`flex items-center justify-between border-l-[3px] px-4 py-1.5 ${f.id === folder ? "border-accent bg-accent-soft font-semibold" : "border-transparent hover:bg-panel-muted"}`}
          >
            <span>{f.label}</span>
            {counts[f.id] > 0 && (
              <span className={`tabular rounded-full px-1.5 text-[11px] font-semibold ${f.id === "abnormal" ? "bg-high-soft text-high" : "bg-panel-muted text-ink-2"}`}>
                {counts[f.id]}
              </span>
            )}
          </Link>
        ))}
        <p className="mt-4 px-4 text-[11.5px] leading-snug text-ink-3">
          Results land here when you ordered them, or, for outside reports, when you are the patient&apos;s PCP. Unassigned ones (no PCP, or the clinician has left) go to every physician and resident.
        </p>
      </nav>

      <section className="flex w-[380px] shrink-0 flex-col border-r border-line bg-panel">
        <header className="flex items-center justify-between border-b border-line px-3 py-2">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-2">{FOLDERS.find((f) => f.id === folder)!.label}</h2>
          {folder === "normal" && items.length > 0 && (
            <form action={acknowledgeAllNormal}>
              <Button type="submit" variant="secondary" className="py-0.5 text-[11.5px]">
                Acknowledge all {items.length}
              </Button>
            </form>
          )}
        </header>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {items.length === 0 && <Empty>Nothing here. You&apos;re all caught up.</Empty>}
          {items.map((it) => (
            <li key={it.id} className="border-b border-line">
              <Link
                href={it.href}
                className={`block border-l-[3px] px-3 py-2 ${it.id === selectedId ? "border-accent bg-accent-soft" : "border-transparent hover:bg-panel-muted"}`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{fullName(it.patient)}</span>
                  <span className="tabular shrink-0 text-[11.5px] text-ink-3">{fmtDate(it.at)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {it.critical && <span className="rounded bg-crit px-1 text-[10px] font-bold text-white">CRITICAL</span>}
                  <span className="truncate text-ink-2">{it.title}</span>
                </div>
                <div className="flex min-w-0 text-[12px] text-ink-3">{it.sub}</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="min-w-0 flex-1 overflow-y-auto bg-panel">{detail ?? <Empty>Select an item.</Empty>}</section>
    </div>
  );
}

function DetailHeader({
  patient,
  title,
  meta,
}: {
  patient: { id: string; firstName: string; lastName: string; dob: Date; sex: "male" | "female" | "other" | "unknown"; mrn: string };
  title: React.ReactNode;
  meta: React.ReactNode;
}) {
  return (
    <header className="border-b border-line px-4 py-3">
      <div className="flex items-baseline gap-2">
        <Link href={`/patients/${patient.id}`} className="text-[15px] font-semibold hover:text-accent">
          {fullName(patient)}
        </Link>
        <span className="text-ink-2">
          {age(patient.dob)} y {sexShort(patient.sex)} · MRN <span className="font-mono">{patient.mrn}</span>
        </span>
      </div>
      <div className="mt-0.5 font-medium">{title}</div>
      <div className="text-[12px] text-ink-3">{meta}</div>
    </header>
  );
}

// Items with no responsible clinician reach every reviewer; say so, so it's clear nobody else has it.
function withPool(unassigned: boolean, sub: React.ReactNode) {
  if (!unassigned) return sub;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="shrink-0 rounded bg-warn-soft px-1 text-[10.5px] font-semibold text-warn" title="No PCP, or the ordering clinician has left. Any clinician can review it.">
        Unassigned
      </span>
      <span className="min-w-0 truncate">{sub}</span>
    </span>
  );
}

async function ResultDetail({ reportId, next }: { reportId: string; next: string }) {
  const r = await db.diagnosticReport.findUniqueOrThrow({
    where: { id: reportId },
    include: { patient: true, observations: { orderBy: { sortOrder: "asc" } }, order: { include: { orderedBy: true } }, verifiedBy: true },
  });
  const history = await db.observation.findMany({
    where: { patientId: r.patientId, category: "laboratory", code: { in: r.observations.map((o) => o.code) }, effectiveAt: { lte: r.effectiveAt } },
    orderBy: { effectiveAt: "asc" },
    select: { code: true, valueNum: true, valueText: true, effectiveAt: true, flag: true, unit: true },
  });
  const byCode = new Map<string, typeof history>();
  for (const h of history) byCode.set(h.code, [...(byCode.get(h.code) ?? []), h]);
  const base = `/patients/${r.patientId}`;

  return (
    <div>
      <DetailHeader
        patient={r.patient}
        title={
          <>
            {r.display}
            {r.source === "imported" && <span className="ml-1.5 rounded bg-low-soft px-1 text-[10.5px] font-semibold text-low">IMPORTED</span>}
          </>
        }
        meta={
          <>
            Collected {fmtDateTime(r.effectiveAt)} · Resulted {fmtDateTime(r.issuedAt)} · {r.performer}
            {r.order && (
              <>
                {" "}
                · Ordered by {r.order.orderedBy.name}
                {r.order.indication && ` for ${r.order.indication}`}
              </>
            )}
            {r.source === "imported" && r.verifiedBy && ` · Transcribed and verified by ${r.verifiedBy.name}`}
          </>
        }
      />
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-line bg-panel-muted px-4 py-1.5 text-[12.5px]">
        <Link href={`${base}/results?view=reports&report=${r.id}`} className="font-medium text-accent hover:underline">
          Open in chart
        </Link>
        <Link href={`${base}/results?view=graph&codes=${r.observations.map((o) => o.code).join(",")}`} className="font-medium text-accent hover:underline">
          Graph trends
        </Link>
        <Link href={`/print/results?report=${r.id}`} className="font-medium text-accent hover:underline">
          Print
        </Link>
        <Link href={`/print/results?report=${r.id}&copy=patient`} className="font-medium text-accent hover:underline">
          Patient letter
        </Link>
        <Link href={`${base}/orders`} className="font-medium text-accent hover:underline">
          Order follow-up
        </Link>
        <Link href={`${base}/notes?new=1`} className="font-medium text-accent hover:underline">
          Write note
        </Link>
      </div>
      <table className="w-full">
        <thead className="text-left text-[11.5px] text-ink-3">
          <tr>
            <th className="px-4 py-2 font-medium">Component</th>
            <th className="px-3 py-2 text-right font-medium">Value</th>
            <th className="px-3 py-2 font-medium">Range</th>
            <th className="px-3 py-2 text-right font-medium">Previous</th>
            <th className="px-3 py-2 text-right font-medium">Change</th>
            <th className="px-3 py-2 font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {r.observations.map((o) => {
            const series = (byCode.get(o.code) ?? []).filter((h) => h.unit === o.unit);
            const prior = series.filter((h) => h.effectiveAt < r.effectiveAt).at(-1);
            const delta = prior?.valueNum != null && o.valueNum != null ? o.valueNum - prior.valueNum : null;
            const pct = delta !== null && prior?.valueNum ? (delta / prior.valueNum) * 100 : null;
            return (
              <tr key={o.id} className="border-t border-line">
                <td className="px-4 py-1.5">{o.display}</td>
                <td className={`tabular whitespace-nowrap px-3 py-1.5 text-right font-medium ${flagText(o.flag)}`}>
                  {fmtValue(o)} <span className="font-normal text-ink-3">{unitLabel(o.unit)}</span>
                  <FlagBadge flag={o.flag} />
                </td>
                <td className="tabular px-3 py-1.5 text-ink-2">{fmtRange(o)}</td>
                <td className="tabular whitespace-nowrap px-3 py-1.5 text-right text-ink-2">
                  {prior ? (
                    <>
                      <span className={flagText(prior.flag)}>{fmtValue(prior)}</span>
                      <div className="text-[11px] text-ink-3">{fmtDate(prior.effectiveAt)}</div>
                    </>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="tabular whitespace-nowrap px-3 py-1.5 text-right">
                  {delta !== null && pct !== null ? (
                    <span className={Math.abs(pct) >= 15 ? "font-semibold text-ink" : "text-ink-3"}>
                      {delta > 0 ? "▲" : delta < 0 ? "▼" : "="} {Math.abs(Math.round(pct))}%
                    </span>
                  ) : (
                    <span className="text-ink-3">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5">
                  <Sparkline values={series.map((h) => h.valueNum).filter((v): v is number => v !== null)} refLow={o.refLow} refHigh={o.refHigh} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <form action={acknowledgeResult.bind(null, r.id, next)} className="flex items-center gap-2 border-t border-line bg-panel-muted px-4 py-2.5">
        <input name="comment" placeholder="Optional comment (e.g. Discussed with patient, repeat in 3 months)" className={`${inputCls} flex-1`} />
        <Button type="submit">Acknowledge</Button>
      </form>
    </div>
  );
}

const DENY_REASONS = ["Needs an appointment first", "Medication discontinued", "Too early to refill", "Patient not under my care", "Changed to another medication"];

async function RefillDetail({ requestId, next, user }: { requestId: string; next: string; user: SessionUser }) {
  const req = await db.refillRequest.findUniqueOrThrow({ where: { id: requestId }, include: { patient: true, pharmacy: true, pendedBy: true } });
  const { med, ctx, protocol, fills } = await refillReview(req.medicationId);
  const product = productFor(med);
  const warnings = medWarnings(med.drug, { dose: med.dose, frequency: med.frequency, refills: med.refills }, ctx);
  const stops = warnings.filter((w) => w.level === "stop");
  const met = protocol.every((p) => p.met);
  const canApprove = can(user.role, "approveRefills");
  const attendings = canApprove && needsCosign(user.role) ? await db.practitioner.findMany({ where: { role: "physician", active: true }, orderBy: { name: "asc" } }) : [];
  const limit = maxRefills(med.drug);
  const pendDefault = `Protocol ${met ? "met" : "not met"}: ${protocol.map((p) => `${p.met ? "✓" : "✗"} ${p.label.toLowerCase()}`).join("; ")}.`;

  return (
    <div>
      <DetailHeader
        patient={req.patient}
        title={<>Refill request: {med.drug}</>}
        meta={
          <>
            From {req.pharmacy?.name ?? "pharmacy"} · {fmtDateTime(req.requestedAt)}
            {req.pharmacyComment && <> · “{req.pharmacyComment}”</>}
          </>
        }
      />
      <div className="grid gap-4 px-4 py-3 lg:grid-cols-2">
        <section className="space-y-1">
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Current prescription</h3>
          <p className="font-medium">{sigText({ dose: med.dose, route: med.route, frequency: med.frequency, prn: med.prn, prnReason: med.prnReason })}</p>
          {med.indication && <p className="text-ink-2">For {med.indication}</p>}
          <p className="text-ink-2">
            {med.quantity} with {med.refills} refill{med.refills === 1 ? "" : "s"}, {fills.refillsLeft} left · prescribed {fmtDate(med.authoredAt)} by {med.prescriber?.name}
          </p>
          <ul className="mt-1 space-y-0.5 text-[12px] text-ink-2">
            {med.dispenses.slice(0, 5).map((d) => (
              <li key={d.id}>
                <span className="tabular">{fmtDate(d.filledAt)}</span> filled {d.quantity} ({d.daysSupply} days)
              </li>
            ))}
          </ul>
          {fills.daysLate > 0 ? (
            <p className="text-[12px] font-medium text-crit">Supply ran out {fills.daysLate} days ago.</p>
          ) : fills.runsOutAt ? (
            <p className="text-[12px] text-ink-3">Current supply lasts to {fmtDate(fills.runsOutAt)}.</p>
          ) : null}
        </section>
        <section>
          <h3 className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-3">Refill protocol</h3>
          <ul className="mt-1 space-y-1">
            {protocol.map((p) => (
              <li key={p.label} className="flex gap-2">
                <span className={`w-4 shrink-0 text-center font-bold ${p.met ? "text-accent" : "text-crit"}`}>{p.met ? "✓" : "✗"}</span>
                <span>
                  {p.label}
                  <span className="block text-[12px] text-ink-3">{p.detail}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className={`mt-2 text-[12px] font-medium ${met ? "text-accent" : "text-warn"}`}>{met ? "Protocol met." : "Protocol not met: approve a short supply or ask for a visit or labs."}</p>
        </section>
      </div>
      {warnings.length > 0 && (
        <div className="px-4 pb-3">
          <WarningList warnings={warnings} />
        </div>
      )}
      {req.status === "pended" && req.pendedBy && (
        <p className="mx-4 mb-3 rounded border border-accent/30 bg-accent-soft px-3 py-2 text-[12.5px]">
          <span className="font-semibold">Pended by {displayName(req.pendedBy)}</span> {req.pendedAt && fmtDateTime(req.pendedAt)}
          {req.pendNote && <span className="block text-ink-2">{req.pendNote}</span>}
        </p>
      )}

      {canApprove ? (
        <div className="space-y-2 border-t border-line bg-panel-muted px-4 py-3">
          <ResultForm action={approveRefill.bind(null, req.id, next)} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-ink-3">Dispense</span>
              <input name="quantity" defaultValue={med.quantity ?? product?.quantity ?? ""} className={`${inputCls} w-36`} />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className="text-[11px] font-medium text-ink-3">Refills{limit < 11 ? ` (max ${limit})` : ""}</span>
              <input name="refills" type="number" min={0} max={limit} defaultValue={met ? Math.min(limit, med.refills || (product?.refills ?? 0)) : 0} className={`${inputCls} w-20`} />
            </label>
            <label className="flex min-w-48 flex-1 flex-col gap-0.5">
              <span className="text-[11px] font-medium text-ink-3">Note to pharmacy</span>
              <input name="note" placeholder={met ? "" : "e.g. 30-day supply; patient needs a visit"} className={inputCls} />
            </label>
            {stops.length > 0 && (
              <label className="flex min-w-48 flex-col gap-0.5">
                <span className="text-[11px] font-medium text-crit">Override reason</span>
                <input name="overrideReason" className={inputCls} />
              </label>
            )}
            {attendings.length > 0 && (
              <label className="flex flex-col gap-0.5">
                <span className="text-[11px] font-medium text-ink-3">Cosigning attending</span>
                <select name="cosignerId" defaultValue="" className={inputCls}>
                  <option value="">Choose</option>
                  {attendings.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button type="submit">Approve and send</Button>
          </ResultForm>
          <div className="flex flex-wrap items-end gap-2">
            <form action={denyRefill.bind(null, req.id, next)} className="flex flex-wrap items-end gap-2">
              <select name="reason" defaultValue="" required className={inputCls} aria-label="Reason to deny">
                <option value="" disabled>
                  Deny reason…
                </option>
                {DENY_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <input name="note" placeholder="Note (optional)" className={`${inputCls} w-48`} />
              <Button type="submit" variant="danger">
                Deny
              </Button>
            </form>
            <Link href={`/patients/${med.patientId}/meds?rx=${med.id}&modify=1&refill=${req.id}#prescribe`} className="ml-auto text-[12.5px] font-medium text-accent hover:underline">
              Change dose or quantity in chart
            </Link>
          </div>
        </div>
      ) : req.status === "requested" ? (
        <form action={pendRefill.bind(null, req.id, next)} className="flex items-end gap-2 border-t border-line bg-panel-muted px-4 py-3">
          <label className="flex flex-1 flex-col gap-0.5">
            <span className="text-[11px] font-medium text-ink-3">Note for the prescriber</span>
            <input name="note" defaultValue={pendDefault} className={inputCls} />
          </label>
          <Button type="submit">Pend for approval</Button>
        </form>
      ) : null}
    </div>
  );
}

function docSummary(draft: unknown) {
  const d = DocDraftSchema.safeParse(draft);
  if (!d.success) return "";
  const parts = [d.data.title, d.data.organization].filter(Boolean).join(" from ");
  return parts ? `${docTypeLabel[d.data.type]}: ${parts}.` : "";
}
