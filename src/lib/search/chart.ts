import { isBloodSugar } from "@/lib/labs/groups";
import "server-only";
import { db } from "@/lib/db";
import { can, type SessionUser } from "@/lib/roles";
import { fmtDate, fmtDateOnly, fmtRange, fmtValue, unitLabel } from "@/lib/format";
import { noteTypes } from "@/lib/notes/library";
import { docTypeLabel, readContent } from "@/lib/documents/draft";
import { mediaCategoryLabel, isMediaCategory } from "@/lib/media/categories";
import { productFor } from "@/lib/meds/formulary";
import { VISIT_TYPES } from "@/lib/scheduling/visit-types";
import { searchDocs, canon, type Doc, type Field } from "./text";
import { withHighlight, type HitKind, type HitSeries, type SearchHit, type SearchResult } from "./types";

// Chart search: gathers everything in one chart that the user may see, as
// searchable documents, and matches the query against them (./text.ts).
// One chart is small enough to search in memory, which buys typo tolerance,
// abbreviations and highlighting that SQL full-text search can't give. Large
// binary columns (scans, photos) are never read.

type Item = { doc: Doc; hit: Omit<SearchHit, "snippet" | "href"> & { href: string } };

const f = (label: string, text: string | null | undefined, weight: number, snippet = false): Field => ({ label, text: text ?? "", weight, snippet });
const noteTypeLabel = Object.fromEntries(noteTypes.map((t) => [t.id, t.label])) as Record<string, string>;
const visitTypeLabel = Object.fromEntries(VISIT_TYPES.map((t) => [t.id, t.label]));
const sentence = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export async function gatherChart(patientId: string, user: SessionUser): Promise<Item[]> {
  const clinical = can(user.role, "viewClinical");
  const base = `/patients/${patientId}`;
  const none = Promise.resolve([] as never[]);

  const [observations, reports, notes, docs, media, meds, orders, problems, allergies, encounters, chats, texts] = await Promise.all([
    clinical
      ? db.observation.findMany({
          where: { patientId },
          orderBy: { effectiveAt: "asc" },
          select: {
            id: true, code: true, display: true, category: true, valueNum: true, valueText: true, unit: true, refLow: true, refHigh: true, refText: true,
            flag: true, effectiveAt: true, reportId: true, correctedAt: true,
            report: { select: { display: true, source: true, performer: true } },
          },
        })
      : none,
    clinical
      ? db.diagnosticReport.findMany({
          where: { patientId },
          orderBy: { effectiveAt: "desc" },
          select: { id: true, code: true, display: true, performer: true, effectiveAt: true, source: true, reviewComment: true, importJobId: true, reviewedAt: true, correctedAt: true },
        })
      : none,
    clinical
      ? db.note.findMany({
          where: { patientId },
          orderBy: { serviceAt: "desc" },
          select: {
            id: true, title: true, body: true, type: true, status: true, serviceAt: true, cosignText: true, editedAt: true, enteredInErrorAt: true,
            author: { select: { name: true, credentials: true } },
            cosigner: { select: { name: true } },
            addenda: { select: { body: true, author: { select: { name: true } } } },
            versions: { select: { number: true, title: true, body: true } },
          },
        })
      : none,
    clinical
      ? db.clinicalDocument.findMany({
          where: { patientId },
          orderBy: { serviceDate: "desc" },
          select: { id: true, type: true, title: true, organization: true, author: true, serviceDate: true, content: true, reviewComment: true, reviewedAt: true },
        })
      : none,
    clinical
      ? db.mediaItem.findMany({
          where: { patientId },
          orderBy: { takenAt: "desc" },
          select: { id: true, title: true, category: true, bodySite: true, description: true, takenAt: true, fileName: true, mimeType: true, uploadedBy: { select: { name: true } } },
        })
      : none,
    clinical
      ? db.medicationRequest.findMany({
          where: { patientId },
          orderBy: { authoredAt: "desc" },
          select: {
            id: true, drug: true, rxnorm: true, dose: true, route: true, frequency: true, prn: true, prnReason: true, indication: true, status: true, start: true, end: true,
            rxClass: true, authoredAt: true, quantity: true, patientInstructions: true, pharmacyNote: true, endReason: true, takingNote: true,
            prescriber: { select: { name: true } },
            condition: { select: { display: true } },
          },
        })
      : none,
    clinical
      ? db.serviceRequest.findMany({
          where: { patientId },
          orderBy: { createdAt: "desc" },
          select: {
            id: true, type: true, code: true, display: true, status: true, priority: true, indication: true, instructions: true, createdAt: true, signedAt: true, completedAt: true,
            orderedBy: { select: { name: true } },
            condition: { select: { display: true } },
          },
        })
      : none,
    clinical ? db.condition.findMany({ where: { patientId }, orderBy: { priority: "asc" } }) : none,
    clinical ? db.allergyIntolerance.findMany({ where: { patientId } }) : none,
    db.encounter.findMany({
      where: { patientId },
      orderBy: { start: "desc" },
      select: {
        id: true, start: true, status: true, type: true, visitType: true, reason: true, bookingNote: true, cancelReason: true, chiefComplaint: true, advice: true,
        followUpNote: true, room: true,
        provider: { select: { name: true } },
        diagnoses: { select: { code: true, display: true }, orderBy: { rank: "asc" } },
      },
    }),
    can(user.role, "useChat")
      ? db.chatMessage.findMany({
          where: { kind: "text", conversation: { patientId, members: { some: { practitionerId: user.id, leftAt: null } } } },
          orderBy: { createdAt: "desc" },
          take: 500,
          select: { id: true, body: true, createdAt: true, urgent: true, conversationId: true, sender: { select: { name: true } }, conversation: { select: { title: true } } },
        })
      : none,
    can(user.role, "textPatients")
      ? db.smsMessage.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, body: true, createdAt: true, status: true, kind: true, sentBy: { select: { name: true } } } })
      : none,
  ]);

  const items: Item[] = [];
  const push = (kind: HitKind, key: string, fields: Field[], hit: Omit<Item["hit"], "kind" | "key">, opts: { boost?: number } = {}) =>
    items.push({ doc: { key, fields, at: hit.at ? new Date(hit.at) : null, boost: opts.boost }, hit: { kind, key, ...hit } });

  // ---- Lab tests and vital signs: one result per test, with every value and its trend ----
  const reportHref = (id: string) => `${base}/results?view=reports&report=${id}`;
  const series = new Map<string, typeof observations>();
  for (const o of observations) {
    const k = `${o.category}:${o.code}`;
    series.set(k, [...(series.get(k) ?? []), o]);
  }
  for (const [k, obs] of series) {
    const latest = obs[obs.length - 1];
    const vital = latest.category === "vital_signs";
    const s: HitSeries = {
      unit: unitLabel(latest.unit),
      refLow: latest.refLow,
      refHigh: latest.refHigh,
      refText: latest.refText,
      graphHref: isBloodSugar(latest, latest.report?.display) ? `${base}/sugar` : vital ? `${base}/vitals?view=graph` : `${base}/results?view=graph&codes=${encodeURIComponent(latest.code)}`,
      points: obs.map((o) => ({
        t: o.effectiveAt.getTime(),
        v: o.valueNum,
        text: `${fmtValue(o)}${o.correctedAt ? " (corrected)" : ""}`,
        flag: o.flag,
        href: o.reportId ? reportHref(o.reportId) : `${base}/vitals`,
        imported: o.report?.source === "imported",
        source: o.report?.performer,
      })),
    };
    const panels = [...new Set(obs.map((o) => o.report?.display).filter(Boolean))].join(", ");
    const texts = [...new Set(obs.map((o) => o.valueText).filter(Boolean))].join(", ");
    const range = fmtRange(latest);
    push(
      vital ? "vital" : "lab",
      `obs:${k}`,
      [f("Test", latest.display, 3), f("Code", latest.code, 1), f("Panel", panels, 1), f("Result", texts, 0.6), f("Lab", [...new Set(obs.map((o) => o.report?.performer).filter(Boolean))].join(", "), 0.4)],
      {
        title: latest.display,
        subtitle: `${obs.length} result${obs.length === 1 ? "" : "s"} · latest ${fmtValue(latest)}${latest.unit ? ` ${unitLabel(latest.unit)}` : ""} on ${fmtDate(latest.effectiveAt)}${range ? ` · range ${range}` : ""}`,
        at: latest.effectiveAt.getTime(),
        href: s.graphHref!,
        series: s,
        flag: latest.flag,
      },
      { boost: 1 },
    );
  }

  // ---- Lab reports, by panel: every report of that panel listed ----
  const panels = new Map<string, typeof reports>();
  for (const r of reports) panels.set(r.code, [...(panels.get(r.code) ?? []), r]);
  for (const [code, rs] of panels) {
    const latest = rs[0];
    push(
      "panel",
      `panel:${code}`,
      [
        f("Report", latest.display, 3),
        f("Lab", [...new Set(rs.map((r) => r.performer))].join(", "), 1),
        f("Source", rs.some((r) => r.source === "imported") ? "imported outside report" : "", 0.5),
        f("Review comment", rs.map((r) => r.reviewComment).filter(Boolean).join(" · "), 1, true),
      ],
      {
        title: latest.display,
        subtitle: `${rs.length} report${rs.length === 1 ? "" : "s"} · latest ${fmtDate(latest.effectiveAt)} · ${latest.performer}`,
        at: latest.effectiveAt.getTime(),
        href: reportHref(latest.id),
        links: rs.slice(0, 12).map((r) => ({
          label: `${fmtDate(r.effectiveAt)}${r.source === "imported" ? " · imported" : ""}${r.correctedAt ? " · corrected" : ""}${r.reviewedAt ? "" : " · not reviewed"}`,
          href: reportHref(r.id),
        })),
      },
      { boost: 0.8 },
    );
  }

  // ---- Notes, with addenda and earlier signed versions ----
  for (const n of notes) {
    const author = n.author.credentials ? `${n.author.name}, ${n.author.credentials}` : n.author.name;
    push(
      "note",
      `note:${n.id}`,
      [
        f("Title", n.title, 3),
        f("Type", noteTypeLabel[n.type], 1),
        f("Author", `${author}${n.cosigner ? ` ${n.cosigner.name}` : ""}`, 1),
        f("Note", n.body, 1, true),
        f("Addendum", n.addenda.map((a) => `${a.body} (${a.author.name})`).join("\n\n"), 1, true),
        f("Cosign", n.cosignText, 0.8, true),
        f("Earlier version", n.versions.map((v) => `${v.title}\n${v.body}`).join("\n\n"), 0.5, true),
      ],
      {
        title: n.title,
        subtitle: `${noteTypeLabel[n.type]} · ${author} · ${fmtDate(n.serviceAt)}`,
        at: n.serviceAt.getTime(),
        href: `${base}/notes?note=${n.id}`,
        status: n.enteredInErrorAt ? "Entered in error" : n.status === "draft" ? "Pended" : n.status === "pending_cosign" ? "Needs cosign" : n.editedAt ? "Edited" : undefined,
      },
    );
  }

  // ---- Outside documents: imaging, discharge summaries, letters; numbered measurements trended ----
  const measures = new Map<string, { name: string; unit: string; points: { t: number; v: number | null; text: string; href: string; source: string; range: string }[]; docs: string[] }>();
  for (const d of docs) {
    const c = readContent(d.content);
    const href = `${base}/documents?doc=${d.id}`;
    const imaging = d.type === "imaging_report";
    push(
      imaging ? "imaging" : "document",
      `doc:${d.id}`,
      [
        f("Title", d.title, 3),
        f("Type", `${docTypeLabel[d.type]} ${c.modality}`, 1.5),
        f("Body part", c.bodyPart, 1.5),
        f("From", `${d.organization ?? ""} ${d.author ?? ""}`, 1),
        f("Impression", c.impression, 1.5, true),
        f("Diagnoses", c.diagnoses.map((x) => `${x.text}${x.icd10 ? ` (${x.icd10})` : ""}`).join("; "), 1.3, true),
        f("Measurements", c.measurements.map((m) => `${m.group ? `${m.group}: ` : ""}${m.name} ${m.value}${m.unit ? ` ${m.unit}` : ""}${m.range ? ` (${m.range})` : ""}`).join("; "), 1.2, true),
        f("Medications", c.meds.map((m) => m.text || `${m.drug} ${m.dose} ${m.frequency}`).join("; "), 1, true),
        f("Follow-up", c.followUps.map((x) => `${x.text}${x.due ? ` (${x.due})` : ""}`).join("; "), 1, true),
        f("Report", c.sections.map((s) => `${s.heading}: ${s.text}`).join("\n\n"), 1, true),
        f("Review comment", d.reviewComment, 1, true),
      ],
      {
        title: d.title,
        subtitle: `${docTypeLabel[d.type]}${d.organization ? ` · ${d.organization}` : ""} · ${fmtDateOnly(d.serviceDate)}`,
        at: d.serviceDate.getTime(),
        href,
        status: d.reviewedAt ? undefined : "Not reviewed",
      },
    );
    for (const m of c.measurements) {
      const key = `${canon(m.name)}|${m.unit.trim().toLowerCase()}`;
      const entry = measures.get(key) ?? { name: m.name, unit: m.unit, points: [], docs: [] };
      const num = parseFloat(m.value.replace(/[^\d.\-]+/g, " ").trim().split(" ")[0]);
      entry.points.push({ t: d.serviceDate.getTime(), v: Number.isFinite(num) ? num : null, text: m.value, href, source: d.title, range: m.range });
      entry.docs.push(d.title, m.group);
      measures.set(key, entry);
    }
  }
  for (const [key, m] of measures) {
    const points = m.points.sort((a, b) => a.t - b.t);
    const latest = points[points.length - 1];
    push(
      "measurement",
      `measure:${key}`,
      [f("Measurement", m.name, 3), f("From", [...new Set(m.docs)].join(", "), 0.8)],
      {
        title: m.name,
        subtitle: `${points.length} reading${points.length === 1 ? "" : "s"} · latest ${latest.text}${m.unit ? ` ${m.unit}` : ""} on ${fmtDateOnly(new Date(latest.t))} · ${latest.source}`,
        at: latest.t,
        href: latest.href,
        series: { unit: m.unit, refLow: null, refHigh: null, refText: latest.range || null, points: points.map((p) => ({ t: p.t, v: p.v, text: p.text, flag: null, href: p.href, imported: true, source: p.source })) },
      },
      { boost: 0.6 },
    );
  }

  // ---- Media: clinical photos and scans ----
  for (const m of media) {
    const cat = isMediaCategory(m.category) ? mediaCategoryLabel[m.category] : m.category;
    push(
      "media",
      `media:${m.id}`,
      [f("Title", m.title, 3), f("Category", cat, 1.5), f("Body site", m.bodySite, 1.5), f("Description", m.description, 1, true), f("File", m.fileName, 0.4)],
      {
        title: m.title,
        subtitle: `${cat}${m.bodySite ? ` · ${m.bodySite}` : ""} · ${fmtDate(m.takenAt)} · ${m.uploadedBy.name}`,
        at: m.takenAt.getTime(),
        href: `${base}/media?item=${m.id}`,
        thumb: m.mimeType.startsWith("image/") ? `/media/${m.id}?size=thumb` : undefined,
      },
    );
  }

  // ---- Medications: one result per drug, its prescriptions and changes together ----
  const groupBy = <T,>(xs: T[], key: (x: T) => string) => {
    const m = new Map<string, T[]>();
    for (const x of xs) m.set(key(x), [...(m.get(key(x)) ?? []), x]);
    return m;
  };
  for (const [drugKey, ms] of groupBy(meds, (m) => canon(m.drug))) {
    const m = ms[0]; // newest
    const product = productFor(m);
    const current = ms.find((x) => x.status === "active" || x.status === "on_hold");
    const all = (pick: (x: (typeof ms)[number]) => string | null | undefined) => [...new Set(ms.map(pick).filter(Boolean))].join(" · ");
    push(
      "med",
      `med:${drugKey}`,
      [
        f("Drug", m.drug, 3),
        f("Also called", product?.keywords?.join(" "), 1),
        f("Sig", all((x) => `${x.dose} ${x.route} ${x.frequency}${x.prn ? ` as needed ${x.prnReason ?? ""}` : ""}`), 1),
        f("For", all((x) => `${x.indication ?? ""} ${x.condition?.display ?? ""}`.trim()), 1.2),
        f("Instructions", all((x) => [x.patientInstructions, x.pharmacyNote, x.takingNote].filter(Boolean).join(" · ")), 1, true),
        f("Stopped because", all((x) => x.endReason), 1, true),
        f("Prescriber", all((x) => x.prescriber?.name), 0.6),
      ],
      {
        title: m.drug,
        subtitle: `${(current ?? m).dose} ${(current ?? m).route} ${(current ?? m).frequency}${(current ?? m).prn ? " as needed" : ""} · ${
          m.rxClass === "historical" ? "outside med" : `last prescribed ${fmtDate(m.authoredAt)}${m.prescriber ? ` by ${m.prescriber.name}` : ""}`
        }${ms.length > 1 ? ` · ${ms.length} prescriptions` : ""}`,
        at: m.authoredAt.getTime(),
        href: `${base}/meds?history=1`,
        status: current ? (current.status === "on_hold" ? "On hold" : undefined) : sentence(m.status === "replaced" ? "stopped" : m.status),
      },
      { boost: current ? 0.5 : 0 },
    );
  }

  // ---- Orders: one result per orderable, every time it was ordered ----
  for (const [code, os] of groupBy(orders, (o) => `${o.type}:${o.code}`)) {
    const o = os[0];
    const all = (pick: (x: (typeof os)[number]) => string | null | undefined) => [...new Set(os.map(pick).filter(Boolean))].join(" · ");
    push(
      "order",
      `order:${code}`,
      [
        f("Order", o.display, 3),
        f("Type", o.type, 1),
        f("Code", o.code, 0.6),
        f("For", all((x) => `${x.indication ?? ""} ${x.condition?.display ?? ""}`.trim()), 1.2),
        f("Instructions", all((x) => x.instructions), 1, true),
        f("Ordered by", all((x) => x.orderedBy.name), 0.6),
      ],
      {
        title: o.display,
        subtitle: `${sentence(o.type)} order · ${os.length > 1 ? `${os.length} times, last ` : ""}${fmtDate(o.signedAt ?? o.createdAt)} · ${o.orderedBy.name}${
          o.priority === "routine" ? "" : ` · ${o.priority.toUpperCase()}`
        }`,
        at: (o.signedAt ?? o.createdAt).getTime(),
        href: `${base}/orders?history=all`,
        status: o.status === "pending" ? "Pended" : o.status === "signed" ? "Open" : sentence(o.status),
      },
    );
  }

  // ---- Problems and allergies ----
  for (const p of problems) {
    push(
      "problem",
      `problem:${p.id}`,
      [f("Problem", p.display, 3), f("ICD-10", p.code, 1.5), f("Comment", p.comment, 1, true)],
      {
        title: p.display,
        subtitle: `${p.code}${p.onset ? ` · since ${fmtDateOnly(p.onset)}` : ""}${p.resolvedAt ? ` · resolved ${fmtDateOnly(p.resolvedAt)}` : ""}`,
        at: (p.resolvedAt ?? p.onset)?.getTime() ?? null,
        href: `${base}/problems`,
        status: p.status === "active" ? undefined : "Resolved",
      },
      { boost: p.status === "active" ? 1 : 0 },
    );
  }
  for (const a of allergies) {
    push(
      "allergy",
      `allergy:${a.id}`,
      [f("Allergy", a.substance, 3), f("Reaction", a.reaction, 1.5), f("Type", `${a.type} allergy ${a.severity}`, 0.8)],
      {
        title: a.substance,
        subtitle: `${sentence(a.severity)} ${a.type} allergy${a.reaction ? ` · ${a.reaction}` : ""}`,
        at: a.recordedAt.getTime(),
        href: `${base}/allergies`,
      },
      { boost: 1 },
    );
  }

  // ---- Visits and appointments ----
  for (const e of encounters) {
    const kind = visitTypeLabel[e.visitType] ?? sentence(e.visitType);
    push(
      "visit",
      `visit:${e.id}`,
      [
        f("Reason", e.reason, 2, true),
        f("Visit type", kind, 1),
        f("Provider", e.provider?.name, 0.8),
        f("Booking note", e.bookingNote, 1, true),
        f("Cancelled because", e.cancelReason, 1, true),
        ...(clinical
          ? [
              f("Chief complaint", e.chiefComplaint, 2, true),
              f("Diagnoses", e.diagnoses.map((d) => `${d.display}${d.code ? ` (${d.code})` : ""}`).join("; "), 2, true),
              f("Advice", e.advice, 1, true),
              f("Follow-up", e.followUpNote, 1, true),
            ]
          : []),
      ],
      {
        title: `${kind}${e.reason ? `: ${e.reason}` : ""}`,
        subtitle: `${fmtDate(e.start)}${e.provider ? ` · ${e.provider.name}` : ""}`,
        at: e.start.getTime(),
        href: clinical && !["planned", "cancelled", "no_show"].includes(e.status) ? `${base}/visit?e=${e.id}` : `${base}/appointments`,
        status: ["cancelled", "no_show", "planned"].includes(e.status) ? sentence(e.status === "planned" ? "scheduled" : e.status) : undefined,
      },
    );
  }

  // ---- Secure chat about this patient (only conversations the user is in) and texts ----
  for (const m of chats) {
    push("message", `chat:${m.id}`, [f("Message", m.body, 1, true), f("From", m.sender.name, 0.6), f("Conversation", m.conversation.title, 0.6)], {
      title: m.conversation.title || `Message from ${m.sender.name}`,
      subtitle: `${m.sender.name} · ${fmtDate(m.createdAt)}${m.urgent ? " · urgent" : ""}`,
      at: m.createdAt.getTime(),
      href: `/messages/${m.conversationId}`,
    });
  }
  for (const t of texts) {
    push("text", `sms:${t.id}`, [f("Text", t.body, 1, true), f("Sent by", t.sentBy?.name, 0.5)], {
      title: `Text to patient`,
      subtitle: `${fmtDate(t.createdAt)}${t.sentBy ? ` · ${t.sentBy.name}` : " · automatic"}`,
      at: t.createdAt.getTime(),
      href: `${base}/texts`,
      status: t.status === "sent" ? undefined : t.status === "logged" ? "Not sent" : sentence(t.status),
    });
  }
  return items;
}

export async function searchChart(patientId: string, user: SessionUser, query: string, opts: { limit?: number; kind?: HitKind } = {}): Promise<SearchResult> {
  const started = Date.now();
  const q = query.trim().slice(0, 200);
  if (!q) return { query: q, hits: [], total: 0, counts: {}, partial: false, ms: 0 };
  const items = await gatherChart(patientId, user);
  const byKey = new Map(items.map((i) => [i.doc.key, i.hit]));
  const { matches, partial } = searchDocs(q, items.map((i) => i.doc));
  const counts: Partial<Record<HitKind, number>> = {};
  const hits: SearchHit[] = [];
  for (const m of matches) {
    const hit = byKey.get(m.key)!;
    counts[hit.kind] = (counts[hit.kind] ?? 0) + 1;
    if (opts.kind && hit.kind !== opts.kind) continue;
    if (hits.length >= (opts.limit ?? 200)) continue;
    // Point lists link straight to their source too, highlighted.
    const series = hit.series && { ...hit.series, points: hit.series.points.map((p) => ({ ...p, href: withHighlight(p.href, m.terms) })) };
    hits.push({ ...hit, series, href: withHighlight(hit.href, m.terms), snippet: m.snippet });
  }
  return { query: q, hits, total: matches.length, counts, partial, ms: Date.now() - started };
}

