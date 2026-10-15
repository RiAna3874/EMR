"use server";

import { revalidatePath } from "next/cache";
import { baseDb } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { startImport } from "@/lib/meds/dgda-server";

export async function refreshDrugList() {
  const user = await requireAdmin();
  await startImport(baseDb, user.name);
  revalidatePath("/admin/drugs");
}
