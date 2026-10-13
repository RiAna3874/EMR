import { redirect } from "next/navigation";
import { currentChallenge, getCurrentUser } from "@/lib/session";
import { VerifyForm } from "./verify-form";

export const metadata = { title: "Two-step sign-in · Meridian EMR" };
export const dynamic = "force-dynamic";

// Second step of sign-in: the code from the person's authenticator app.
export default async function VerifyPage() {
  if (await getCurrentUser()) redirect("/");
  const challenge = await currentChallenge();
  if (!challenge) redirect("/login?expired=1");
  return (
    <main className="flex h-full items-center justify-center overflow-y-auto bg-chrome p-4">
      <div className="w-full max-w-sm">
        <div className="mb-5 text-center text-lg font-semibold tracking-wide text-white">Meridian</div>
        <VerifyForm name={challenge.practitioner.name} />
      </div>
    </main>
  );
}
