"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { applyCommands, isUndo, joinPiece } from "@/lib/dictation/commands";

// Dictation into any text box, in English or Bangla, on the full site and the phone view.
// Click into a box and a microphone appears in its corner (or press F9 / Ctrl+Shift+Space).
// Two engines (docs/DICTATION.md):
// - "browser" (free, the default): the browser's own speech recognition (Chrome, Edge,
//   Safari), which types each phrase as it is recognized.
// - "server": when a speech key is set on the server. Speech is recorded in pieces, cut at
//   each pause; each piece goes to /api/dictation and its text is typed in at the cursor, in
//   order, while the next piece is being recorded.
// Saying "new line", "full stop", "নতুন লাইন" or "দাঁড়ি" types those; "scratch that" or
// "মুছে ফেলো" removes the last piece. Nothing is recorded until the microphone is pressed.

type Field = HTMLTextAreaElement | HTMLInputElement;
type Lang = "auto" | "en" | "bn";
type Pos = { left: number; top: number; boxTop: number; boxBottom: number; viewBottom: number };

const LANGS: { id: Lang; label: string; title: string }[] = [
  { id: "auto", label: "Auto", title: "English, Bangla or both: the engine works out which" },
  { id: "en", label: "EN", title: "English" },
  { id: "bn", label: "বাংলা", title: "Bangla (medicine names still come out in English)" },
];
const LANG_KEY = "meridian_dictation_lang";
// The browser engine needs one language at a time. South Asian English suits the clinic's accent.
const BROWSER_LOCALE: Record<Lang, string> = { auto: "en-IN", en: "en-IN", bn: "bn-BD" };

export type DictationEngine = "browser" | "server";

// The browser's speech recognition, where it has one (not Firefox).
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Speech detection, in 50 ms steps.
const STEP_MS = 50;
const PAUSE_MS = 700; // a pause this long ends a piece
const MIN_SPEECH_MS = 250; // shorter than this is a cough or a click, not words
const MAX_PIECE_MS = 30_000; // cut a piece that never pauses
const IDLE_STOP_MS = 60_000; // stop listening after a minute of silence

const TEXT_INPUTS = new Set(["text", "search", ""]);

function dictatable(el: Element | null): el is Field {
  if (!el || (el as HTMLElement).closest("[data-dictation=off]")) return false;
  if (/username|one-time-code|password/.test(el.getAttribute("autocomplete") ?? "")) return false;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) return TEXT_INPUTS.has(el.getAttribute("type") ?? "") && !el.readOnly && !el.disabled;
  return false;
}

function patientInPath(): string | null {
  return window.location.pathname.match(/^\/(?:m\/)?patients\/([^/?#]+)/)?.[1] ?? null;
}

function recorderType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"].find((t) => MediaRecorder.isTypeSupported(t));
}

// Types text at the cursor the way a keyboard would, so the box's own change handling, undo
// and spellcheck all work.
function typeInto(el: Field, text: string): { start: number; text: string } | null {
  if (!el.isConnected) return null;
  if (document.activeElement !== el) el.focus({ preventScroll: true });
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  let piece = joinPiece(el.value.slice(0, start), text);
  if (el instanceof HTMLInputElement) piece = piece.replace(/\s*\n+\s*/g, " ");
  if (!document.execCommand("insertText", false, piece)) {
    el.setRangeText(piece, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return { start, text: piece };
}

function removeTyped(el: Field, last: { start: number; text: string }): boolean {
  if (!el.isConnected || el.value.slice(last.start, last.start + last.text.length) !== last.text) return false;
  el.focus({ preventScroll: true });
  el.setSelectionRange(last.start, last.start + last.text.length);
  if (!document.execCommand("delete")) {
    el.setRangeText("", last.start, last.start + last.text.length, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return true;
}

export function Dictation({ engine: wanted }: { engine: DictationEngine }) {
  // Without a speech key, and in a browser with no speech recognition, there's no microphone.
  const [engine, setEngine] = useState<DictationEngine | null>(wanted === "server" ? "server" : null);
  const [field, setField] = useState<Field | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const [pending, setPending] = useState(0);
  const [lang, setLang] = useState<Lang>("auto");
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);
  const [interim, setInterim] = useState("");

  // Live recording state, kept out of React so the 50 ms loop doesn't re-render.
  const rec = useRef<{
    stream: MediaStream;
    ctx: AudioContext;
    analyser: AnalyserNode;
    recorder: MediaRecorder | null;
    timer: number;
    began: number;
    pieceStart: number;
    speechMs: number;
    lastVoice: number;
    floor: number;
    first: boolean;
    target: Field;
  } | null>(null);
  const seq = useRef(0);
  const queue = useRef<{ n: number; target: Field; done: boolean; text?: string; undo?: boolean }[]>([]);
  const lastTyped = useRef<{ el: Field; start: number; text: string } | null>(null);
  const langRef = useRef<Lang>("auto");
  // The browser engine's live state.
  const sr = useRef<{ recognition: Recognition; target: Field; began: number; lastHeard: number; timer: number; stopping: boolean } | null>(null);
  const current = () => rec.current ?? sr.current;

  useEffect(() => {
    if (wanted === "browser" && recognitionClass()) setEngine("browser");
  }, [wanted]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY) as Lang | null;
      if (saved && LANGS.some((l) => l.id === saved)) {
        setLang(saved);
        langRef.current = saved;
      }
    } catch {}
    setPhone(window.matchMedia("(max-width: 640px)").matches || !!document.querySelector(".phone"));
  }, []);

  const chooseLang = (l: Lang) => {
    setLang(l);
    langRef.current = l;
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {}
    // The browser engine restarts in the new language (see onend).
    sr.current?.recognition.stop();
  };

  // Follow the text box that has the cursor.
  useEffect(() => {
    const onIn = (e: FocusEvent) => {
      if (!dictatable(e.target as Element)) return;
      setField(e.target as Field);
      // Moving to another box mid-dictation carries on in that box.
      const now = current();
      if (now) now.target = e.target as Field;
    };
    const onOut = () => {
      window.setTimeout(() => {
        const active = document.activeElement;
        if (dictatable(active)) setField(active);
        else if (!current()) setField(null);
      }, 150);
    };
    document.addEventListener("focusin", onIn);
    document.addEventListener("focusout", onOut);
    if (dictatable(document.activeElement)) setField(document.activeElement);
    return () => {
      document.removeEventListener("focusin", onIn);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  // Keep the microphone in the box's corner as the page scrolls or the box grows.
  const shown = field ?? (listening ? (current()?.target ?? null) : null);
  useEffect(() => {
    if (!shown) {
      setPos(null);
      return;
    }
    let frame = 0;
    let lastKey = "";
    const place = () => {
      if (!shown.isConnected) {
        setPos(null);
      } else {
        const r = shown.getBoundingClientRect();
        const vv = window.visualViewport;
        const viewBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
        const size = 28;
        const tall = shown instanceof HTMLTextAreaElement && r.height > 44;
        // Inside the box's corner, clear of its scrollbar.
        const scrollbar = shown.offsetWidth - shown.clientWidth;
        const left = Math.round(Math.min(r.right - scrollbar - size - 4, window.innerWidth - size - 6));
        const top = Math.round(tall ? Math.min(r.bottom, viewBottom - 6) - size - 4 : r.top + (r.height - size) / 2);
        const offscreen = r.bottom < 0 || r.top > viewBottom || r.width === 0;
        const boxTop = Math.round(r.top);
        const boxBottom = Math.round(Math.min(r.bottom, viewBottom));
        const key = offscreen ? "off" : `${left},${top},${boxTop},${boxBottom},${Math.round(viewBottom)}`;
        if (key !== lastKey) {
          lastKey = key;
          setPos(offscreen ? null : { left, top, boxTop, boxBottom, viewBottom: Math.round(viewBottom) });
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [shown]);

  // Type in finished pieces in the order they were spoken.
  const flush = useCallback(() => {
    const q = queue.current;
    while (q.length && q[0].done) {
      const item = q.shift()!;
      if (item.undo) {
        const last = lastTyped.current;
        if (last && removeTyped(last.el, last)) lastTyped.current = null;
        continue;
      }
      if (!item.text) continue;
      const typed = typeInto(item.target, item.text);
      if (typed) lastTyped.current = { el: item.target, ...typed };
      else setLost((l) => (l ? `${l} ${item.text}` : item.text!));
    }
    setPending(q.length);
  }, []);

  const send = useCallback(
    async (audio: Blob, target: Field, first: boolean) => {
      const n = ++seq.current;
      queue.current.push({ n, target, done: false });
      setPending(queue.current.length);
      const item = () => queue.current.find((q) => q.n === n);
      const form = new FormData();
      form.set("audio", audio);
      form.set("language", langRef.current);
      form.set("before", target.value.slice(Math.max(0, (target.selectionStart ?? target.value.length) - 300), target.selectionStart ?? target.value.length));
      const patientId = patientInPath();
      if (patientId) form.set("patientId", patientId);
      if (first) form.set("first", "1");
      try {
        const res = await fetch("/api/dictation", { method: "POST", body: form });
        const json = (await res.json().catch(() => ({}))) as { text?: string; undo?: boolean; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Dictation failed. Try again.");
        const it = item();
        if (it) Object.assign(it, { done: true, text: json.text, undo: json.undo });
      } catch (e) {
        setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Couldn't reach the server. Check the connection.");
        const it = item();
        if (it) it.done = true;
      }
      flush();
    },
    [flush],
  );

  const startPiece = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    const type = recorderType();
    const recorder = new MediaRecorder(r.stream, type ? { mimeType: type } : undefined);
    const chunks: Blob[] = [];
    const startedAt = Date.now();
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = () => {
      const spoke = (recorder as MediaRecorder & { spoke?: boolean }).spoke;
      if (!spoke || !chunks.length) return;
      const first = r.first;
      r.first = false;
      void send(new Blob(chunks, { type: recorder.mimeType || type || "audio/webm" }), r.target, first);
    };
    recorder.start();
    Object.assign(r, { recorder, pieceStart: startedAt, speechMs: 0 });
  }, [send]);

  // Ends the current piece; it is sent only if it had speech in it.
  const endPiece = useCallback((keep: boolean) => {
    const r = rec.current;
    const recorder = r?.recorder;
    if (!r || !recorder || recorder.state === "inactive") return;
    (recorder as MediaRecorder & { spoke?: boolean }).spoke = keep && r.speechMs >= MIN_SPEECH_MS;
    recorder.stop();
    r.recorder = null;
  }, []);

  const stop = useCallback(() => {
    const r = rec.current;
    if (!r) return;
    endPiece(true);
    window.clearInterval(r.timer);
    r.stream.getTracks().forEach((t) => t.stop());
    void r.ctx.close();
    rec.current = null;
    setListening(false);
    setSpeaking(false);
    setLevel(0);
  }, [endPiece]);

  const start = useCallback(async (target: Field | null = field) => {
    if (!target || rec.current || starting) return;
    setError(null);
    setLost(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser can't record. Use a recent Chrome, Edge, Safari or Firefox.");
      return;
    }
    setStarting(true);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      setStarting(false);
      const denied = e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
      setError(denied ? "The microphone is blocked. Allow it for this site in the browser (the icon by the address), then try again." : "No microphone was found.");
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const now = Date.now();
    rec.current = { stream, ctx, analyser, recorder: null, timer: 0, began: now, pieceStart: now, speechMs: 0, lastVoice: now, floor: 0.004, first: true, target };
    startPiece();
    let shownLevel = 0;
    rec.current.timer = window.setInterval(() => {
      const r = rec.current;
      if (!r) return;
      r.analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      const rms = Math.sqrt(sum / samples.length);
      const threshold = Math.max(0.012, r.floor * 2.5);
      const t = Date.now();
      const voiced = rms > threshold;
      if (voiced) {
        r.speechMs += STEP_MS;
        r.lastVoice = t;
      } else {
        // The room's background noise, learned while nobody speaks.
        r.floor = r.floor * 0.97 + rms * 0.03;
      }
      const lvl = Math.min(1, rms / 0.12);
      if (Math.abs(lvl - shownLevel) > 0.04) {
        shownLevel = lvl;
        setLevel(lvl);
      }
      setSpeaking(t - r.lastVoice < 300);
      setSeconds(Math.floor((t - r.began) / 1000));
      const pieceMs = t - r.pieceStart;
      if (r.speechMs >= MIN_SPEECH_MS && t - r.lastVoice >= PAUSE_MS) {
        endPiece(true);
        startPiece();
      } else if (pieceMs >= MAX_PIECE_MS) {
        endPiece(true);
        startPiece();
      } else if (r.speechMs < MIN_SPEECH_MS && pieceMs >= 8000) {
        // Silence or a stray noise: throw it away rather than send it.
        endPiece(false);
        startPiece();
      }
      if (t - r.lastVoice >= IDLE_STOP_MS) stop();
    }, STEP_MS);
    setStarting(false);
    setListening(true);
  }, [field, starting, startPiece, endPiece, stop]);

  // The free engine: the browser recognizes speech itself and hands back each phrase.
  const stopBrowser = useCallback(() => {
    const s = sr.current;
    if (!s) return;
    s.stopping = true;
    window.clearInterval(s.timer);
    s.recognition.stop();
    sr.current = null;
    setListening(false);
    setSpeaking(false);
    setInterim("");
  }, []);

  const startBrowser = useCallback(
    (target: Field | null = field) => {
      const Recognition = recognitionClass();
      if (!target || !Recognition || current()) return;
      setError(null);
      setLost(null);
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = BROWSER_LOCALE[langRef.current];
      const now = Date.now();
      const s = { recognition, target, began: now, lastHeard: now, timer: 0, stopping: false };
      recognition.onresult = (e) => {
        let live = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const result = e.results[i];
          const said = result[0].transcript.trim();
          if (!result.isFinal) {
            live += ` ${said}`;
            continue;
          }
          if (!said) continue;
          const undo = isUndo(said);
          queue.current.push({ n: ++seq.current, target: s.target, done: true, undo, text: undo ? undefined : applyCommands(said) });
        }
        s.lastHeard = Date.now();
        setInterim(live.trim());
        setSpeaking(!!live.trim());
        flush();
      };
      recognition.onerror = (e) => {
        if (e.error === "no-speech" || e.error === "aborted") return;
        const message =
          e.error === "not-allowed" || e.error === "service-not-allowed"
            ? "The microphone is blocked. Allow it for this site in the browser (the icon by the address), then try again."
            : e.error === "network"
              ? "The browser's speech service couldn't be reached. Check the internet connection."
              : e.error === "language-not-supported"
                ? "This browser can't recognize that language. Try Chrome, or switch language."
                : "Speech recognition stopped. Press the microphone to start again.";
        setError(message);
        stopBrowser();
      };
      // The browser ends recognition on its own after a silence; carry on until Stop is pressed.
      recognition.onend = () => {
        if (sr.current !== s || s.stopping) return;
        recognition.lang = BROWSER_LOCALE[langRef.current];
        try {
          recognition.start();
        } catch {
          stopBrowser();
        }
      };
      try {
        recognition.start();
      } catch {
        setError("Speech recognition couldn't start. Try again.");
        return;
      }
      sr.current = s;
      s.timer = window.setInterval(() => {
        const t = Date.now();
        setSeconds(Math.floor((t - s.began) / 1000));
        if (t - s.lastHeard >= IDLE_STOP_MS) stopBrowser();
      }, 1000);
      setSeconds(0);
      setListening(true);
      // One access-log line per dictation, like the server engine (no words, no audio).
      const form = new FormData();
      form.set("log", "browser");
      form.set("language", langRef.current === "bn" ? "bn" : "en");
      const patientId = patientInPath();
      if (patientId) form.set("patientId", patientId);
      void fetch("/api/dictation", { method: "POST", body: form }).catch(() => {});
    },
    [field, flush, stopBrowser],
  );

  const toggle = useCallback(
    (target?: Field) => {
      if (rec.current) stop();
      else if (sr.current) stopBrowser();
      else if (engine === "browser") startBrowser(target);
      else void start(target);
    },
    [engine, start, stop, startBrowser, stopBrowser],
  );

  // F9 or Ctrl+Shift+Space starts and stops dictation in the box with the cursor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const hit = e.key === "F9" || (e.ctrlKey && e.shiftKey && e.code === "Space");
      if (!hit || !engine || (!current() && !dictatable(document.activeElement))) return;
      e.preventDefault();
      const active = document.activeElement;
      toggle(dictatable(active) ? active : undefined);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, engine]);

  // Stop recording if the page goes away mid-dictation.
  useEffect(
    () => () => {
      stop();
      stopBrowser();
    },
    [stop, stopBrowser],
  );

  // Clicks on the controls must not take the cursor out of the text box.
  const keepFocus = (e: React.MouseEvent | React.PointerEvent) => e.preventDefault();
  const busy = listening || starting;
  const showPanel = busy || pending > 0 || !!error || !!lost;
  // The browser engine takes one language at a time; Auto is for the server engines.
  const langs = engine === "browser" ? LANGS.filter((l) => l.id !== "auto") : LANGS;
  const shownLang = engine === "browser" && lang === "auto" ? "en" : lang;
  if (!engine) return null;

  return (
    <>
      {pos && (
        <button
          type="button"
          data-dictation="off"
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          onClick={() => toggle()}
          title={busy ? "Stop dictation (F9)" : "Dictate in English or Bangla (F9)"}
          aria-label={busy ? "Stop dictation" : "Dictate"}
          aria-pressed={busy}
          style={{ left: pos.left, top: pos.top }}
          className={`fixed z-50 flex size-7 items-center justify-center rounded-full border shadow-sm transition-colors print:hidden ${
            busy ? "border-crit bg-crit text-white" : "border-line bg-panel/90 text-ink-3 hover:border-accent hover:text-accent"
          }`}
        >
          {busy && <span className="absolute inset-0 animate-ping rounded-full bg-crit/40" style={{ animationDuration: "1.6s" }} />}
          <MicIcon />
        </button>
      )}
      {showPanel && (
        <div
          data-dictation="off"
          role="status"
          onPointerDown={keepFocus}
          onMouseDown={keepFocus}
          style={panelPlace(pos)}
          className="fixed z-50 flex w-max max-w-[min(560px,calc(100vw-16px))] flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-panel px-3 py-2 text-[12.5px] text-ink shadow-lg print:hidden"
        >
          {busy && (
            <>
              <span className="flex items-center gap-2 font-medium">
                <span className={`size-2 rounded-full ${speaking ? "bg-crit" : "bg-crit/40"}`} />
                {starting ? "Starting…" : speaking ? "Listening" : "Listening (paused)"}
                <span className="tabular-nums text-ink-3">
                  {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}
                </span>
              </span>
              {engine === "server" && (
              <span className="flex h-4 items-end gap-[2px]" aria-hidden>
                {[0.25, 0.5, 0.75, 1, 0.75].map((f, i) => (
                  <span key={i} className="w-[3px] rounded-sm bg-accent transition-[height] duration-75" style={{ height: `${Math.max(15, Math.min(100, level * 140 * f))}%` }} />
                ))}
              </span>
              )}
            </>
          )}
          {pending > 0 && <span className="text-ink-3">Writing…</span>}
          <span className="flex overflow-hidden rounded border border-line" role="group" aria-label="Dictation language">
            {langs.map((l) => (
              <button
                key={l.id}
                type="button"
                title={l.title}
                aria-pressed={shownLang === l.id}
                onClick={() => chooseLang(l.id)}
                className={`px-2 py-0.5 text-[12px] ${shownLang === l.id ? "bg-accent text-white" : "hover:bg-panel-muted"}`}
              >
                {l.label}
              </button>
            ))}
          </span>
          {busy ? (
            <button type="button" onClick={() => toggle()} className="rounded bg-crit px-2.5 py-0.5 font-medium text-white hover:opacity-90">
              Stop
            </button>
          ) : (
            <button type="button" onClick={() => { setError(null); setLost(null); }} className="rounded px-1.5 text-ink-3 hover:text-ink" aria-label="Close">
              ✕
            </button>
          )}
          {busy && engine === "browser" && interim && <span className="basis-full max-w-full truncate text-ink-2 italic">{interim}</span>}
          {error && <span className="basis-full text-crit">{error}</span>}
          {lost && (
            <span className="basis-full">
              The box closed before this was typed in:{" "}
              <button type="button" className="text-accent underline" onClick={() => void navigator.clipboard?.writeText(lost)}>
                copy it
              </button>
              <span className="mt-1 block max-h-24 overflow-auto whitespace-pre-wrap rounded bg-panel-muted p-1.5 text-ink-2">{lost}</span>
            </span>
          )}
          {busy && !phone && <span className="basis-full text-[11.5px] text-ink-3">{engine === "browser" ? "Words appear as each phrase is recognized." : "Pause to see words appear."} Say “new line”, “full stop”, “scratch that” (or নতুন লাইন, দাঁড়ি, মুছে ফেলো). F9 to stop.</span>}
        </div>
      )}
    </>
  );
}

// The panel sits just under the text box, or above it, right edges lined up with the
// microphone, so it stays by the words being dictated without covering them. A box that
// fills the screen gets it just above the microphone.
const PANEL_ROOM = 90;
function panelPlace(pos: Pos | null): React.CSSProperties {
  if (!pos) return { left: "50%", bottom: 16, transform: "translateX(-50%)" };
  const right = Math.max(8, window.innerWidth - (pos.left + 32));
  if (pos.viewBottom - pos.boxBottom > PANEL_ROOM) return { right, top: pos.boxBottom + 6 };
  if (pos.boxTop > PANEL_ROOM + 50) return { right, bottom: window.innerHeight - pos.boxTop + 6 };
  return { right, bottom: window.innerHeight - pos.top + 8 };
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="relative size-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
