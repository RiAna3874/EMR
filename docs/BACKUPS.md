# Backups and restore

Losing a chart is a patient-safety event, so Meridian's records are protected three ways. Everything a chart holds, uploaded documents included, lives in the one Postgres database, so backing up the database backs up everything.

| Layer | What it covers | How far back | Where it lives |
|---|---|---|---|
| **Render point-in-time recovery** | A mistake or bad change: roll back to any minute | 3 days (Hobby workspace) or 7 days (Professional and up) | Render |
| **Off-site encrypted backup** (this change) | Losing the Render database or the Render account itself; anything older than the recovery window | Every 6 hours, kept 90 days | A storage bucket at a different company (AWS, Singapore) |
| **Render manual export** | A snapshot before a risky change | Kept 7 days | Render |

Every off-site backup is **restored and checked before it is uploaded**: the job restores it into a throwaway database and checks every table has exactly the rows it had when the backup was taken. A backup that doesn't restore fails the job, and Render emails you. The backup is encrypted before it leaves Render, and only a private key you keep off the server can open it.

You still practise a restore yourself ([drills below](#restore-drills)), because the only proof is restoring one.

Set this up once (about an hour). You need: your Render login, a credit card for AWS (storage costs well under a dollar a month), and Docker Desktop on your Mac.

## 1. Check the Render database plan

1. In Render, open **meridian-db** (your Postgres). The **Info** page shows the plan and the **PostgreSQL version**: note the version (e.g. 16).
2. If the plan is **Free**, change it: **Settings → Instance type**, pick a paid plan. Free databases have no recovery at all, and Render deletes them after 30 days.
3. Open **Recovery**. Under **Point-in-Time Recovery** it shows how far back you can restore. That's 3 days on a Hobby workspace and 7 on Professional ([Render: backups](https://render.com/docs/postgresql-backups)). Seven is worth it once real patients are in.

## 2. Make the backup key

The backup job encrypts with a public key; you keep the private key. **If you lose the private key, every backup is unreadable**, so keep two copies.

On your Mac, in the Meridian folder:

```bash
git pull
docker build -t meridian-backup -f backup/Dockerfile .
mkdir -p ~/meridian-keys
docker run --rm -v ~/meridian-keys:/keys meridian-backup age-keygen -o /keys/meridian-backup-key.txt
```

(If the Render database isn't PostgreSQL 16, add `--build-arg PG_MAJOR=17`, or whichever version step 1 showed, to the `docker build` line.)

It prints `Public key: age1...`. Copy that line; it goes into Render in step 4. It isn't secret.

The file `~/meridian-keys/meridian-backup-key.txt` is the private key:

- Print it and keep the paper in the clinic safe, or copy it to a USB stick kept there. That's your second copy.
- Never put it on Render, in GitHub, in email or in chat.
- Optional: a second person (a partner or practice manager) makes their own key the same way; put both public keys in step 4, separated by a space, and either key can open the backups.

## 3. Make the off-site storage (AWS S3)

It sits at a different company from Render on purpose: if the Render account is locked, deleted or broken into, these copies survive. Singapore keeps the data in the same country as the live database (the same legal question as hosting; see [GO-LIVE.md](GO-LIVE.md)).

1. Create an account at [aws.amazon.com](https://aws.amazon.com) (**Create an AWS Account**). Turn on two-step sign-in for it: account menu (top right) → **Security credentials** → **Assign MFA device**.
2. **Bucket.** Search **S3** → **Create bucket**.
   - Region: **Asia Pacific (Singapore) ap-southeast-1** (region menu at the top right).
   - Bucket name: e.g. `meridian-backups-yourclinic` (must be unique worldwide).
   - Leave **Block all public access** ticked.
   - **Bucket Versioning: Enable.**
   - Leave encryption as it is. **Create bucket.**
3. **Keep 90 days.** Open the bucket → **Management → Create lifecycle rule**.
   - Name `keep-90-days`, **Apply to all objects in the bucket** (tick the acknowledgement).
   - Tick **Expire current versions of objects**: 90 days. Tick **Permanently delete noncurrent versions of objects**: 30 days.
   - **Create rule.**
4. **A key that can only upload.** Search **IAM** → **Users → Create user**.
   - Name `meridian-backup-uploader`, no console access. **Next.**
   - **Attach policies directly → Create policy** (opens a tab) → **JSON**, replace everything with the text below (put your bucket name in), **Next**, name it `meridian-backup-upload-only`, **Create policy**.

     ```json
     {
       "Version": "2012-10-17",
       "Statement": [{ "Effect": "Allow", "Action": "s3:PutObject", "Resource": "arn:aws:s3:::meridian-backups-yourclinic/*" }]
     }
     ```

   - Back in the first tab, refresh the policy list, tick `meridian-backup-upload-only`, **Next → Create user**.
   - Open the user → **Security credentials → Create access key** → **Application running outside AWS** → **Create**. Copy the **Access key** and **Secret access key** (the secret is shown once).

   This key can add backups but can't read, list or delete them, so even someone who got into Render couldn't destroy or read the off-site copies.

## 4. Add the backup job on Render

**New → Cron Job**, connect GitHub, pick `RiAna3874/EMR`.

| Setting | Value |
|---|---|
| Name | `meridian-backup` |
| Branch | `main` |
| Region | **Singapore** (same as the database) |
| Runtime | **Docker** |
| Dockerfile path | `./backup/Dockerfile` |
| Docker Build Context Directory (under Advanced) | leave as `.` |
| Schedule | `15 */6 * * *` (every 6 hours: 6:15, 12:15, 18:15 and 0:15 Dhaka time) |
| Command | leave empty |
| Instance | Starter |

Environment variables:

| Variable | Value |
|---|---|
| `DATABASE_URL` | The database's **Internal Database URL** (same as the web service) |
| `BACKUP_AGE_RECIPIENTS` | The `age1...` public key from step 2 (two keys: separated by a space) |
| `S3_BUCKET` | Your bucket name |
| `S3_REGION` | `ap-southeast-1` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | From step 3 |
| `PG_MAJOR` | Only if the database isn't PostgreSQL 16: its version, e.g. `17` |
| `BACKUP_HEARTBEAT_URL` | Optional, see step 5 |

**Create Cron Job**. When the build finishes, press **Trigger Run** to take the first backup now. Its **Logs** should end with:

```
Restore check passed: 28 tables, ... rows, every count identical.
Patients:          ...
Uploading daily/meridian-2026-10-13T061500Z.tar.age ...
Backup meridian-2026-10-13T061500Z.tar.age done.
```

In AWS, the bucket now has a `daily/` folder with that file.

The job costs a few cents a month on Render (billed only while it runs, under a minute for a clinic-sized database).

## 5. Get told when a backup fails or doesn't run

- **Failures:** in Render, **Workspace Settings → Notifications**, make sure failed cron job runs email you.
- **A backup that never runs** (job deleted, Render down) sends no failure. Catch it with a free monitor: at [healthchecks.io](https://healthchecks.io) add a check with period **6 hours** and grace **2 hours**, copy its ping URL into `BACKUP_HEARTBEAT_URL` on the cron job, and set it to email you. The job pings it after every good backup; if pings stop, you get an email.

## Restore drills

Do both once now, then put them in the calendar: drill A every month, drill B every three months, and both after any big change to hosting. Write down the date and the result each time; an inspector or lawyer will ask.

### A. Render point-in-time recovery (about 15 minutes)

1. In Render, **meridian-db → Recovery → Restore Database**. Name `meridian-db-drill`, a time about an hour ago, **Copy Existing Settings: Yes**, **Start Recovery**. Wait for **Available**.
2. On the new database's **Info** page, copy the **External Database URL**, then on your Mac:

   ```bash
   docker run --rm meridian-backup check-db.sh 'PASTE-EXTERNAL-URL'
   ```

   Pass: the patient and staff counts match the live site (unless someone registered a patient in the last hour), and **Newest access log** is a minute or two before the time you picked, since the app logs every chart opened. If it can't connect, add your network address under the drill database's **Networking** (access control) settings.
3. **Delete** `meridian-db-drill` (**Settings → Delete Database**); it's billed while it exists.

### B. Off-site backup (about 15 minutes)

1. In AWS, **S3 → your bucket → daily/**, tick the newest file, **Download**. (Your own AWS sign-in can download; the backup job's key can't.)
2. Start the local database if it isn't running (`docker compose up -d`), then:

   ```bash
   docker run --rm -v ~/Downloads:/backups -v ~/meridian-keys:/keys meridian-backup \
     restore-drill.sh /backups/meridian-2026-10-13T061500Z.tar.age
   ```

   Pass: it ends with `Restore check passed ... every count identical` and `Restore passed`, and the patient count and newest access log time look right.
3. Optional, to see the charts with your own eyes: `DATABASE_URL=postgresql://meridian:meridian@localhost:5432/meridian_restored npm run dev`, sign in with your live username, password and authenticator code, and open a few charts.
4. Clean up, because this is real patient data on your laptop:

   ```bash
   docker compose exec db psql -U meridian -c "DROP DATABASE meridian_restored"
   rm ~/Downloads/meridian-*.tar.age
   ```

   Keep the Mac's disk encrypted (**System Settings → Privacy & Security → FileVault** on).

## If you really lose data

**Something wrong in the last few days** (records deleted by mistake, a bad change): use point-in-time recovery to just before it happened, as in drill A step 1, and check the copy (step 2). Then point the app at it: **web service → Environment → `DATABASE_URL`** = the new database's Internal URL → **Save, rebuild and deploy**. Do the same on the backup cron job. Keep the old database until you're sure, then delete it. Anything entered after the chosen time is not in the copy, so note what the clinic entered since and re-enter it.

**The Render database or account is gone, or the problem is older than the recovery window:**

1. Create a new Postgres in Render (or another host) with the same PostgreSQL version, as in [DEPLOY.md](DEPLOY.md) step 1.
2. Download the newest good backup from S3 (or the last one before the problem).
3. Restore it straight into the new, empty database using its External URL:

   ```bash
   docker run --rm -v ~/Downloads:/backups -v ~/meridian-keys:/keys meridian-backup \
     restore-drill.sh /backups/meridian-....tar.age 'PASTE-NEW-EXTERNAL-URL'
   ```

   It refuses a database that already has tables, so it can't overwrite anything.
4. Point the web service and the backup job at the new database's Internal URL, as above, and deploy. Everyone signs in as before (passwords and two-step carry over). At most the last 6 hours are missing.

## Before a risky change

Before anything that touches a lot of data (a big import, moving hosts, a large update), take a manual snapshot: **meridian-db → Recovery → Create export**. Render keeps it 7 days, and it doesn't replace the steps above.
