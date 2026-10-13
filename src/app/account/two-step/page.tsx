import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { displayName } from "@/lib/roles";
import { twoStepRequired } from "@/lib/deployment";
import { fmtDateTime } from "@/lib/format";
import { groupSecret, newTotpSecret, otpauthUri } from "@/lib/totp";
import { ManageTwoStep, SetUpTwoStep } from "./two-step-forms";

export const metadata = { title: "Two-step sign-in · Meridian EMR" };
export const dynamic = "force-dynamic";

export default async function TwoStep() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/account/password");
  const row = await db.practitioner.findUniqueOrThrow({ where: { id: user.id } });

  let setup: { qr: string; secret: string } | null = null;
  if (!row.totpEnabledAt) {
    // A new secret each time setup starts; it only counts once the first code is confirmed.
    const secret = row.totpPendingSecret ?? newTotpSecret();
    if (!row.totpPendingSecret) await db.practitioner.update({ where: { id: user.id }, data: { totpPendingSecret: secret } });
    const qr = await QRCode.toString(otpauthUri(secret, user.username), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    setup = { qr, secret: groupSecret(secret) };
  }

  return (
    <div className="h-full overflow-y-auto bg-bg">
      <div className="mx-auto max-w-xl px-6 py-8">
        <h1 className="text-[16px] font-semibold">Two-step sign-in</h1>
        <p className="mb-4 text-[12.5px] text-ink-2">
          {displayName(user)} · {user.username}
        </p>
        {setup ? (
          <>
            {twoStepRequired && (
              <p role="alert" className="mb-4 rounded-md border border-warn/30 bg-warn-soft px-3 py-2 text-warn">
                This site holds patient records, so every account signs in with a password and a code from a phone. Set it up once to continue.
              </p>
            )}
            <SetUpTwoStep qr={setup.qr} secret={setup.secret} />
          </>
        ) : (
          <ManageTwoStep since={fmtDateTime(row.totpEnabledAt!)} codesLeft={row.recoveryCodes.length} canTurnOff={!twoStepRequired} />
        )}
      </div>
    </div>
  );
}
