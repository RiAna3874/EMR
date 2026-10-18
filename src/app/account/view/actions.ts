"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { DEFAULT_PREFS, readPrefs, TEXT_SIZES, withAreaReset, withHidden, withOrder, withWide, type ViewPrefs } from "@/lib/view-prefs";

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

// `keys` is the area's movable items in their new order.
export async function setOrder(area: string, keys: string[]) {
  await save((p) => withOrder(p, area, keys));
}

export async function setDrag(on: boolean) {
  await save((p) => ({ ...p, drag: on }));
}

export async function setWide(key: string, wide: boolean) {
  await save((p) => withWide(p, key, wide));
}

export async function setTextSize(size: number) {
  await save((p) => ((TEXT_SIZES as readonly number[]).includes(size) ? { ...p, textSize: size } : p));
}

export async function setStartTab(slug: string) {
  // readPrefs drops a tab that doesn't exist.
  await save((p) => readPrefs({ ...p, startTab: slug }));
}

// One area as it came: all shown, standard order, normal width.
export async function resetArea(area: string) {
  await save((p) => withAreaReset(p, area));
}

// Everything back on: one area's items, or the lot.
export async function resetView(keys?: string[]) {
  await save((p) => (keys ? withHidden(p, keys, false) : DEFAULT_PREFS));
}
