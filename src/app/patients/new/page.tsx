import Link from "next/link";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/session";
import { parseTypedDob } from "@/lib/format";
import { RegisterForm } from "./register-form";

export const dynamic = "force-dynamic";

// Prefill from a search that found nobody: "Hossain, Karim", "Karim Hossain" or "21/07/1984".
function prefill(q: string | undefined) {
  const out: Record<string, string> = {};
  const s = (q ?? "").trim();
  const dob = parseTypedDob(s);
  if (dob) out.dob = dob.toISOString().slice(0, 10);
  else if (s.includes(",")) [out.lastName, out.firstName] = s.split(",").map((x) => x.trim());
  else if (s && !/\d/.test(s)) {
    const words = s.split(/\s+/);
    if (words.length === 1) out.lastName = words[0];
    else [out.firstName, out.lastName] = [words.slice(0, -1).join(" "), words[words.length - 1]];
  }
  return out;
}

// New patient registration: legal name, date of birth and sex, how to reach them,
// an emergency contact, PCP and pharmacy, and coverage. The duplicate check runs
// as soon as name and date of birth are in, and again on save.
export default async function NewPatient({ searchParams }: { searchParams: Promise<{ q?: string; from?: string }> }) {
  const sp = await searchParams;
  await requirePermission("registerPatients");
  const [pcps, pharmacies] = await Promise.all([
    db.practitioner.findMany({ where: { role: "physician", active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, credentials: true } }),
    db.pharmacy.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, address: true } }),
  ]);
  const fromBook = sp.from === "book";

  return (
    <main className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl p-5">
        <div className="mb-3 flex items-baseline gap-3">
          <h1 className="text-xl font-semibold">Register new patient</h1>
          <Link href={fromBook ? "/schedule/book" : "/patients?list=all"} className="text-ink-3 hover:text-accent">
            {fromBook ? "Back to Make appointment" : "Back to patient lists"}
          </Link>
        </div>
        <p className="mb-4 text-ink-2">
          Search for the patient first: most people asking to be seen are already registered. Use the legal name and date of birth from their ID.
        </p>
        <RegisterForm
          initial={prefill(sp.q)}
          pcps={pcps.map((p) => ({ id: p.id, label: p.credentials ? `${p.name}, ${p.credentials}` : p.name }))}
          pharmacies={pharmacies.map((p) => ({ id: p.id, label: `${p.name} · ${p.address}` }))}
          returnTo={fromBook ? "book" : undefined}
        />
      </div>
    </main>
  );
}
