import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { DEFAULT_PREFS, readPrefs, type ViewPrefs } from "@/lib/view-prefs";

// The signed-in person's view options, read once per request.
export const getViewPrefs = cache(async (): Promise<ViewPrefs> => {
  const user = await getCurrentUser();
  if (!user) return DEFAULT_PREFS;
  const me = await db.practitioner.findUnique({ where: { id: user.id }, select: { viewPrefs: true } });
  return readPrefs(me?.viewPrefs);
});
