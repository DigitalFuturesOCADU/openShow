# Open items

Everything outstanding, in one place. [EXECUTION.md](EXECUTION.md) is the plan;
this is what the plan is still waiting on.

Ordered by when it bites, not by size.

---

## 1. Blocking the next real use

### 1.1 SharePoint filename resolution is UNVERIFIED — *the one to watch*

**Status:** written, never run against real data.

`scripts/ingest.mjs` matches a submission's uploaded files by looking up the
filename from the response sheet in a synced folder. Microsoft Forms writes
uploads as `<original>_<Submitter Name>.<ext>` — for example:

```
WhatsApp Image 2025-11-11 at 19.32.19 (1)_Srikripa Krishnan.jpeg
```

That naming holds in the **URLs recorded in the 2025 response sheet**, which is
what the matching was built against. It has **never been checked against a
folder actually synced by the OneDrive/SharePoint client**, because no such
folder was available. If the client rewrites names — truncating, deduplicating,
dropping the suffix — every file misses at once.

**Why it matters:** the failure is total rather than partial, and would
otherwise be silent. A whole year's submissions would ingest with no images.

**Mitigation already in place:** ingest detects the signature of this failure —
zero matches against a non-empty folder — and says so explicitly rather than
listing 130 individual missing files.

**To resolve:** sync one real folder, run

```bash
node scripts/ingest.mjs --sheet <sheet>.xlsx --show 2026 --media <folder> --dry-run
```

and compare a filename in the sheet against one on disk. If they differ, the fix
is confined to `resolveMedia()` in `scripts/ingest.mjs`. Ten minutes with real
data; unresolvable without it.

### 1.2 D6 — canonical domain vs. subpath

**Downgraded.** This was blocking because moving to a subpath would break every
existing `df.show` URL. URL preservation has since been dropped — the
re-organisation changes them anyway — so this is now a preference, not a cost.

The build reads `base` and `site` from the environment, so either choice works
without code changes. Still needed before Step 6 can ship, but nothing hangs on
which way it goes.

### 1.3 D7 — images in plain git or LFS

220 MB, 704 files. Recommendation: plain git. Images arrive in one annual batch
and never change afterwards, which is the case LFS does not help with. GitHub's
repository size limit is a policy ceiling that cannot be bought past, but at
~75 MB/year it is a decade away.

`content/images/` is git-ignored pending this; regenerating takes about three
minutes with `node scripts/sync-media.mjs`.

---

## 2. Data a human has to supply

### 2.1 Alt text for 704 images

Cannot be migrated — WordPress recorded it on 14 of 850 attachments, and those
were placeholders. Currently generated as `"Title — image 2 of 5"`, which is
honest but poor.

Fixed going forward by adding the question to the intake form
([INTAKE-FORM.md](INTAKE-FORM.md) §1b). The 704 already in the archive need
writing by someone who saw the work, or they stay as they are.

### 2.2 Five probable name typos

[config/people.yaml](config/people.yaml) lists them as comments, unapplied:

| | |
| --- | --- |
| `Mika MacLOear Wall` ↔ `Mika Maclear-Wall` | distance 1 |
| `Salisa Jatuweerapong` ↔ `Salisa Jatweerapong` | distance 1 |
| `Josh Igwe` ↔ `Joshua Igwe` | distance 2 |
| `Aileen Dong` ↔ `Ailin Dong` | distance 2 |

Never merged automatically: `Aileen`/`Ailin` may well be two different people,
and merging would erase someone's credit. Move confirmed ones into `aliases:`
and re-run extract.

### 2.3 Eight projects with no resolvable year

Listed in `reports/unresolved.md`. Six are drafts; **`Diver` and `MetaHospital`
are published**, so they are absent from every show page. Post dates are shown
as a hint but are not reliable. Record decisions in `config/overrides.yaml`.

### 2.4 `Blade & Coin` affiliation

The last 2025 project without one — it has no row in the submission sheet.
2025 is otherwise 37/38.

### 2.5 D5 — is affiliation a public filter?

Affects the browse UI, not the schema. Worth knowing: 60 of 264 projects carry
no affiliation, and affiliation on a mixed team is recorded per project rather
than per person until the form change lands.

---

## 3. Known-imperfect, working as intended

### 3.1 Mixed-team affiliation is approximate

10 projects have both a mixed team and more than one person, so their 40 people
generate 90 participant entries — a 125% over-count. There is no correct answer
for historical data; the reports and person pages disclose the estimate rather
than presenting it as fact. Resolved for new data by
[INTAKE-FORM.md](INTAKE-FORM.md) §1d.

### 3.2 Forty-nine images are under 600px wide

Two are 288×216. No pipeline fixes this; it constrains what a large-format
layout can honestly do.

### 3.3 Show identity is forward-looking

No archived show has a logo, poster, team photo, venue or dates — it was never
recorded. Show pages render only what they have. If material surfaces later it
drops into `config/overrides.yaml` under a `show:<id>` key with no code change.

### 3.4 External links: 93 of 235 are dead

Checked 2026-08-04 by `scripts/check-links.mjs`. 111 resolve, 31 redirect,
and **93 link nowhere** — 40%. That is decay rather than a migration fault;
they were live when submitted.

The pattern matters more than the number: **38 of the 93 are `blog.ocad.ca`**,
one decommissioned university platform, plus 5 on `webspace.ocad.ca`. This is
mostly one host going away, not scattered rot — which means a single archival
effort could recover a lot of it.

Dead links are not presented as working. The project page strikes them through,
says "no longer available", and offers an Internet Archive lookup, which often
still holds the page.

Re-check with `node scripts/check-links.mjs --stale 30`. Results live in
`config/link-status.json` and are stamped onto projects by extract.

---

## 4. Not started

- **Per-show theme tokens** — the mechanism works; no design direction yet.
- **Project page layout** — matches the original three-column shape; flagged as
  needing more work.
- **Deploy** (Step 6) — needs D6.
- **CMS** (Step 8) — deliberately deferred; the spreadsheet covers it.
- **Consent split** — one 2025 submission answered "No" and is still in the
  archive. Ingest flags it; a human still has to read the flag.
