# Go-live readiness

Status as of 2026-10-13. **Meridian is not ready to hold real patient information.** It can go online now for staff training and test patients. The items below have to be done first, and the legal ones depend on the country the clinic is in.

## 1. The law and the paperwork

Which rules apply depends on the country:

- **United States: HIPAA.** You need a signed **Business Associate Agreement (BAA)** with every company that stores or sees patient data: the host (Render's HIPAA-enabled workspace, or AWS/Azure/Google), Anthropic if the photo import stays on (it sends the image of each report to Claude), and any email or monitoring service that could see patient details. You also need a written security risk assessment, a named privacy and security officer, staff training, and a breach notification procedure.
- **EU / UK: GDPR** (UK also NHS Data Security and Protection Toolkit for NHS work). A Data Processing Agreement with each processor, a Data Protection Impact Assessment, a lawful basis for processing health data, and data kept in the region.
- **Elsewhere:** most countries have a health-data or privacy law with the same shape (e.g. Canada PIPEDA and provincial laws like PHIPA, India's DPDP Act, Australia's Privacy Act). Some require data to stay in the country, which decides the hosting region.

**Anthropic (photo import):** the import feature sends report images to the Claude API. For real patient data you need Anthropic's BAA (US) or data processing terms, arranged through Anthropic's sales team, and the account configured for it. Until then, leave `ANTHROPIC_API_KEY` unset on the live site. Import then switches itself off.

## 2. What the app still lacks

| Need | Status | Why it matters |
|---|---|---|
| Staff accounts made by an admin, no demo accounts | **Done** in the go-live prep change | Each person has their own login, deactivated when they leave |
| First-run setup with a secret code | **Done** | Nobody else can claim the new site |
| Admin-issued temporary passwords, forced change at first sign-in | **Done** | |
| Synthetic data blocked from production | **Done** | Seed and reset refuse on a live database |
| Audit log of who viewed and changed each chart | **Missing** | Required by HIPAA and GDPR; the first thing asked after a privacy complaint |
| Two-factor sign-in (MFA) | **Missing** | A stolen password otherwise opens every chart |
| Self-service password reset by email | **Missing** (admins can reset) | Needs an email provider under a BAA |
| Rate limiting that survives restarts and multiple servers | **Partial** (5 tries per minute per username, in memory) | Stops password guessing |
| Backups with a tested restore | **Host feature**, must be switched on and practised | Losing a chart is a patient-safety event |
| Encryption at rest | **Host feature** (Render Postgres encrypts disks) | Uploaded documents are stored in the database |
| Security review / penetration test | **Not done** | Independent check before real data |
| Uptime and error monitoring | **Not set up** | You find out before the clinic does |
| Downtime procedure and data export | **Not done** | Clinics must keep working when the system is down |

## 3. Clinical safety limits

These are fine for a demo and not for real care:

- **Drug checks** (interactions, dose limits, kidney dosing) come from a small hand-written table, not a licensed, maintained drug database. Real prescribing needs one (e.g. First Databank, Medi-Span, or a national formulary service).
- **E-prescribing and pharmacies are simulated.** Nothing is sent to a real pharmacy, and the pharmacy list is empty on a fresh site. Real e-prescribing needs a certified network (Surescripts in the US).
- **Lab results** arrive only by photo import or manual review. There's no live interface to a lab.
- The **drug and order catalogues** are small samples.

## 4. Suggested order

1. Tell us the country. That fixes the law, the agreements and the hosting region.
2. Deploy now for training with test patients only (see [DEPLOY.md](DEPLOY.md)).
3. Sign the hosting BAA/DPA; decide whether to keep the photo import and, if so, sign with Anthropic.
4. Build the audit log and MFA; set up monitoring and practise a backup restore.
5. Decide on a licensed drug database and real e-prescribing, or turn prescribing off and print only.
6. Independent security review, written policies, staff training.
7. Then set `MERIDIAN_CLEARED_FOR_REAL_PATIENTS=1` and start with real patients.
