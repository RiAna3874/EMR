import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser, safeNext } from "@/lib/session";
import { roleLabel } from "@/lib/roles";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · Meridian EMR" };

// Demo accounts are listed in development, or when MERIDIAN_DEMO_ACCOUNTS=1.
const showDemo = process.env.NODE_ENV !== "production" || process.env.MERIDIAN_DEMO_ACCOUNTS === "1";

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(next));
  const demo = showDemo
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
          <svg width="26" height="26" viewBox="0 0 20 20" aria-hidden>
            <circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.6" />
            <path d="M10 1.5v17" stroke="#5eead4" strokeWidth="2" />
            <path d="M4 10h3l1.5-3 2.5 6 1.5-3H16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="text-lg font-semibold tracking-wide">Meridian</span>
        </div>
        <SignInForm next={safeNext(next)} demo={demo} />
        <p className="mt-4 text-center text-[11.5px] text-white/60">Synthetic data only. Do not enter real patient information.</p>
      </div>
    </main>
  );
}
