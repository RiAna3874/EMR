# Drug lists: Bangladesh brands and worldwide generic names

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

## Worldwide generic names (RxNorm and Wikidata)

The second list on **Admin > Drug list** holds a generic name for every medicine in the
world, so a generic can be prescribed or recorded even when no Bangladeshi brand of it is
registered. It joins three free sources:

- **RxNorm ingredients** from the US National Library of Medicine (`rxnav.nlm.nih.gov`,
  public, no account needed).
- **Wikidata medicines** (`query.wikidata.org`, CC0 public domain): the international
  name (paracetamol, salbutamol) shown as the main name, other names (acetaminophen,
  albuterol), Bangla names, and WHO ATC codes. Medicines RxNorm lacks, such as
  domperidone, come from Wikidata alone.
- **ATC class names** from RxNorm's copy of the WHO ATC classification, so a search for a
  class ("macrolide", "ACE inhibitor", "proton pump") finds the generics in it.

Click **Download from RxNorm and Wikidata** once, then refresh now and then. If the live
server can't reach those sites, run `npm run drugs:generics` with `DATABASE_URL` pointing
at the live database. `MERIDIAN_RXNORM_URL`, `MERIDIAN_ATC_URL` and `MERIDIAN_WIKIDATA_URL`
point the download elsewhere.

A generic picked from this list is stored as `GENERIC:<id>:<name>` and has no strength or
form: the prescriber writes the dose, frequency and amount.

## What the safety checks know

Neither list has doses or interactions. Those come from the clinic's own reviewed table in
`src/lib/meds/drugs.ts`, which covers about 220 generics common in Bangladesh: daily
maximums where one adult limit holds, kidney and older-adult cautions, interactions and
duplicate therapy. A generic it doesn't know shows "The clinic's safety checks don't know
… yet".
