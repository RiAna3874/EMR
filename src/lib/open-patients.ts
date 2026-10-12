"use client";

// Open patient tabs live in localStorage so they survive reloads, the way a
// clinician keeps several charts open through a clinic session.
export type OpenPatient = { id: string; label: string; lastPath: string };

const KEY = "meridian.openPatients";
const EVENT = "meridian:open-patients";
const MAX_OPEN = 8;

let cache: { raw: string | null; list: OpenPatient[] } = { raw: null, list: [] };

export function readOpenPatients(): OpenPatient[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return cache.list;
  }
  if (raw === cache.raw) return cache.list;
  let list: OpenPatient[] = [];
  try {
    list = raw ? (JSON.parse(raw) as OpenPatient[]) : [];
  } catch {
    list = [];
  }
  cache = { raw, list };
  return list;
}

function write(list: OpenPatient[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Storage unavailable (private mode); tabs just won't persist.
  }
  window.dispatchEvent(new Event(EVENT));
}

export function touchOpenPatient(p: OpenPatient) {
  const list = readOpenPatients();
  const existing = list.find((x) => x.id === p.id);
  if (existing && existing.label === p.label && existing.lastPath === p.lastPath) return;
  const next = existing ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p].slice(-MAX_OPEN);
  write(next);
}

export function closeOpenPatient(id: string) {
  write(readOpenPatients().filter((x) => x.id !== id));
}

export function subscribeOpenPatients(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// Charts open for one user shouldn't greet the next one at a shared workstation.
export function clearOpenPatients() {
  write([]);
}
