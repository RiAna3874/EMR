# Go-live readiness

Status as of 2026-10-13. **Meridian is not ready to hold real patient information.** It can go online now for staff training and test patients. The items below have to be done first.

## 1. The law and the paperwork

The clinic is in **Bangladesh**. As far as we could check (not legal advice; confirm with a Bangladeshi lawyer):

- Bangladesh now has a data protection law: the **Personal Data Protection Ordinance 2025** (Ordinance 61 of 2025, gazetted November 2025), which Parliament reportedly replaced with the **Personal Data Protection Act 2026** in April 2026. Some duties phase in over 18 months, to about May 2027.
- **Health data is sensitive personal data.** Processing it needs the patient's specific consent or another legal basis (medical care and emergencies are recognised).
- You must keep it secure (encryption, the ability to restore after an incident, regular testing) and report a breach likely to cause significant harm to the National Data Governance Authority.
- **Storage location:** the 2025 Ordinance required "confidential" and "restricted" data to be stored inside Bangladesh, and limited transfers abroad. Summaries of the 2026 Act describe transfer controls rather than a blanket rule. Which tier patient records fall in is the key question for the lawyer, because it decides whether hosting in Singapore is allowed.
- Fines run up to 25 lakh taka for security failures, more for large data handlers.

Sources: [Mahbub & Company summary](http://mahbub-law.com/key-highlights-of-the-personal-data-protection-ordinance-2025-for-businesses/), [Securiti overview of the 2026 Act](https://securiti.ai/bangladesh-personal-data-protection-act-overview/), [BSS: no localisation mandate](https://www.bssnews.net/news/324658), [ordinance text](https://www.dpo-india.com/Resources/Privacy_Regulations_in_Asia_Pacific_Countries/Bangladesh-Personal-Data-Protection-Ordinance,2025(Ordinance.No.61-2025).pdf).

**Anthropic (photo import):** the import feature sends report images to the Claude API, outside Bangladesh. Under the law above that is a transfer of health data abroad, so leave `ANTHROPIC_API_KEY` unset on the live site until the lawyer says it's allowed and patients' consent covers it. Import then switches itself off.

For reference, other countries:

- **United States: HIPAA.** You need a signed **Business Associate Agreement (BAA)** with every company that stores or sees patient data: the host (Render's HIPAA-enabled workspace, or AWS/Azure/Google), Anthropic if the photo import stays on (it sends the image of each report to Claude), and any email or monitoring service that could see patient details. You also need a written security risk assessment, a named privacy and security officer, staff training, and a breach notification procedure.
- **EU / UK: GDPR** (UK also NHS Data Security and Protection Toolkit for NHS work). A Data Processing Agreement with each processor, a Data Protection Impact Assessment, a lawful basis for processing health data, and data kept in the region.
- **Elsewhere:** most countries have a health-data or privacy law with the same shape (e.g. Canada PIPEDA and provincial laws like PHIPA, India's DPDP Act, Australia's Privacy Act). Some require data to stay in the country, which decides the hosting region.


## 2. What the app still lacks

| Need | Status | Why it matters |
|---|---|---|
| Staff accounts made by an admin, no demo accounts | **Done** in the go-live prep change | Each person has their own login, deactivated when they leave |
| First-run setup with a secret code | **Done** | Nobody else can claim the new site |
| Admin-issued temporary passwords, forced change at first sign-in | **Done** | |
| Synthetic data blocked from production | **Done** | Seed and reset refuse on a live database |
| Access log of who viewed, printed and changed each chart, and every sign-in | **Done** (Admin → Access log, CSV download; entries can't be edited or deleted) | Required by HIPAA and GDPR; the first thing asked after a privacy complaint |
| Two-step sign-in (password plus an authenticator app code) | **Done**, required for every account on the live site; admins reset it for a lost phone | A stolen password otherwise opens every chart |
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
- **E-prescribing and pharmacies are simulated.** Nothing is sent to a real pharmacy, and the pharmacy list is empty on a fresh site. Until there's a real pharmacy connection, use printed prescriptions.
- **Lab results** arrive only by photo import or manual review. There's no live interface to a lab.
- The **drug and order catalogues** are small samples.

## 4. Suggested order

1. Ask a Bangladeshi lawyer whether patient records must stay in Bangladesh, and get a patient consent form drafted.
2. Deploy now for training with test patients only (see [DEPLOY.md](DEPLOY.md)).
3. Settle hosting from the lawyer's answer (Singapore, or a Bangladesh data centre); decide whether the photo import stays on.
4. ~~Build the audit log and MFA~~ (done); set up monitoring and practise a backup restore.
5. Decide on a licensed drug database and real e-prescribing, or turn prescribing off and print only.
6. Independent security review, written policies, staff training.
7. Then set `MERIDIAN_CLEARED_FOR_REAL_PATIENTS=1` and start with real patients.
