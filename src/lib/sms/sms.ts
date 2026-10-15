// Text messages to patients' phones: which number, what the text says, how many SMS it
// costs. No database or network here; src/lib/sms/server.ts sends and logs.

// A registered Bangladeshi mobile as the gateways want it: "+880 1712-345678" → "8801712345678".
// Landlines can't take a text, so they give null.
export function smsNumber(phone: string | null | undefined): string | null {
  let digits = (phone ?? "").replace(/\D/g, "");
  if (digits.startsWith("880")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return /^1[3-9]\d{8}$/.test(digits) ? `880${digits}` : null;
}

// "8801712345678" → "01712-345678", the way people write it in Bangladesh.
export const localNumber = (to: string) => (/^8801\d{9}$/.test(to) ? `0${to.slice(3, 7)}-${to.slice(7)}` : to);

// Plain-English letters and punctuation go as GSM text (160 characters, 153 per part when
// split); anything else, Bangla included, as Unicode (70, 67 per part). These cost double in GSM.
const GSM_EXTENDED = /[\^{}\\[~\]|€]/g;
const GSM_BASIC = /^[A-Za-z0-9 \n\r@£$¥!"#%&'()*+,\-./:;<=>?_¡¿§^{}\\[~\]|€]*$/;

export function smsParts(text: string): { parts: number; unicode: boolean; length: number } {
  const unicode = !GSM_BASIC.test(text);
  const length = unicode ? [...text].length : text.length + (text.match(GSM_EXTENDED)?.length ?? 0);
  const [single, multi] = unicode ? [70, 67] : [160, 153];
  return { parts: length === 0 ? 0 : length <= single ? 1 : Math.ceil(length / multi), unicode, length };
}

export type SmsLang = "en" | "bn";
export const smsLang = (preferredLanguage: string | null | undefined): SmsLang => (preferredLanguage === "Bangla" ? "bn" : "en");

const BN_DIGITS = "০১২৩৪৫৬৭৮৯";
const bnNum = (n: number | string) => String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);

// "Dana Chen" → "Dr. Dana Chen"; a name that already has the title keeps it.
export function doctorName(name: string, lang: SmsLang) {
  const bare = name.replace(/^(dr\.?|ডা\.?)\s+/i, "").trim();
  return `${lang === "bn" ? "ডা." : "Dr."} ${bare}`;
}

export type SignedItems = {
  prescriber: string;
  meds: { drug: string; dose?: string | null; frequency?: string | null }[];
  labs: { display: string; fasting: boolean }[];
  imaging: string[];
  referrals: string[];
  procedures: string[];
};

export type SmsOptions = {
  lang: SmsLang;
  // Shown first so the patient knows who it's from, e.g. "SAFIX".
  sender: string;
  // The clinic's number for questions. Left off when the clinic hasn't set one.
  clinicPhone?: string | null;
  // Name the medicines and tests. Off by default: anyone holding the phone can read a text.
  details?: boolean;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function countsEn(i: SignedItems) {
  return [
    i.labs.length && plural(i.labs.length, "lab test"),
    i.imaging.length && plural(i.imaging.length, "X-ray or scan", "X-rays or scans"),
    i.referrals.length && plural(i.referrals.length, "referral"),
    i.procedures.length && plural(i.procedures.length, "procedure"),
  ].filter(Boolean) as string[];
}

function countsBn(i: SignedItems) {
  return [
    i.labs.length && `${bnNum(i.labs.length)}টি ল্যাব পরীক্ষা`,
    i.imaging.length && `${bnNum(i.imaging.length)}টি এক্স-রে বা স্ক্যান`,
    i.referrals.length && `${bnNum(i.referrals.length)}টি রেফারেল`,
    i.procedures.length && `${bnNum(i.procedures.length)}টি প্রসিডিউর`,
  ].filter(Boolean) as string[];
}

const joinEn = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const joinBn = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} ও ${xs[xs.length - 1]}`);

const medLine = (m: SignedItems["meds"][number]) => [m.drug, m.dose, m.frequency].filter(Boolean).join(" ");

function detailLines(i: SignedItems, lang: SmsLang) {
  const tests = [...i.labs.map((l) => l.display), ...i.imaging, ...i.referrals, ...i.procedures];
  return [
    i.meds.length ? `${lang === "bn" ? "ওষুধ" : "Medicines"}: ${i.meds.map(medLine).join("; ")}.` : "",
    tests.length ? `${lang === "bn" ? "পরীক্ষা" : "Tests"}: ${tests.join(", ")}.` : "",
  ].filter(Boolean);
}

const finish = (lines: string[], o: SmsOptions) => {
  if (o.clinicPhone) lines.push(o.lang === "bn" ? `প্রশ্ন থাকলে: ${o.clinicPhone}` : `Questions: ${o.clinicPhone}`);
  return `${o.sender}: ${lines.join(" ")}`;
};

// The text sent when a clinician signs prescriptions and orders for the patient. Says what
// kind of thing was ordered and how many, not what for, so it never names a diagnosis.
export function signedOrdersText(i: SignedItems, o: SmsOptions): string | null {
  const dr = doctorName(i.prescriber, o.lang);
  const fasting = i.labs.some((l) => l.fasting);
  const lines: string[] = [];
  if (o.lang === "bn") {
    const counts = countsBn(i);
    const rx = i.meds.length ? `আপনার প্রেসক্রিপশন দিয়েছেন (${bnNum(i.meds.length)}টি ওষুধ)` : "";
    if (rx && counts.length) lines.push(`${dr} ${rx} এবং ${joinBn(counts)} দিয়েছেন।`);
    else if (rx) lines.push(`${dr} ${rx}। প্রেসক্রিপশনে লেখা নিয়মে ওষুধ খাবেন।`);
    else if (counts.length) lines.push(`${dr} আপনার জন্য ${joinBn(counts)} দিয়েছেন।`);
    else return null;
    if (fasting) lines.push("ল্যাব পরীক্ষার জন্য খালি পেটে আসবেন (৮-১০ ঘণ্টা না খেয়ে, পানি খাওয়া যাবে)।");
  } else {
    const counts = countsEn(i);
    const rx = i.meds.length ? `signed your prescription (${plural(i.meds.length, "medicine")})` : "";
    if (rx && counts.length) lines.push(`${dr} ${rx} and ordered ${joinEn(counts)}.`);
    else if (rx) lines.push(`${dr} ${rx}. Take ${i.meds.length === 1 ? "it" : "them"} as written on the prescription.`);
    else if (counts.length) lines.push(`${dr} ordered ${joinEn(counts)} for you.`);
    else return null;
    if (fasting) lines.push("Come fasting for the lab test (no food for 8-10 hours, water is fine).");
  }
  if (o.details) lines.push(...detailLines(i, o.lang));
  return finish(lines, o);
}

// The text sent when a pharmacy's refill request is approved.
export function refillApprovedText(prescriber: string, drug: string, o: SmsOptions): string {
  const dr = doctorName(prescriber, o.lang);
  const what = o.details ? (o.lang === "bn" ? ` (${drug})` : ` for ${drug}`) : "";
  const line = o.lang === "bn" ? `${dr} আপনার ওষুধের রিফিল${what} অনুমোদন করেছেন।` : `${dr} approved your prescription refill${what}.`;
  return finish([line], o);
}

// Typed on the Texts tab: the sender's name goes first unless the writer already put it there.
export function manualText(body: string, sender: string): string {
  const text = body.trim().replace(/[ \t]+/g, " ");
  return text.toLowerCase().startsWith(sender.toLowerCase()) ? text : `${sender}: ${text}`;
}

export const MANUAL_MAX = 480;

export type RxTextInput = {
  doctor: string;
  date: string; // already in the patient's language, e.g. "১৫ অক্টোবর ২০২৬"
  // One line per medicine, as the printed prescription writes it: "Tab. Napa 500 mg — 1+1+1 — after food — 5 days".
  meds: string[];
  tests: { display: string; fasting: boolean }[];
  nextVisit?: string | null;
};

// The visit's prescription as one text: medicines with how to take them, tests to do and the
// next visit. Like the printed copy it leaves out the diagnosis.
export function prescriptionText(rx: RxTextInput, o: Omit<SmsOptions, "details">): string | null {
  if (!rx.meds.length && !rx.tests.length) return null;
  const bn = o.lang === "bn";
  const lines = [[`${o.sender}: ${bn ? "প্রেসক্রিপশন" : "Prescription"}`, rx.doctor && doctorName(rx.doctor, o.lang), rx.date].filter(Boolean).join(", ")];
  if (rx.meds.length) {
    lines.push(bn ? "ওষুধ:" : "Medicines:");
    rx.meds.forEach((m, i) => lines.push(`${bn ? bnNum(i + 1) : i + 1}. ${m}`));
  }
  if (rx.tests.length) {
    const fasting = rx.tests.some((t) => t.fasting);
    lines.push(`${bn ? "পরীক্ষা" : "Tests"}: ${rx.tests.map((t) => t.display).join(", ")}`);
    if (fasting) lines.push(bn ? "খালি পেটে আসবেন (৮-১০ ঘণ্টা না খেয়ে, পানি খাওয়া যাবে)।" : "Come fasting (no food for 8-10 hours, water is fine).");
  }
  if (rx.nextVisit) lines.push(`${bn ? "পরবর্তী সাক্ষাৎ" : "Next visit"}: ${rx.nextVisit}`);
  if (o.clinicPhone) lines.push(bn ? `প্রশ্ন থাকলে: ${o.clinicPhone}` : `Questions: ${o.clinicPhone}`);
  return lines.join("\n");
}
