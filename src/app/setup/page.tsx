import { redirect } from "next/navigation";
import { needsSetup, setupTokenConfigured, setupTokenRequired } from "@/lib/setup";
import { SetupForm } from "./setup-form";

export const metadata = { title: "Set up · Meridian EMR" };
export const dynamic = "force-dynamic";

// First run on an empty database: create the first administrator. Closed once any account exists.
export default async function Setup() {
  if (!(await needsSetup())) redirect("/login");
  return (
    <main className="flex h-full items-center justify-center overflow-y-auto bg-chrome p-4">
      <div className="w-full max-w-md">
        <h1 className="mb-4 text-center text-lg font-semibold tracking-wide text-white">Set up Meridian</h1>
        {setupTokenRequired && !setupTokenConfigured ? (
          <div className="rounded-md border border-line bg-panel p-5 text-[13px] shadow-lg">
            <p className="font-semibold">Setup is locked.</p>
            <p className="mt-2 text-ink-2">
              Set <code className="font-mono">MERIDIAN_SETUP_TOKEN</code> on the server to a long random value (at least 16 characters), restart the app,
              and enter it here. See docs/DEPLOY.md.
            </p>
          </div>
        ) : (
          <SetupForm askToken={setupTokenRequired} />
        )}
      </div>
    </main>
  );
}
