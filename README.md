# Meridian EMR

An outpatient electronic medical record that follows the workflows clinicians know from large EMRs (one chart per patient with activity tabs, results review, flowsheets, notes) with an original design. **All patient data is synthetic.** Do not enter real patient information.

## What's here

- **My Day**: today's clinic schedule, abnormal results from the last 30 days, unsigned note count.
- **Patient Lists**: Clinic Today, My Patients and All Patients, with search by name or MRN, sortable columns and alert badges (allergies, abnormal results, code status).
- **Patient chart**: several charts can be open at once as tabs in the top bar, and each remembers its last activity. A patient rail stays on the left (demographics, code status, allergies, top problems, last vitals, next appointment).
  - **Summary**: problems, medications, allergies, vitals with sparkline trends, recent abnormal results, recent notes, upcoming visits.
  - **Results**: trend table (tests by date, H/L/critical flags, reference ranges, sparklines) and a single-report view.
  - **Vitals**: flowsheet by visit, with a quick-entry row that computes BMI and flags.
  - **Medications**: current and discontinued lists; add, hold, resume, discontinue.
  - **Problems**: active and resolved problems with ICD-10 codes; add, resolve, reactivate.
  - **Allergies**: allergen, reaction, severity, verified status. "No known allergies" is a reviewed state, distinct from "not reviewed".
  - **Notes**: progress, H&P, consult and phone notes. Templates, and smart phrases (`.vitals`, `.meds`, `.problems`, `.allergies`, `.labs`) that pull live chart data into the note. Drafts can be edited; signed notes are locked.

  - **Import Report**: turn a photo, scan or PDF of an outside lab report into filed, flagged results. See below.

Not built yet: sign-in (every request acts as Dr. Dana Chen), Inbox, Orders and the Documents tab.

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
npm run dev                   # http://localhost:3000
```

Re-run `npm run db:seed` at any time to reset the data; it schedules the clinic day for whatever day you run it.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript checks |
| `npm test` | Unit tests for lab import parsing and checks |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Wipe and reseed synthetic data |
| `npm run db:reset` | Drop the database, migrate and seed |
