# Texts to patients' phones

SAFIX can text a patient's mobile phone:

- **Automatically when prescriptions or orders are signed.** One text for everything signed together, for example "SAFIX: Dr. Dana Chen signed your prescription (2 medicines) and ordered 1 lab test. Come fasting for the lab test (no food for 8-10 hours, water is fine). Questions: 01712-000000".
- **When a pharmacy refill request is approved.**
- **Whenever staff type one**, on the chart's **Texts** tab. Quick buttons fill in common texts such as "Your report is ready" in Bangla or English.

- **The whole prescription, when you choose to send it.** On the Visit tab, under **Print visit prescription**, open **Send prescription by SMS**. It shows the exact text first: each medicine with its 1+0+1 schedule, before or after food and how long, the tests to do (with a fasting reminder when one needs it) and the next visit. Click **Send to patient**. Like the printed copy, it leaves out the diagnosis. A long prescription takes several SMS, and the preview says how many.

Patients whose preferred language is Bangla get Bangla texts; everyone else gets English. Texts go to the mobile number on the patient's registration (a landline can't get texts).

Texts say what kind of thing was ordered and how many, never a diagnosis, and by default not the medicine or test names, because anyone holding the phone can read them. To include medicine names with dose and frequency, and test names, set `MERIDIAN_SMS_DETAILS=1`.

## Turning texts off for a patient

On the chart's **Texts** tab, click **Patient doesn't want texts**. Nothing is sent to that patient, automatic texts included, until someone clicks **Turn texts back on**. The patient rail shows "No texts" next to the phone number.

## Where to see what was sent

- **The chart's Texts tab**: every text to that patient, who sent it and whether it went out. A failed text has **Send again**.
- **Admin, Text messages**: every text to every patient, with how many were sent this month.

## Setting up the gateway

Until a gateway is set up, texts are written to the Texts tab and the Admin log marked "Not sent: no gateway", so you can see what patients would get. Nothing leaves the server.

1. Open an account with **BulkSMSBD** (bulksmsbd.com) or **SSL Wireless** (sslwireless.com). Both are Bangladesh SMS gateways; texts usually cost well under 1 taka each (Bangla and long texts count as two or three).
2. Ask them for a sender ID or masking name such as `SAFIX`. Approval can take a few days; until then, use the non-masking number they give you.
3. Top up the account balance.
4. On Render, open the **EMR** web service, **Environment**, and add:

| Variable | Value |
|---|---|
| `MERIDIAN_SMS_PROVIDER` | `bulksmsbd` or `sslwireless` |
| `MERIDIAN_SMS_API_KEY` | BulkSMSBD: the API key from the dashboard. SSL Wireless: the API token. |
| `MERIDIAN_SMS_SENDER_ID` | BulkSMSBD: the approved sender ID. SSL Wireless: the SID. |
| `MERIDIAN_CLINIC_PHONE` | The number patients should call with questions. Texts leave the "Questions:" line off until this is set. |

5. Save. Render restarts the app. Text yourself from a test patient's Texts tab and check the status says **Sent**.

If a text fails, the Texts tab and Admin log show the gateway's reason, such as "Balance Insufficient" or an invalid key. A failing gateway never stops a prescription or order from being signed.
