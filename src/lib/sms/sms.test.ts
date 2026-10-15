import { test } from "node:test";
import assert from "node:assert/strict";
import { doctorName, localNumber, manualText, refillApprovedText, signedOrdersText, smsLang, smsNumber, smsParts, type SignedItems } from "./sms";
import { gatewayConfig, gatewayProblem, sendSms } from "./gateway";

const none: SignedItems = { prescriber: "Dana Chen", meds: [], labs: [], imaging: [], referrals: [], procedures: [] };
const en = { lang: "en" as const, sender: "SAFIX" };
const bn = { lang: "bn" as const, sender: "SAFIX" };

test("texts go to Bangladeshi mobiles only, in the gateways' 880 form", () => {
  assert.equal(smsNumber("+880 1712-345678"), "8801712345678");
  assert.equal(smsNumber("01712345678"), "8801712345678");
  assert.equal(smsNumber("+880 2-9123456"), null);
  assert.equal(smsNumber(null), null);
  assert.equal(smsNumber("12345"), null);
  assert.equal(localNumber("8801712345678"), "01712-345678");
});

test("Bangla patients get Bangla texts; everyone else English", () => {
  assert.equal(smsLang("Bangla"), "bn");
  assert.equal(smsLang("English"), "en");
  assert.equal(smsLang("Urdu"), "en");
});

test("the doctor's title is added once", () => {
  assert.equal(doctorName("Dana Chen", "en"), "Dr. Dana Chen");
  assert.equal(doctorName("Dr. Dana Chen", "en"), "Dr. Dana Chen");
  assert.equal(doctorName("Dr Karim", "bn"), "ডা. Karim");
});

test("signed orders: counts by kind, never names a diagnosis or medicine unless asked", () => {
  const items: SignedItems = {
    ...none,
    meds: [{ drug: "Metformin 500 mg tablet", dose: "500 mg", frequency: "twice daily" }, { drug: "Napa 500 mg tablet" }],
    labs: [{ display: "Lipid panel", fasting: true }],
    imaging: ["X-ray chest"],
  };
  const text = signedOrdersText(items, { ...en, clinicPhone: "01712-000000" })!;
  assert.equal(
    text,
    "SAFIX: Dr. Dana Chen signed your prescription (2 medicines) and ordered 1 lab test and 1 X-ray or scan. Come fasting for the lab test (no food for 8-10 hours, water is fine). Questions: 01712-000000",
  );
  assert.ok(!/Metformin|Lipid/.test(text));
  const detailed = signedOrdersText(items, { ...en, details: true })!;
  assert.match(detailed, /Medicines: Metformin 500 mg tablet 500 mg twice daily; Napa 500 mg tablet\./);
  assert.match(detailed, /Tests: Lipid panel, X-ray chest\./);
});

test("prescription only, orders only, and nothing", () => {
  assert.equal(signedOrdersText({ ...none, meds: [{ drug: "Napa" }] }, en), "SAFIX: Dr. Dana Chen signed your prescription (1 medicine). Take it as written on the prescription.");
  assert.equal(signedOrdersText({ ...none, labs: [{ display: "CBC", fasting: false }, { display: "TSH", fasting: false }], referrals: ["Cardiology"] }, en), "SAFIX: Dr. Dana Chen ordered 2 lab tests and 1 referral for you.");
  assert.equal(signedOrdersText(none, en), null);
});

test("Bangla text uses Bangla numerals", () => {
  const text = signedOrdersText({ ...none, meds: [{ drug: "Napa" }, { drug: "Seclo" }], labs: [{ display: "FBS", fasting: true }] }, bn)!;
  assert.equal(text, "SAFIX: ডা. Dana Chen আপনার প্রেসক্রিপশন দিয়েছেন (২টি ওষুধ) এবং ১টি ল্যাব পরীক্ষা দিয়েছেন। ল্যাব পরীক্ষার জন্য খালি পেটে আসবেন (৮-১০ ঘণ্টা না খেয়ে, পানি খাওয়া যাবে)।");
});

test("refill approved", () => {
  assert.equal(refillApprovedText("Dana Chen", "Napa", en), "SAFIX: Dr. Dana Chen approved your prescription refill.");
  assert.equal(refillApprovedText("Dana Chen", "Napa", { ...en, details: true }), "SAFIX: Dr. Dana Chen approved your prescription refill for Napa.");
});

test("typed texts start with the sender's name once", () => {
  assert.equal(manualText("  Your report is ready. ", "SAFIX"), "SAFIX: Your report is ready.");
  assert.equal(manualText("SAFIX: Your report is ready.", "SAFIX"), "SAFIX: Your report is ready.");
});

test("SMS parts: 160 GSM or 70 Unicode characters each", () => {
  assert.deepEqual(smsParts(""), { parts: 0, unicode: false, length: 0 });
  assert.equal(smsParts("a".repeat(160)).parts, 1);
  assert.equal(smsParts("a".repeat(161)).parts, 2);
  assert.equal(smsParts("a".repeat(159) + "€").parts, 2); // € counts as two
  const bangla = smsParts("আপনার রিপোর্ট প্রস্তুত");
  assert.equal(bangla.unicode, true);
  assert.equal(smsParts("ক".repeat(71)).parts, 2);
});

test("no provider or an incomplete one means texts are logged, not sent", () => {
  assert.equal(gatewayConfig({}), null);
  assert.match(gatewayProblem({})!, /no SMS gateway/);
  assert.equal(gatewayConfig({ MERIDIAN_SMS_PROVIDER: "bulksmsbd", MERIDIAN_SMS_API_KEY: "k" }), null);
  assert.match(gatewayProblem({ MERIDIAN_SMS_PROVIDER: "bulksmsbd", MERIDIAN_SMS_API_KEY: "k" })!, /incomplete/);
  assert.equal(gatewayConfig({ MERIDIAN_SMS_PROVIDER: "twilio", MERIDIAN_SMS_API_KEY: "k", MERIDIAN_SMS_SENDER_ID: "s" }), null);
  const cfg = gatewayConfig({ MERIDIAN_SMS_PROVIDER: " BulkSMSBD ", MERIDIAN_SMS_API_KEY: "k", MERIDIAN_SMS_SENDER_ID: "8809617" });
  assert.deepEqual(cfg, { provider: "bulksmsbd", apiKey: "k", senderId: "8809617", url: "https://bulksmsbd.net/api/smsapi" });
  assert.equal(gatewayProblem({ MERIDIAN_SMS_PROVIDER: "bulksmsbd", MERIDIAN_SMS_API_KEY: "k", MERIDIAN_SMS_SENDER_ID: "s" }), null);
});

const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("BulkSMSBD: 202 is sent, anything else is a failure with its message", async () => {
  const cfg = gatewayConfig({ MERIDIAN_SMS_PROVIDER: "bulksmsbd", MERIDIAN_SMS_API_KEY: "k", MERIDIAN_SMS_SENDER_ID: "s" })!;
  let sent: { url: string; body: string } | null = null;
  const capture = (async (url: string, init: RequestInit) => {
    sent = { url, body: String(init.body) };
    return new Response(JSON.stringify({ response_code: 202, message_id: 991, success_message: "SMS Submitted Successfully" }));
  }) as unknown as typeof fetch;
  assert.deepEqual(await sendSms(cfg, "8801712345678", "Hi", "msg1", capture), { ok: true, ref: "991" });
  const params = new URLSearchParams(sent!.body);
  assert.equal(params.get("number"), "8801712345678");
  assert.equal(params.get("senderid"), "s");
  assert.equal(params.get("message"), "Hi");
  assert.deepEqual(await sendSms(cfg, "8801712345678", "Hi", "msg1", reply({ response_code: 1007, error_message: "Balance Insufficient" })), {
    ok: false,
    error: "BulkSMSBD 1007: Balance Insufficient",
  });
});

test("SSL Wireless: SUCCESS is sent; errors and unreachable gateways are failures", async () => {
  const cfg = gatewayConfig({ MERIDIAN_SMS_PROVIDER: "sslwireless", MERIDIAN_SMS_API_KEY: "t", MERIDIAN_SMS_SENDER_ID: "SAFIX" })!;
  assert.deepEqual(await sendSms(cfg, "8801712345678", "Hi", "c".repeat(25), reply({ status: "SUCCESS", status_code: 200, smsinfo: [{ sms_status: "SUCCESS", reference_id: "r1" }] })), {
    ok: true,
    ref: "r1",
  });
  assert.deepEqual(await sendSms(cfg, "8801712345678", "Hi", "x", reply({ status: "FAILED", status_code: 4001, error_message: "Unauthorized" })), {
    ok: false,
    error: "SSL Wireless 4001: Unauthorized",
  });
  const down = (async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;
  const r = await sendSms(cfg, "8801712345678", "Hi", "x", down);
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /ECONNREFUSED/);
});

test("the visit prescription by text: medicines, tests and next visit, no diagnosis", async () => {
  const { prescriptionText } = await import("./sms");
  const rx = {
    doctor: "Dana Chen",
    date: "১৫ অক্টোবর ২০২৬",
    meds: ["Tab. Napa 500 mg — ১+১+১ — খাবার পরে — ৫ দিন", "Cap. Seclo 20 mg — ১+০+১ — খাবারের আগে — চলবে"],
    tests: [{ display: "CBC", fasting: false }, { display: "Lipid panel", fasting: true }],
    nextVisit: "বুধবার, ২৯ অক্টোবর ২০২৬",
  };
  assert.equal(
    prescriptionText(rx, { lang: "bn", sender: "SAFIX", clinicPhone: "01712-000000" }),
    [
      "SAFIX: প্রেসক্রিপশন, ডা. Dana Chen, ১৫ অক্টোবর ২০২৬",
      "ওষুধ:",
      "১. Tab. Napa 500 mg — ১+১+১ — খাবার পরে — ৫ দিন",
      "২. Cap. Seclo 20 mg — ১+০+১ — খাবারের আগে — চলবে",
      "পরীক্ষা: CBC, Lipid panel",
      "খালি পেটে আসবেন (৮-১০ ঘণ্টা না খেয়ে, পানি খাওয়া যাবে)।",
      "পরবর্তী সাক্ষাৎ: বুধবার, ২৯ অক্টোবর ২০২৬",
      "প্রশ্ন থাকলে: 01712-000000",
    ].join("\n"),
  );
  assert.equal(
    prescriptionText({ doctor: "Dr. Dana Chen", date: "15 Oct 2026", meds: [], tests: [{ display: "X-ray chest", fasting: false }] }, { lang: "en", sender: "SAFIX" }),
    "SAFIX: Prescription, Dr. Dana Chen, 15 Oct 2026\nTests: X-ray chest",
  );
  assert.equal(prescriptionText({ doctor: "X", date: "d", meds: [], tests: [] }, { lang: "en", sender: "SAFIX" }), null);
});
