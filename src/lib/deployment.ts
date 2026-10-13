// How this copy of Meridian is running, from the environment. See docs/DEPLOY.md.

// Demo mode: the synthetic seed's accounts are listed on the sign-in page. Always on
// in development; a production build only with MERIDIAN_DEMO_ACCOUNTS=1 (a public demo).
export const demoMode = process.env.NODE_ENV !== "production" || process.env.MERIDIAN_DEMO_ACCOUNTS === "1";

// Set only once the go-live checklist in docs/GO-LIVE.md is done (privacy law, signed
// agreements with the host and Anthropic, audit log, backups, MFA). Until then every
// screen says the system is not for real patient information.
export const clearedForRealPatients = process.env.MERIDIAN_CLEARED_FOR_REAL_PATIENTS === "1";

// The notice on the sign-in page and the label in the top bar.
export const dataNotice = demoMode
  ? { label: "Synthetic data", text: "Synthetic data only. Do not enter real patient information." }
  : clearedForRealPatients
    ? null
    : { label: "Not for real patients", text: "This system is not yet approved for real patient information. Use test patients only." };
