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

Not built yet: sign-in (every request acts as Dr. Dana Chen), Inbox, Orders, Documents and the lab report image import.

## Stack

Next.js 15 (App Router, TypeScript, server actions), Tailwind CSS 4, PostgreSQL 16 with Prisma. Tables mirror FHIR R4 resources (Patient, Encounter, Condition, AllergyIntolerance, MedicationRequest, Observation, DiagnosticReport) with LOINC, ICD-10 and RxNorm codes.

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
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Wipe and reseed synthetic data |
| `npm run db:reset` | Drop the database, migrate and seed |
