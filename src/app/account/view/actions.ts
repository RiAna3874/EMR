"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { DEFAULT_PREFS, readPrefs, withHidden, type ViewPrefs } from "@/lib/view-prefs";

async function save(change: (prefs: ViewPrefs) => ViewPrefs) {
  const user = await requireUser();
  const me = await db.practitioner.findUniqueOrThrow({ where: { id: user.id }, select: { viewPrefs: true } });
  const next = change(readPrefs(me.viewPrefs));
  await db.practitioner.update({ where: { id: user.id }, data: { viewPrefs: next } });
  // Every screen reads these, so refresh them all.
  revalidatePath("/", "layout");
}

export async function setHidden(keys: string[], hidden: boolean) {
  await save((p) => withHidden(p, keys, hidden));
}

export async function setHover(on: boolean) {
  await save((p) => ({ ...p, hover: on }));
}

// Everything back on: one area's items, or the lot.
export async function resetView(keys?: string[]) {
  await save((p) => (keys ? withHidden(p, keys, false) : DEFAULT_PREFS));
}
