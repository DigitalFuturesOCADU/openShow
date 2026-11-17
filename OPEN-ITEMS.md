# Open items

Everything outstanding, in one place. [EXECUTION.md](EXECUTION.md) is the plan,
[RUNNING-A-SHOW.md](RUNNING-A-SHOW.md) is how to operate it, and this is what
the plan is still waiting on.

Ordered by when it bites, not by size.

---

## 0. Credentials and student data were public — rotate them

From 2026-08-04 to 2026-11-17 this public repository contained the WordPress
database dump, the WordPress export and the 2025 submission spreadsheet. Between
them: password hashes for all 16 WordPress accounts, the stored mail-server
password, hosting and plugin tokens (Bluehost/Newfold, Envato, licence keys),
and the email addresses of 40 student submitters and 15 site users.

**Done (2026-11-17):** the files are untracked and ignored everywhere, purged
from every commit, and the rewritten history force-pushed. Local copies remain
in `sources/` and at the repo root, outside git.

**Still to do — none of this can be done from the repository:**

- [ ] Reset the passwords on all 16 WordPress accounts on df.show and sign
      every session out. df.show is still live WordPress, so these are live.
- [ ] Check the WordPress user list for administrators nobody recognises.
- [ ] Rotate the mail-server password and the Bluehost/Newfold, Envato and
      plugin licence tokens.
- [ ] Ask GitHub Support to purge cached views of the removed commits (they
      stay reachable by hash until GitHub garbage-collects them). Old head was
      `634dee5`; the files were added in `ff739a5`.
- [ ] Decide whether OCAD U's privacy office needs to know about the student
      emails.
- [ ] Anyone who cloned the repository before 2026-11-17 should delete the
      clone and clone again.

Assume the files were copied while public. Rotation is the fix; the purge only
stops further exposure.

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

### 1.3 D7 — images in a second repository — **done**

Web masters live in `DigitalFuturesOCADU/openShow-images`, checked out to
`content/images` by the deploy workflow. This repository stays small so a
colleague can clone it without waiting for 700 photographs, and CI takes both so
the published site is complete. Live on GitHub Pages since 2026-08-04.

Not Git LFS: an LFS checkout in Actions spends its full size against a 10 GB
monthly bandwidth allowance on *every build* — roughly 44 builds, failing at the
end of a busy month rather than when anyone would notice.

---

## 2. Data a human has to supply

### 2.1 Alt text for 704 images

Cannot be migrated — WordPress recorded it on 14 of 850 attachments, and those
were placeholders. Currently generated as `"Title — image 2 of 5"`, which is
honest but poor.

Fixed going forward by adding the question to the intake form
([INTAKE-FORM.md](INTAKE-FORM.md) §1b). The 704 already in the archive need
writing by someone who saw the work, or they stay as they are.

### 2.2 Names — mostly resolved

Two rounds of hand-confirmed merges and spelling fixes (2026-08-04 and
2026-11-17) took the register from 315 to 301 people. All are in `aliases:` in
[config/people.yaml](config/people.yaml). Projects show the confirmed name; the
credit as submitted stays in `creditsRaw`, and each person page lists the other
forms they were credited under.

**Still unresolved**, listed in the same file: seven credits that exist only as
a first name or initial — Jamie, Peiheng, Joe, Ozan, Raza, Maryam, L Wilkins —
and `Magdalena Szlapczynskials`, whose surname looks garbled. Nothing in the
export or the 2025 sheet completes them; class lists would.

Never merged automatically: two real people can have names a letter apart, and
a wrong merge erases someone's credit.

### 2.3 Eight projects with no resolvable year

Listed in `reports/unresolved.md`. Six are drafts; **`Diver` and `MetaHospital`
are published**, so they are absent from every show page. Post dates are shown
as a hint but are not reliable. Record decisions in `config/overrides.yaml`.

### 2.4 `Blade & Coin` affiliation

The last 2025 project without one — it has no row in the submission sheet.
2025 is otherwise 37/38.

### 2.5 D5 — affiliation is a public filter — **decided**

Settled by making the affiliation on a project page clickable: it now leads to
`/affiliation/<slug>`, listing that group's work grouped by show.

Two caveats the pages state rather than hide. 14 of 240 published projects carry
no affiliation, so they appear under none of them. And a project recording more
than one affiliation cannot say which member of the team held which, so it shows
under each — the page says how many of its works that applies to.

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

No archived show has a logo, poster or team photo — it was never recorded. Show
pages render only what they have. If material surfaces later it drops into
`config/overrides.yaml` under a `show:<id>` key with no code change.

Date, time, location and rooms **have** been recovered for the four shows whose
WordPress "Events" or "About" page stated them, and transcribed by hand into
overrides. **2019 (both), 2021 and 2024 have none** — those pages never existed,
and there is nowhere to recover them from. Those show pages show their title and
work count only.

### 3.4 External links: 93 of 235 are dead

Checked 2026-08-04 by `scripts/check-links.mjs`. 111 resolve, 31 redirect,
and **93 link nowhere** — 40%. That is decay rather than a migration fault;
they were live when submitted.

The pattern matters more than the number: **38 of the 93 are `blog.ocad.ca`**,
one decommissioned university platform, plus 5 on `webspace.ocad.ca`. This is
mostly one host going away, not scattered rot — which means a single archival
effort could recover a lot of it.

Dead links are simply not shown. A struck-through label is clutter on a page
whose job is to present the work. The status stays recorded in the project file
and in `config/link-status.json`, so nothing is lost — a re-check can bring a
link back if a host returns, and the data is there if anyone wants to attempt
recovery from the Internet Archive.

Re-check with `node scripts/check-links.mjs --stale 30`. Results live in
`config/link-status.json` and are stamped onto projects by extract.

---

## 4. Not started

- **Multi-facet filtering was dropped** with /browse. Topics filter by medium
  only; combining medium + year + affiliation is no longer possible in the
  interface. The data still supports it if it is wanted back.
- **Per-show theme tokens** — the mechanism works; no design direction yet.
- **Project page layout** — matches the original three-column shape; flagged as
  needing more work.
- **Deploy** (Step 6) — on GitHub Pages as a placeholder. The permanent home
  waits on the wider site reorganisation (D6).
- **CMS** (Step 8) — deliberately deferred; the spreadsheet covers it.
- **Consent split** — one 2025 submission answered "No" and is still in the
  archive. Ingest flags it; a human still has to read the flag.
