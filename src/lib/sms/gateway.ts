// The SMS gateway: a Bangladesh bulk-SMS provider, chosen and configured on the server.
//
//   MERIDIAN_SMS_PROVIDER   bulksmsbd or sslwireless. Unset: texts are written to the
//                           chart's Texts tab and the SMS log but not sent.
//   MERIDIAN_SMS_API_KEY    The account's API key (BulkSMSBD) or API token (SSL Wireless).
//   MERIDIAN_SMS_SENDER_ID  The approved sender ID or masking name (BulkSMSBD), or the SID (SSL Wireless).
//   MERIDIAN_SMS_API_URL    Optional: a different send URL, if the provider gives you one.

export type Provider = "bulksmsbd" | "sslwireless";
export type GatewayConfig = { provider: Provider; apiKey: string; senderId: string; url: string } | null;
export type SendResult = { ok: true; ref: string | null } | { ok: false; error: string };

const URLS: Record<Provider, string> = {
  bulksmsbd: "https://bulksmsbd.net/api/smsapi",
  sslwireless: "https://smsplus.sslwireless.com/api/v3/send-sms",
};

export function gatewayConfig(env: Record<string, string | undefined> = process.env): GatewayConfig {
  const provider = env.MERIDIAN_SMS_PROVIDER?.trim().toLowerCase();
  if (provider !== "bulksmsbd" && provider !== "sslwireless") return null;
  const apiKey = env.MERIDIAN_SMS_API_KEY?.trim() ?? "";
  const senderId = env.MERIDIAN_SMS_SENDER_ID?.trim() ?? "";
  if (!apiKey || !senderId) return null;
  // https only, so the key never crosses the internet in the clear (plain http to this machine is for testing).
  const custom = env.MERIDIAN_SMS_API_URL?.trim() ?? "";
  const url = /^https:\/\/|^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(custom) ? custom : URLS[provider];
  return { provider, apiKey, senderId, url };
}

// Why texts aren't going out, for the screens that show the SMS log. Null when they are.
export function gatewayProblem(env: Record<string, string | undefined> = process.env): string | null {
  const provider = env.MERIDIAN_SMS_PROVIDER?.trim();
  if (!provider) return "Texts aren't being sent yet: no SMS gateway is set up. They're kept here so you can see what patients would get.";
  if (!gatewayConfig(env)) {
    return `Texts aren't being sent: the SMS gateway settings are incomplete (${provider} needs MERIDIAN_SMS_API_KEY and MERIDIAN_SMS_SENDER_ID, and the provider must be bulksmsbd or sslwireless).`;
  }
  return null;
}

type Fetch = typeof fetch;

const asObject = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

// Sends one text. `id` is our message id, which SSL Wireless asks for (unique, at most 20 characters).
export async function sendSms(cfg: NonNullable<GatewayConfig>, to: string, text: string, id: string, fetchImpl: Fetch = fetch): Promise<SendResult> {
  try {
    if (cfg.provider === "bulksmsbd") {
      const res = await fetchImpl(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ api_key: cfg.apiKey, type: "text", number: to, senderid: cfg.senderId, message: text }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = asObject(await res.json().catch(() => null));
      // 202 is "SMS submitted"; anything else is an error code with a message.
      if (Number(body.response_code) === 202) return { ok: true, ref: body.message_id != null ? String(body.message_id) : null };
      return { ok: false, error: `BulkSMSBD ${body.response_code ?? res.status}: ${String(body.error_message || body.success_message || res.statusText || "no reply")}` };
    }
    const res = await fetchImpl(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ api_token: cfg.apiKey, sid: cfg.senderId, msisdn: to, sms: text, csms_id: id.slice(-20) }),
      signal: AbortSignal.timeout(15_000),
    });
    const body = asObject(await res.json().catch(() => null));
    const info = asObject(Array.isArray(body.smsinfo) ? body.smsinfo[0] : null);
    if (body.status === "SUCCESS" && (info.sms_status ?? "SUCCESS") === "SUCCESS") return { ok: true, ref: info.reference_id != null ? String(info.reference_id) : null };
    return { ok: false, error: `SSL Wireless ${body.status_code ?? res.status}: ${String(body.error_message || info.status_message || res.statusText || "no reply")}` };
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    return { ok: false, error: timedOut ? "The SMS gateway didn't answer in 15 seconds." : `Couldn't reach the SMS gateway: ${e instanceof Error ? e.message : String(e)}` };
  }
}
