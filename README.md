# Meridian EMR

An outpatient electronic medical record that follows the workflows clinicians know from large EMRs (one chart per patient with activity tabs, results review, flowsheets, notes) with an original design. **All patient data is synthetic.** Do not enter real patient information.

## What's here

- **My Day**: today's clinic schedule, abnormal results from the last 30 days, unsigned note count.
- **Patient Lists**: Clinic Today, My Patients and All Patients, with search by name or MRN, sortable columns and alert badges (allergies, abnormal results, code status).
- **Patient chart**: several charts can be open at once as tabs in the top bar, and each remembers its last activity. A patient rail stays on the left (demographics, code status, allergies, top problems, last vitals, next appointment).
  - **Summary**: problems, medications, allergies, vitals with sparkline trends, recent abnormal results, recent notes, upcoming visits.
  - **Results**: trend table (tests by date, H/L/critical flags, reference ranges, sparklines), a single-report view with acknowledgement, and a **graph** view: pick any components, see them over time against the shaded reference range, with imported results drawn as diamonds. Click a test name in the table to graph it.
  - **Vitals**: flowsheet by visit, with a quick-entry row that computes BMI and flags, and graphs (blood pressure, heart rate, weight, BMI, SpO₂, temperature).
  - **Medications**: current and discontinued lists; add, hold, resume, discontinue.
  - **Problems**: active and resolved problems with ICD-10 codes; add, resolve, reactivate.
  - **Allergies**: allergen, reaction, severity, verified status. "No known allergies" is a reviewed state, distinct from "not reviewed".
  - **Notes**: progress, H&P, consult, procedure and phone notes, started from templates (office visit, chronic care, annual wellness, new patient H&P, consult, procedure, joint injection, telephone) or by copying the last note.
    - Smart text: `.name` phrases (shared library plus your own, managed at `/phrases`), `@NAME@` chart data (`@VITALS@`, `@MEDS@`, `@APPROBLEMS@`, `@ABNLABS@`...), `{Label:a|b|c}` pick lists (`::` for multi-select) and `***` blanks. Typing `.` or `@` opens suggestions; `F2` / `Shift+F2` walk the blanks and pick lists; number keys answer a pick list. A note can't be signed until every blank and pick list is resolved.
    - Problem-based assessment and plan: a side panel lists active problems with the plan last written for each, to add a fresh block or carry the old one forward.
    - States: pended (saved, unsigned, editable by the author), signed, routed for cosign (the cosigner signs with an optional attestation), and addended (signed notes never change; addenda are appended with their own signature). Notes can be filtered by type, status, author and text, and printed.
  - **Orders**: search labs, imaging, procedures, referrals and a small formulary, or add an order set (annual labs, diabetes, anemia, heart failure, new hypertension). Orders wait in a pending list until signed together. Safety checks run as you order: drug and contrast allergies (by class, e.g. penicillin → amoxicillin), duplicates, labs repeated too soon (a recent CMP counts against a BMP), metformin/NSAID/contrast with low eGFR, NSAIDs with an anticoagulant. A hard stop needs an override reason, which is kept on the order. Signed prescriptions go to the medication list; a lab result that arrives (including an imported report) completes the matching lab order and links to it.
  - **Import Report**: turn a photo, scan or PDF of an outside lab report into filed, flagged results. See below.
- **Inbox**: abnormal results (critical first), normal results (acknowledge all at once), imported reports to verify, notes to sign, notes to cosign and orders to sign. A result shows the previous value, the change, and a sparkline for each component; acknowledge it with an optional comment and the next one opens. Results go to the clinician who ordered them; outside reports with no order go to the PCP, unless the PCP filed them.
- **Printing**: a clean laboratory report for any result (all panels drawn together print as one report, with previous values, flags and, for imported results, where they came from and who verified them); a plain-language **patient letter** for the same results; and an order requisition for active labs, imaging and referrals.
- **Command palette**: press ⌘K or Ctrl+K to find a patient by name, MRN or date of birth, jump to part of the open chart, or type "order cbc" to start an order. `g` then a letter jumps directly: `g r` Results, `g o` Orders, `g n` Notes, `g i` Inbox, `g h` My Day.

- **Sign-in and roles**: see below.

Not built yet: the Documents tab.

## Sign-in and roles

Everything except the sign-in page needs a signed-in user. Sessions are a random token in an httpOnly cookie (only its SHA-256 is stored, in the `Session` table); they last a 12-hour shift and end after 2 hours idle or on **Sign out**. Passwords are hashed with scrypt. Five failed attempts lock a username for a minute.

Each role sees and does what fits it. Every server action checks the role itself (`requirePermission` in `src/lib/session.ts`); hiding buttons is only a convenience. The rules live in one table, `src/lib/roles.ts`.

| | Physician | Resident | Nurse | Front desk |
|---|:-:|:-:|:-:|:-:|
| Patient lists, schedule, demographics, allergies | ✓ | ✓ | ✓ | ✓ |
| Clinical chart (results, vitals, notes, orders), printing | ✓ | ✓ | ✓ | |
| Record vitals, edit allergies | ✓ | ✓ | ✓ | |
| Edit problems and the medication list | ✓ | ✓ | | |
| Write and sign notes, addenda, phrases | ✓ | ✓, routed for cosign | ✓ | |
| Cosign notes | ✓ | | | |
| Pend orders | ✓ | ✓ | ✓ | |
| Sign and discontinue orders | ✓ | ✓ | | |
| Upload and review outside reports | ✓ | ✓ | ✓ | |
| Verify and file imported results | ✓ | ✓ | | |
| Acknowledge results (Inbox) | ✓ | ✓ | | |

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

## Lab report import

1. **Upload** one or more pages (phone photos are rotated and shrunk in the browser first) on a patient's **Import Report** tab.
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
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Wipe and reseed synthetic data |
| `npm run db:reset` | Drop the database, migrate and seed |
