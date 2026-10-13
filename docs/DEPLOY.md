# Deploying Meridian

This guide puts Meridian on the internet with an empty database: no synthetic patients, no demo accounts. Read [GO-LIVE.md](GO-LIVE.md) first. **Until everything on that checklist is done, the site is for staff training and test patients only, not real patient information.** The app says so on every screen until you set `MERIDIAN_CLEARED_FOR_REAL_PATIENTS=1`.

## The default setup: Render

We use [Render](https://render.com): one **Web Service** (runs the Next.js app) and one **Render Postgres** database in the same region. It's a managed host, so there are no servers to patch, HTTPS certificates are automatic, and the database has managed backups. Render offers **HIPAA-enabled workspaces** with a signed Business Associate Agreement, which you need before any real US patient data goes in ([Render: HIPAA](https://render.com/docs/hipaa-compliance)). Create the workspace as HIPAA-enabled from the start, since moving later means migrating the database.

Any host that runs Node 20+ and Postgres 16 works the same way (AWS, Azure, Google Cloud, Aptible, Fly.io); the commands below don't change.

Rough cost: a Starter web service plus a paid Postgres plan with point-in-time recovery, plus the HIPAA workspace fee. Check Render's pricing page; the free tiers have no backups and must not be used.

## 1. Create the database

1. In Render, **New → Postgres**. Name `meridian-db`, PostgreSQL **16**, region closest to the clinic, a **paid** plan (backups and point-in-time recovery).
2. When it's ready, copy the **Internal Database URL**.

## 2. Create the web service

**New → Web Service**, connect GitHub, pick `RiAna3874/EMR`, branch `main`, same region as the database.

| Setting | Value |
|---|---|
| Runtime | Node |
| Build command | `npm ci --include=dev && npm run build` |
| Pre-deploy command | `npm run db:migrate` |
| Start command | `npm start` |
| Health check path | `/login` |
| Instance | Starter or larger, **one instance** (the sign-in lockout counter lives in memory) |

`--include=dev` matters: the build needs Tailwind, TypeScript and the Prisma CLI, which are dev dependencies. If your plan has no pre-deploy command, use `npm run db:migrate && npm start` as the start command instead.

Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The Internal Database URL from step 1 |
| `NODE_ENV` | `production` |
| `TZ` | The clinic's time zone, e.g. `America/New_York`, `Europe/London`, `Asia/Dhaka`. **Required**: "today", the clinic schedule and visit times use the server clock, which is UTC otherwise. |
| `MERIDIAN_SETUP_TOKEN` | A long random value, made with `openssl rand -base64 24`. Keep it private; you type it once to create the first administrator. |
| `MERIDIAN_CLINIC_NAME`, `MERIDIAN_CLINIC_ADDRESS`, `MERIDIAN_CLINIC_PHONE`, `MERIDIAN_CLINIC_FAX` | Printed on letters, requisitions and prescriptions |
| `ANTHROPIC_API_KEY` | **Leave unset** until you have a signed agreement with Anthropic (see GO-LIVE.md). Without it, the Import tab says import isn't configured and nothing leaves your server. |

Do **not** set `MERIDIAN_DEMO_ACCOUNTS`, `MERIDIAN_EXTRACTION_FIXTURE` or `MERIDIAN_DOCUMENT_FIXTURES` on a live site.

Deploy. The pre-deploy step creates the tables; the database stays empty.

## 3. First sign-in

1. Open the site's `.onrender.com` address. With no accounts in the database, it opens **Set up Meridian**.
2. Enter the setup code (`MERIDIAN_SETUP_TOKEN`), your name, role, a username and a password of at least 12 characters. You become the first administrator.
3. On **Admin → Staff accounts**, add each staff member with their role. Each gets a temporary password, shown once: give it to them in person or by phone. They choose their own at first sign-in.
4. Setup closes for good once an account exists. You can now delete `MERIDIAN_SETUP_TOKEN`.

Administrators can reset a password (new temporary one, signed out everywhere), change a role, make or remove another administrator, and deactivate someone who leaves. Accounts are never deleted, so notes and orders keep their author.

## 4. Your own domain

In the web service, **Settings → Custom Domains**, add e.g. `emr.yourclinic.com`, and add the DNS record Render shows at your domain registrar. Render issues the HTTPS certificate.

## 5. Check before staff use it

- [ ] The sign-in page lists no demo accounts and says "not yet approved for real patient information".
- [ ] Register a test patient, book a visit for today, and check the times show in the clinic's time zone.
- [ ] In Render Postgres, **Recovery**: confirm point-in-time recovery is on, then practise a restore into a new database once.
- [ ] Turn on Render's notifications for failed deploys and service downtime, and add an outside uptime check (e.g. UptimeRobot, Better Stack) on `/login`.

## Updating

Merging to `main` redeploys automatically; the pre-deploy step applies new migrations first. Never run `npm run db:seed` or `npm run db:reset` against the live database. Both refuse in production, and refuse on any database with real accounts.

## Your local copy

Your Mac keeps its own separate database. The live site starts empty, so there is nothing to erase there. Locally:

```bash
git pull
npm install
npm run db:migrate
npm run db:seed      # keep a synthetic demo locally (Dana Chen is the demo admin)
# or, to make the local database empty and try first-run setup:
npm run db:empty -- --yes
```

`db:empty` erases every row (patients, accounts, everything) and keeps the tables. It refuses on a database that has real accounts unless you also pass `--including-real-accounts`, and you should take a backup first.
