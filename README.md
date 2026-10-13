# Meridian EMR

An outpatient electronic medical record that follows the workflows clinicians know from large EMRs (one chart per patient with activity tabs, results review, flowsheets, notes) with an original design. **All patient data is synthetic.** Do not enter real patient information.

## What's here

- **My Day**: today's clinic as it happens (each visit's status, room and time in status, with the next step for your role as a button), abnormal results from the last 30 days, unsigned note count. Providers see their own visits, with a switch to the whole clinic.
- **Schedule**: see below.
- **Patient Lists**: Clinic Today, My Patients and All Patients, with search by name or MRN, sortable columns and alert badges (allergies, abnormal results, code status).
- **Register a new patient** (front desk and nurses): **Patient Lists → New patient**, "Register a new patient" when a search finds nobody (on Patient Lists or in Make appointment), or ⌘K → "Register new patient". The form takes legal name, preferred name, date of birth, legal sex, phone, email, address, language, an emergency contact, PCP, preferred pharmacy and coverage (plan, member ID, group, policy holder; blank is self-pay). A **duplicate check** runs as soon as name and date of birth are in, and again on save: it finds the same name and DOB, typos, accents, hyphenated or changed last names, first and last swapped, and a DOB one field off. Saving is blocked until the registrar has looked at every match and ticked "none of these is this patient" (kept on the record). The MRN comes from a database sequence (`M2000001` up). Registering from Make appointment goes straight back to booking with the new patient picked.
- **Patient chart**: several charts can be open at once as tabs in the top bar, and each remembers its last activity. A patient rail stays on the left (demographics, code status, allergies, top problems, last vitals, next appointment).
  - **Summary**: problems, medications, allergies, vitals with sparkline trends, recent abnormal results, recent notes, upcoming visits.
  - **Results**: trend table (tests by date, H/L/critical flags, reference ranges, sparklines), a single-report view with acknowledgement, and a **graph** view: pick any components, see them over time against the shaded reference range, with imported results drawn as diamonds. Click a test name in the table to graph it.
  - **Vitals**: flowsheet by visit, with a quick-entry row that computes BMI and flags, and graphs (blood pressure, heart rate, weight, BMI, SpO₂, temperature).
  - **Medications**: see [Medications and prescribing](#medications-and-prescribing) below.
  - **Problems**: active and resolved problems with ICD-10 codes; add, resolve, reactivate.
  - **Allergies**: allergen, reaction, severity, verified status. "No known allergies" is a reviewed state, distinct from "not reviewed".
  - **Notes**: progress, H&P, consult, procedure and phone notes, started from templates (office visit, chronic care, annual wellness, new patient H&P, consult, procedure, joint injection, telephone) or by copying the last note.
    - Smart text: `.name` phrases (shared library plus your own, managed at `/phrases`), `@NAME@` chart data (`@VITALS@`, `@MEDS@`, `@APPROBLEMS@`, `@ABNLABS@`...), `{Label:a|b|c}` pick lists (`::` for multi-select) and `***` blanks. Typing `.` or `@` opens suggestions; `F2` / `Shift+F2` walk the blanks and pick lists; number keys answer a pick list. A note can't be signed until every blank and pick list is resolved.
    - Problem-based assessment and plan: a side panel lists active problems with the plan last written for each, to add a fresh block or carry the old one forward.
    - States: pended (saved, unsigned, editable by the author), signed, routed for cosign (the cosigner signs with an optional attestation), and addended (signed notes never change; addenda are appended with their own signature). Notes can be filtered by type, status, author and text, and printed.
  - **Orders**: search labs, imaging, procedures, referrals and a small formulary, or add an order set (annual labs, diabetes, anemia, heart failure, new hypertension). Orders wait in a pending list until signed together. Safety checks run as you order: drug and contrast allergies (by class, e.g. penicillin → amoxicillin), duplicates, labs repeated too soon (a recent CMP counts against a BMP), contrast with low eGFR, and for prescriptions the full prescribing checks below. A hard stop needs an override reason, which is kept on the order. Signed prescriptions go to the medication list; a lab result that arrives (including an imported report) completes the matching lab order and links to it.
  - **Appointments**: upcoming and past visits, including cancellations (with reason) and no-shows, with **Make appointment**.
  - **Documents**: outside records in one list (imaging reports, discharge summaries, referral and consult letters, imported lab reports) with page thumbnails, filters by type, a reading view, and uploads still waiting for review. See [Outside document import](#outside-document-import).
  - **Import**: turn a photo, scan or PDF of an outside lab report into filed, flagged results, or of any other outside document into a structured chart document. See below.
- **Inbox**: abnormal results (critical first), normal results (acknowledge all at once), outside documents to review, imports to verify, notes to sign, notes to cosign, orders to sign, pharmacy refill requests and residents' prescriptions to cosign. A result shows the previous value, the change, and a sparkline for each component; acknowledge it with an optional comment and the next one opens. Results go to the clinician who ordered them; outside reports with no order go to the PCP, unless the PCP filed them.
- **Printing**: a clean laboratory report for any result (all panels drawn together print as one report, with previous values, flags and, for imported results, where they came from and who verified them); a plain-language **patient letter** for the same results; an order requisition for active labs, imaging and referrals; a paper **prescription** for print-class medications; and the patient's own **medication list**.
- **Command palette**: press ⌘K or Ctrl+K to find a patient by name, MRN or date of birth, jump to part of the open chart, or type "order cbc" to start an order. `g` then a letter jumps directly: `g r` Results, `g o` Orders, `g n` Notes, `g i` Inbox, `g c` Messages, `g h` My Day.

- **Sign-in and roles**: see below.


## Medications and prescribing

The **Medications** tab is the medication list and the place to prescribe (the Orders tab uses the same prescription composer).

- **The list**: each current medication shows its sig, indication and the prescription behind it (quantity, refills left, e-prescribed / printed / phoned in, pharmacy, prescriber), plus pharmacy fill history: last fill, when the supply runs out, and a red flag when it ran out with no refill (a missed-refill gap). A **History** fold shows every earlier prescription for the same therapy and why it changed. Outside and over-the-counter medications are kept on the list, marked, with nothing sent anywhere. Residents' prescriptions show **Awaiting cosign** until the attending cosigns.
- **Medication review** (rooming): Taking / Not taking / Taking differently per medication with a note, add an outside or OTC medication, and **Mark as reviewed**, which shows on the tab and the Summary. The preferred pharmacy is set here.
- **Interactions among current medications**: a panel at the top lists interactions and duplicate therapy already on the list (e.g. levothyroxine with iron).
- **Prescribing**: search the formulary by name, brand or use. The composer fills the sig, works out the quantity and days supply from dose × frequency × duration (and keeps them in step until you type your own), limits refills by controlled-substance schedule (none for C-II, five for C-III to V), and sends by e-prescribe, print or phone. A live sig preview reads back exactly what will be sent. **Reorder** and **Modify** start from a current medication; signing replaces it and keeps the therapy's start date and history.
- **Checks** while writing, in the pending list, and again when signing: allergy (by class and by name), interactions with current and other pending medications (major ones are hard stops, e.g. NSAID + anticoagulant, ACE inhibitor + ARB, clarithromycin + atorvastatin), duplicate therapy, maximum daily dose (lower for 65 and over where it applies, e.g. acetaminophen 3 g), kidney function (eGFR), older-adult cautions, and controlled-substance rules. A hard stop needs an override reason (pick one or type one); a controlled substance needs the prescription monitoring program attested; a resident names a cosigning attending.
- **Refill requests** from pharmacies land in the Inbox. Each shows the current prescription, recent fills, a **refill protocol** (visit in the last 12 months plus the drug's monitoring labs, e.g. potassium and creatinine for lisinopril, A1c for metformin, TSH for levothyroxine) and the same checks. A nurse can pend it with a protocol note; a prescriber approves (choosing quantity and refills), denies with a reason, or opens the chart to change the dose. Approving writes a new prescription that replaces the old one.
- **Printing**: a paper prescription (quantity and refills also in words, schedule shown) and a plain-language medication list for the patient.

The drug knowledge (ingredients, classes, interactions, dose limits, monitoring) is a small hand-written table in `src/lib/meds/drugs.ts` for a synthetic clinic, not a licensed drug database. The formulary is `src/lib/meds/formulary.ts`. Pharmacies and fills are simulated; nothing is sent to a real pharmacy.

## Sign-in and roles

Everything except the sign-in page needs a signed-in user. Sessions are a random token in an httpOnly cookie (only its SHA-256 is stored, in the `Session` table); they last a 12-hour shift and end after 2 hours idle or on **Sign out**. Passwords are hashed with scrypt. Five failed attempts lock a username for a minute.

Each role sees and does what fits it. Every server action checks the role itself (`requirePermission` in `src/lib/session.ts`); hiding buttons is only a convenience. The rules live in one table, `src/lib/roles.ts`.

| | Physician | Resident | Nurse | Front desk |
|---|:-:|:-:|:-:|:-:|
| Patient lists, schedule, demographics, allergies | ✓ | ✓ | ✓ | ✓ |
| Clinical chart (results, vitals, notes, orders), printing | ✓ | ✓ | ✓ | |
| Record vitals, edit allergies | ✓ | ✓ | ✓ | |
| Edit problems, discontinue and hold medications | ✓ | ✓ | | |
| Medication review: taking / not taking, outside and OTC meds, mark reviewed | ✓ | ✓ | ✓ | |
| Write prescriptions (pended for a prescriber when a nurse writes them) | ✓ | ✓ | ✓ | |
| Sign prescriptions, approve or deny refill requests | ✓ | ✓, routed for cosign | | |
| Prepare refill requests against the protocol | ✓ | ✓ | ✓ | |
| Cosign residents' prescriptions | ✓ | | | |
| Write and sign notes, addenda, phrases | ✓ | ✓, routed for cosign | ✓ | |
| Cosign notes | ✓ | | | |
| Pend orders | ✓ | ✓ | ✓ | |
| Sign and discontinue orders | ✓ | ✓ | | |
| Upload and review outside reports | ✓ | ✓ | ✓ | |
| Verify and file imported results and documents | ✓ | ✓ | | |
| Acknowledge results (Inbox) | ✓ | ✓ | | |
| Register new patients | | | ✓ | ✓ |
| Book, reschedule and cancel appointments | ✓ | ✓ | ✓ | ✓ |
| Check in, check out, mark no-show | | | ✓ | ✓ |
| Room patients | ✓ | ✓ | ✓ | |
| Start and finish visits | ✓ | ✓ | | |
| Edit provider templates and blocked time | ✓ | | | ✓ |
| Secure chat with other staff | ✓ | ✓ | ✓ | ✓ |

A resident can't sign a note without choosing an attending to cosign it; the note then waits in that attending's Inbox. Orders a nurse pends show "pended by" on the chart's Orders tab, and the physician or resident who signs them becomes the ordering clinician. Front desk opens a chart to a demographics and appointments view only.

Synthetic accounts (password `meridian` for all):

| Username | Name | Role |
|---|---|---|
| `dchen` | Dana Chen, MD | Physician |
| `ribarra` | Rafael Ibarra, DO | Physician |
| `hmarsh` | Helena Marsh, MD | Physician (cardiology) |
| `lbrandt` | Leo Brandt, MD | Resident |
| `klund` | Kirsten Lund, RN | Nurse |
| `tmbeki` | Thandi Mbeki | Front desk |

The sign-in page lists them in development. In a production build they are hidden unless `MERIDIAN_DEMO_ACCOUNTS=1`.

## Scheduling and the clinic day

- **Schedule** (top bar, or `g d`): a day view with one column per provider. Each column shows the provider's sessions, blocked time (hatched, with the reason), appointments colored by visit type with their status, and a red line at the current time. Hover an open slot and click to book it. Overbooked visits sit side by side. Cancelled visits are listed on the right.
- **Make appointment**: find the patient, pick a visit type (follow-up, same-day sick, new patient, annual wellness, procedure, consult, video visit; each has a length) and a provider (the patient's PCP by default, or any provider), then pick from the open times over the next two weeks. A time that isn't open (outside the provider's sessions, blocked, or already taken) can only be booked by ticking **Overbook**. A patient can't be double-booked, and past days can't be booked.
- **Reschedule** releases the old time: the old appointment is cancelled with reason "Rescheduled" and links to the new one. **Cancel** asks for a reason. Both are kept in the appointment's history.
- **Provider templates** (`/schedule/templates`): each provider's weekly sessions (days, hours and slot length) and blocked time such as vacation or meetings.
- **The clinic day** follows one status path, and each step is recorded with who did it and when:

  Scheduled → **Check in** (front desk: confirm identity, phone, address, language and insurance; collect the copay) → **Room** (nurse: exam room, chief complaint, vitals filed to the visit, allergies and medications reviewed) → **Start visit** (provider; opens the chart) → **Visit done** → **Check out** (front desk; offers a follow-up booking).

  A provider can start a checked-in visit without waiting for rooming, and video visits skip rooming. A scheduled visit can be marked **No show**; a check-in or no-show can be undone. The rules are in `src/lib/scheduling/workflow.ts`.
- **My Day** refreshes every 30 seconds. The status shows how long the patient has been in it, highlighted after 20 minutes of waiting to be roomed or seen.

The seed gives every provider a weekly template, walks today's visits through the clinic day up to the time the seed runs (so seeding mid-morning shows a clinic in progress), adds a cancellation and a no-show, and scatters bookings over the next two weeks.

## Secure staff chat

**Messages** in the top bar is real-time chat between staff, next to the Inbox. The Inbox holds work the chart routes to you; Messages is people talking to each other.

- **Conversations** are one-to-one or groups (optionally named), and can carry a **patient context**: a banner with name, age, DOB and MRN and a link to the chart. Start one from **New message** or from **Message about this patient** on the chart's left rail, which pre-fills the patient and suggests the PCP and the provider seeing them next. The rail also lists your conversations about that patient.
- **Read receipts**: under your latest message, "Read 3:42 PM" in a one-to-one or "Read by Dana, Leo (2 of 4)" in a group. A message counts as read only while the conversation is on screen.
- **Urgent** messages show in red, put a red count on the Messages tab and pop an alert on whatever screen the recipient is on, even if they muted the conversation.
- **Status**: Available, Busy or Away with a short note ("in a procedure until 11"), shown next to names and above the message box.
- **Unread counts** per conversation and on the top bar. An open conversation refreshes every few seconds; the top-bar count every 15 seconds on any screen.
- **Mute, leave, add people, rename.** Adding someone to a one-to-one starts a new group, so they don't see the private conversation. Someone who leaves loses access until they're added back.
- Messages can't be edited or deleted, and only members can open a conversation (anyone else gets a 404). Chat isn't part of the legal record, and the screen says so: decisions belong in the chart.

The seed loads a few conversations for Dr. Chen, including an urgent one from the nurse waiting to be read.

## Lab report import

1. **Upload** one or more pages (phone photos are rotated and shrunk in the browser first) on a patient's **Import** tab with **Lab results** chosen.
2. **Read**: Claude (`claude-opus-5-5`, structured JSON output) transcribes every row exactly as printed: test name, value, unit, reference range, the lab's flag, and where on the page it was read. It does not compute or correct anything.
3. **Review**, side by side with the image. The app then:
   - maps printed names (Haemoglobin, SGPT, S. Creatinine, RBS...) to LOINC codes and the chart's usual units, and files each test under the same panel as tests ordered here so trends line up;
   - computes the flag from the value and range (including per-sex ranges and critical limits) and highlights rows where the lab's printed flag disagrees;
   - offers exact unit conversions (7,500 /cumm → 7.5 K/µL, 9.8 mmol/L glucose → 177 mg/dL) as a one-click fix, never silently;
   - warns on physiologically implausible values, low-confidence reads, and results already on file for that date;
   - checks the printed name, date of birth, age and sex against the chart, and blocks filing on a mismatch until the clinician confirms.
4. **Verify & file** creates one `DiagnosticReport` (source `imported`, linked to the upload, verified by and when) per panel and an `Observation` per result. Imported results show an IMP badge in Results and link back to the source image. Nothing reaches the chart without this step.

Pending imports show on My Day under "Imported reports to verify". If Claude can't read a report (or no API key is set), the clinician can type the results in next to the image instead.

Set `ANTHROPIC_API_KEY` in `.env`. To work on the review screen without an API key, set `MERIDIAN_EXTRACTION_FIXTURE=samples/synthetic-lab-report.extraction.json` (development only) and upload `samples/synthetic-lab-report.png`.

## Outside document import

The same Import tab reads documents that aren't lab tables: imaging reports, hospital discharge summaries, referral letters and consult letters (plus procedure and pathology reports, or "other"). Choose **Clinical document** before uploading.

1. **Read**: Claude transcribes the document word for word: title, facility, author, dates, the impression, every section's text, and the diagnoses, medications (marked new, changed, continued or stopped) and follow-up recommendations the document itself states, each with where it sits on the page. It doesn't summarize or add anything. If the pages turn out to be a lab report, a banner offers to read them as lab results instead (and the header link switches either way).
2. **Review**, side by side with the pages; clicking a highlight finds the item in the form and the reverse. The app:
   - checks the printed name, date of birth, age and sex against the chart and blocks filing on a mismatch until confirmed;
   - compares each diagnosis with the problem list (on the list, related by ICD-10 category, or new) and each medication with the medication list, and warns when a document starts a drug that isn't listed or stops one that's still active here;
   - suggests the open imaging or referral order the document answers (by its words, never by type alone).
3. **Verify & file** (physician or resident) creates a `ClinicalDocument` with the reviewed content and where each part came from. Diagnoses the reviewer ticks are added to the problem list and ticked medications are added as outside medications (nothing is prescribed); a linked order is completed. A stopped medication is never removed automatically: the reviewer is told to act on it in Medications.

A nurse can upload and prepare a document but not file it. Filed documents show on the Documents tab and the Summary ("Outside records"), print in our own layout with their provenance, and wait in the Inbox under "Outside documents" for the clinician who ordered them or, with no order, the PCP, unless that clinician filed it.

To work without an API key, set `MERIDIAN_DOCUMENT_FIXTURES=samples` (development only) and upload one of the synthetic documents in `samples/` (`synthetic-discharge-summary-p1.png` with `-p2.png`, `synthetic-dxa-report.png`, `synthetic-ct-chest-report.png`, `synthetic-ruq-ultrasound.png`, `synthetic-eye-consult-letter.png`); the saved transcription is matched by file name. The seed files a CT and an ultrasound and leaves an eye consult letter waiting for review.

## Stack

Next.js 15 (App Router, TypeScript, server actions), Tailwind CSS 4, PostgreSQL 16 with Prisma, the Claude API for reading report images. Tables mirror FHIR R4 resources (Patient, Encounter, Condition, AllergyIntolerance, MedicationRequest, Observation, DiagnosticReport) with LOINC, ICD-10 and RxNorm codes.

## Run it locally

Needs Node 20+ and PostgreSQL 16 (or Docker).

```bash
docker compose up -d          # or use your own Postgres
cp .env.example .env          # edit DATABASE_URL if needed
npm install
npx prisma migrate deploy
npm run db:seed               # 12 synthetic patients with two years of history
npm run dev                   # http://localhost:3000, sign in as dchen / meridian
```

Re-run `npm run db:seed` at any time to reset the data; it schedules the clinic day for whatever day you run it.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |
| `npm test` | Unit tests for lab import parsing, order safety checks, roles and password hashing |
| `npm run db:migrate` | Apply migrations and regenerate the database client (restart `npm run dev` afterwards) |
| `npm run db:seed` | Wipe and reseed synthetic data |
| `npm run db:reset` | Drop the database, migrate and seed |
