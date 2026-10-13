# Deploying Meridian

This guide puts Meridian on the internet with an empty database: no synthetic patients, no demo accounts. Read [GO-LIVE.md](GO-LIVE.md) first. **Until everything on that checklist is done, the site is for staff training and test patients only, not real patient information.** The app says so on every screen until you set `MERIDIAN_CLEARED_FOR_REAL_PATIENTS=1`.

## The default setup: Render

We use [Render](https://render.com): one **Web Service** (runs the Next.js app) and one **Render Postgres** database, both in **Singapore**, the closest of Render's regions to Bangladesh ([Render regions](https://render.com/docs/regions)). It's a managed host, so there are no servers to patch, HTTPS certificates are automatic, and the database has managed backups. A region can't be changed after creation, so pick Singapore for both from the start.

**Before real patients, check with a Bangladeshi lawyer whether patient records must be stored inside Bangladesh.** The Personal Data Protection Ordinance 2025 (since re-enacted as an Act in 2026) treats health data as sensitive and requires some categories of data to stay in the country; see [GO-LIVE.md](GO-LIVE.md). If it applies, Singapore is fine for training and test patients, and the live database moves to a host with a Bangladesh data centre before real patients go in. The steps below are the same on any host.

For a clinic in the US, use a **HIPAA-enabled workspace** with a signed Business Associate Agreement instead ([Render: HIPAA](https://render.com/docs/hipaa-compliance)).

Any host that runs Node 20+ and Postgres 16 works the same way (AWS, Azure, Google Cloud, Aptible, Fly.io); the commands below don't change.

Rough cost: a Starter web service plus a paid Postgres plan with point-in-time recovery. Check Render's pricing page; the free tiers have no backups and must not be used.

## 1. Create the database

1. In Render, **New → Postgres**. Name `meridian-db`, PostgreSQL **16**, region **Singapore**, a **paid** plan (backups and point-in-time recovery).
2. When it's ready, copy the **Internal Database URL**.

## 2. Create the web service

**New → Web Service**, connect GitHub, pick `RiAna3874/EMR`, branch `main`, region **Singapore** (the same as the database).

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
| `TZ` | `Asia/Dhaka` (the clinic's time zone). **Required**: "today", the clinic schedule and visit times use the server clock, which is UTC otherwise. |
| `MERIDIAN_SETUP_TOKEN` | A long random value, made with `openssl rand -base64 24`. Keep it private; you type it once to create the first administrator. |
| `MERIDIAN_CLINIC_NAME`, `MERIDIAN_CLINIC_ADDRESS`, `MERIDIAN_CLINIC_PHONE`, `MERIDIAN_CLINIC_FAX` | Printed on letters, requisitions and prescriptions |
| `MERIDIAN_APP_NAME`, `MERIDIAN_APP_FULL_NAME`, `MERIDIAN_LOGO_URL`, `MERIDIAN_ACCENT_COLOR` | Optional: your own product name, logo and color. See [Your own name and look](#your-own-name-and-look). |
| `ANTHROPIC_API_KEY` | **Leave unset** until you have a signed agreement with Anthropic (see GO-LIVE.md). Without it, the Import tab says import isn't configured and nothing leaves your server. |

Do **not** set `MERIDIAN_DEMO_ACCOUNTS`, `MERIDIAN_EXTRACTION_FIXTURE` or `MERIDIAN_DOCUMENT_FIXTURES` on a live site.

Deploy. The pre-deploy step creates the tables; the database stays empty.

## 3. First sign-in

1. Open the site's `.onrender.com` address. With no accounts in the database, it opens **Set up Meridian**.
2. Enter the setup code (`MERIDIAN_SETUP_TOKEN`), your name, role, a username and a password of at least 12 characters. You become the first administrator.
3. On **Admin → Staff accounts**, add each staff member with their role. Each gets a temporary password, shown once: give it to them in person or by phone. They choose their own at first sign-in.
4. Setup closes for good once an account exists. You can now delete `MERIDIAN_SETUP_TOKEN`.

5. **Two-step sign-in.** On the live site every account needs it. At first sign-in each person installs Google Authenticator or Microsoft Authenticator on their phone, scans the code Meridian shows, types the 6-digit code, and saves ten one-time recovery codes (print them or write them down). From then on they sign in with their password and the code from their phone. If someone loses their phone they can sign in once with a recovery code; an administrator can also **Reset two-step** on Staff accounts so they set it up again.

Administrators can reset a password (new temporary one, signed out everywhere), change a role, make or remove another administrator, and deactivate someone who leaves. Accounts are never deleted, so notes and orders keep their author.

## Access log

**Admin → Access log** lists every chart a person opened (each section, at most once per five minutes), printed or changed, plus every sign-in, failed sign-in, wrong two-step code and staff account change, with the time and the network address it came from. Filter by patient, staff member, type and dates, or **Download CSV** for a privacy complaint. Administrators see **Who has opened this chart** at the bottom of each patient's left-hand panel. The log keeps record types and field names, never the clinical content itself, and the database refuses to edit or delete its entries.

Review it regularly, for example once a week: look at failed sign-ins and at anyone opening charts of patients they don't treat.

## 4. Your own domain

You need a domain first, bought from a registrar (for a `.com`: Cloudflare, Namecheap or Porkbun; for a `.com.bd`: BTCL or a BTCL reseller). A subdomain such as `emr.yourclinic.com` is best: it leaves `yourclinic.com` free for a public website.

1. In the web service, **Settings → Custom Domains → Add Custom Domain**, type e.g. `emr.yourclinic.com`, save.
2. Render shows a DNS record to add. For a subdomain it's a **CNAME** named `emr` pointing at the service's `.onrender.com` address. (For a bare `yourclinic.com` it's an **A** record, or ALIAS/ANAME, with the value Render shows.)
3. At your registrar's DNS settings, add exactly that record. If the domain uses Cloudflare, set the record to **DNS only** (grey cloud) so Render can issue the certificate.
4. Back in Render, click **Verify**. Once it shows Verified and Certificate issued (minutes, sometimes a few hours while DNS spreads), the site opens at `https://emr.yourclinic.com`. Render renews HTTPS on its own.

The `.onrender.com` address keeps working, so nothing breaks while DNS spreads. Signed-in staff are signed out once when they move to the new address (the sign-in cookie belongs to the old one), and each person's open-patient tabs start fresh. Two-step codes keep working.

## Your own name and look

The product name, logo and accent color come from environment variables, so changing them needs no code change. Set them on the web service (**Environment**), save, and Render redeploys.

| Variable | What it changes | Default |
|---|---|---|
| `MERIDIAN_APP_NAME` | The name in the top bar and on the sign-in page | `Meridian` |
| `MERIDIAN_APP_FULL_NAME` | Browser tab titles, printouts, and the name in authenticator apps for newly set-up two-step sign-in | `Meridian EMR`, or `MERIDIAN_APP_NAME` if that is set |
| `MERIDIAN_LOGO_URL` | Logo next to the name, and the browser tab icon. An `https://` link to a square PNG or SVG. | The built-in mark |
| `MERIDIAN_ACCENT_COLOR` | Buttons, links and highlights. A hex color such as `#0f8a8a`; anything else is ignored. | Teal `#0f8a8a` |

Staff who set up two-step sign-in before a rename still see the old name in their authenticator app; their codes keep working, and the code screen tells them to look for either name. The `MERIDIAN_*` variable names stay as they are.

## 5. Check before staff use it

- [ ] The sign-in page lists no demo accounts and says "not yet approved for real patient information".
- [ ] Register a test patient, book a visit for today, and check the times show in the clinic's time zone.
- [ ] Set up backups and run both restore drills: [BACKUPS.md](BACKUPS.md).
- [ ] Turn on Render's notifications for failed deploys and service downtime, and add an outside uptime check (e.g. UptimeRobot, Better Stack) on `/login`.

## Updating

Merging to `main` redeploys automatically; the pre-deploy step applies new migrations first. Never run `npm run db:seed` or `npm run db:reset` against the live database. Both refuse in production, and refuse on any database with real accounts.

Backups, restore drills and what to do if data is lost: [BACKUPS.md](BACKUPS.md).

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
