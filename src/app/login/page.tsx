import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, safeNext } from "@/lib/session";
import { roleLabel } from "@/lib/roles";
import { dataNotice, demoMode } from "@/lib/deployment";
import { needsSetup } from "@/lib/setup";
import { SignInForm } from "./sign-in-form";
import { brand } from "@/lib/brand";
import { BrandMark } from "@/components/brand-mark";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; expired?: string }> }) {
  const { next, expired } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));
  // A brand-new, empty database: make the first administrator.
  if (await needsSetup()) redirect("/setup");
  // The synthetic seed's accounts are listed in demo mode only (src/lib/deployment.ts).
  const demo = demoMode
    ? (await db.practitioner.findMany({ where: { active: true, username: { not: null } }, orderBy: [{ role: "asc" }, { name: "asc" }] })).map((p) => ({
        username: p.username!,
        name: p.credentials ? `${p.name}, ${p.credentials}` : p.name,
        role: roleLabel[p.role],
      }))
    : [];

  return (
    <main className="flex h-full items-center justify-center overflow-y-auto bg-chrome p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center justify-center gap-2 text-white">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-wide">
            <BrandMark name={brand.shortName} logoUrl={brand.logoUrl} size={26} />
          </span>
        </div>
        {expired && (
          <p role="alert" className="mb-3 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            {expired === "tries" ? "Too many wrong codes. Sign in again with your password." : "Two-step sign-in timed out. Sign in again."}
          </p>
        )}
        <SignInForm next={safeNext(next)} demo={demo} />
        {dataNotice && <p className="mt-4 text-center text-[11.5px] text-white/60">{dataNotice.text}</p>}
      </div>
    </main>
  );
}
