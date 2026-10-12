"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { isValidPhraseName, normalizePhraseName } from "@/lib/notes/smarttext";

export async function savePhrase(phraseId: string | null, form: FormData) {
  const name = normalizePhraseName(String(form.get("name") ?? ""));
  const description = String(form.get("description") ?? "").trim();
  const body = String(form.get("body") ?? "").replace(/\s+$/, "");
  const back = (error: string) => redirect(`/phrases?${phraseId ? `edit=${phraseId}&` : "new=1&"}error=${encodeURIComponent(error)}`);
  if (!isValidPhraseName(name)) back("Names start with a letter and use 2 to 31 letters, digits or underscores.");
  if (!body.trim()) back("The phrase needs some text.");
  const clash = await db.smartPhrase.findFirst({ where: { ownerId: currentUser.id, name, id: phraseId ? { not: phraseId } : undefined } });
  if (clash) back(`You already have a phrase called .${name}.`);

  const saved = phraseId
    ? await db.smartPhrase.update({ where: { id: phraseId, ownerId: currentUser.id }, data: { name, description, body } })
    : await db.smartPhrase.create({ data: { ownerId: currentUser.id, name, description, body } });
  revalidatePath("/phrases");
  redirect(`/phrases?edit=${saved.id}&saved=1`);
}

export async function deletePhrase(phraseId: string) {
  await db.smartPhrase.delete({ where: { id: phraseId, ownerId: currentUser.id } });
  revalidatePath("/phrases");
  redirect("/phrases");
}
