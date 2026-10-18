import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getActiveUser } from "@/lib/session";
import { can } from "@/lib/roles";
import { logEvent } from "@/lib/audit/server";
import { dictationEngine, dictationReady, DictationError, transcribe, type DictationLanguage } from "@/lib/dictation/engine";
import { polish, polishEnabled } from "@/lib/dictation/polish";
import { applyCommands, isUndo } from "@/lib/dictation/commands";
import { keyTerms, spokenDrug } from "@/lib/dictation/vocab";

// Dictation: one piece of recorded speech in, text out. The audio is read into memory, sent
// to the speech engine and dropped; nothing is stored here. See docs/DICTATION.md.

// About ten minutes of compressed speech; a piece is cut at the first pause, so real ones are far smaller.
const MAX_BYTES = 10 * 1024 * 1024;

export async function GET() {
  if (!(await getActiveUser())) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ ready: dictationReady() });
}

export async function POST(req: NextRequest) {
  const user = await getActiveUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "No recording was received." }, { status: 400 });
  }
  // The free browser engine recognizes speech in the browser; it only reports here for the access log.
  if (form.get("log") === "browser") {
    await logEvent({
      action: "dictate",
      subject: "Dictation",
      actor: { id: user.id, username: user.username },
      patientId: String(form.get("patientId") ?? "").slice(0, 40) || null,
      detail: `Browser speech recognition, ${form.get("language") === "bn" ? "Bangla" : "English"}`,
    });
    return NextResponse.json({ ok: true });
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) return NextResponse.json({ error: "No recording was received." }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "That recording is too long. Pause now and then while dictating." }, { status: 413 });
  const lang = String(form.get("language") ?? "auto");
  const language: DictationLanguage = lang === "en" || lang === "bn" ? lang : "auto";
  const before = String(form.get("before") ?? "").slice(-400);
  const patientId = String(form.get("patientId") ?? "").slice(0, 40) || null;

  const terms = keyTerms(patientId && can(user.role, "viewClinical") ? await patientTerms(patientId) : []);

  // One access-log line per dictation (not per pause), naming the patient whose chart was open.
  if (form.get("first") === "1") {
    const engine = dictationEngine();
    await logEvent({
      action: "dictate",
      subject: "Dictation",
      actor: { id: user.id, username: user.username },
      patientId,
      detail: `${engine?.label ?? "test text"}, ${language === "bn" ? "Bangla" : language === "en" ? "English" : "language detected"}`,
    });
  }

  try {
    const heard = await transcribe({ audio, language, before, terms });
    if (!heard.text) return NextResponse.json({ text: "" });
    if (isUndo(heard.text)) return NextResponse.json({ undo: true });
    const text = applyCommands(await polish(heard.text, { terms, before }));
    return NextResponse.json({ text, polished: polishEnabled() });
  } catch (e) {
    const message = e instanceof DictationError ? e.message : "Dictation failed. Try again.";
    if (!(e instanceof DictationError)) console.error("Dictation failed", e);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

// The open chart's medicines and problems, so they're spelled the way the chart has them.
async function patientTerms(patientId: string): Promise<string[]> {
  const [meds, problems] = await Promise.all([
    db.medicationRequest.findMany({ where: { patientId, status: { in: ["active", "on_hold"] } }, select: { drug: true }, take: 40 }),
    db.condition.findMany({ where: { patientId, status: "active" }, select: { display: true }, take: 30 }),
  ]);
  return [...meds.map((m) => spokenDrug(m.drug)), ...problems.map((p) => p.display)];
}
