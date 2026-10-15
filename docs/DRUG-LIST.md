# Bangladesh drug list (DGDA registry)

SAFIX can search every drug product registered with the Directorate General of Drug
Administration (DGDA): about 39,000 brands, each with its generic and strength, dosage
form, company and DAR number. The list comes from the DGHS national terminology server
(an Open Concept Lab server, `tr.ocl.dghs.gov.bd`), which publishes it for health systems
to use. It is public and read-only; no account is needed.

The registry has **no doses, indications or interactions**. Picking a registered brand
fills in its strength and form; the prescriber writes the frequency and amount. The
clinic's safety checks (allergies, interactions, dose limits, kidney function) run on the
generic in the brand's name when `src/lib/meds/drugs.ts` knows that generic. When it
doesn't, the prescription shows "The clinic's safety checks don't know … yet".

## Loading and refreshing it

After `npm run db:migrate`, an administrator opens **Admin > Drug list** and clicks
**Download from DGDA**. The server pages through the registry (a few minutes) and
replaces the list in one step; the old list stays in use until the download finishes.
Click **Refresh from DGDA** now and then to pick up newly registered brands.

If the live server can't reach the DGHS server, load the list from a computer that can,
pointing `DATABASE_URL` at the live database:

```
npm run drugs:dgda                          # download and save
npm run drugs:dgda -- --save dgda.json      # also keep a copy of the download
npm run drugs:dgda -- --file dgda.json      # load a saved copy instead of downloading
```

`MERIDIAN_DGDA_URL` points the download somewhere else (a mirror, or a test server).

## How prescriptions refer to a brand

A prescription or medication-list entry for a registered brand stores the brand in its own
code, `DGDA:<DAR number>:<name>`, so it prints and refills the same way even if the brand
later leaves the registry or the list is refreshed.
