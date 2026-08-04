# Execution plan

Companion to [PLAN.md](PLAN.md). PLAN.md is the original brief and stays as written. This is the verified starting state, the expanded requirements, and the build order.

**Revision 3.** Revision 2 added multi-media, per-show theming, layout flexibility, archive tiering and broader-site integration. This revision records what execution changed — most significantly that the submission question answered itself (§3, D3).

## Status

| Step | State |
| --- | --- |
| 1 — Lock sources | **Done.** `sources/` is read-only with SHA-256 manifests |
| 2 — Extract | **Done.** 264 projects, 19 gates, independent SQL cross-validation |
| 3 — Taxonomy | **Done.** 189 terms → 27 medium + 5 affiliation |
| 4 — Media | **Done.** 704 images resolved to true originals; web masters built |
| 5 — Astro site | **Next** |
| 6 — Deploy | After 5. Needs D6 |
| 7 — Submissions | **Done early.** `scripts/ingest.mjs`, tested against the real 2025 sheet |
| 8 — CMS | Deferred. The spreadsheet covers it (D3) |

Outstanding work is tracked in [OPEN-ITEMS.md](OPEN-ITEMS.md). The one to know
about before the next submission round is §1.1: filename matching between the
response sheet and a synced SharePoint folder has never been run against real
data, and fails all-or-nothing.

**Goal A is discharged.** 264 projects, 342 people and 704 images survive with no dependency on WordPress.

Things that exist now and did not in revision 2:

- `scripts/ingest.mjs` — Microsoft Forms sheet → content, the ongoing intake
- `scripts/sync-media.mjs` — true originals → web masters
- `scripts/validate-sql.mjs` — independent cross-check from the SQL dump
- `content/people.json` — creator registry, 342 people, the gap WordPress never filled
- `config/overrides.yaml` — manual corrections that survive re-extraction
- `config/people.yaml`, `config/form-map.yaml` — reviewable inputs
- `INTAKE-FORM.md` — form changes for 2026

Notable during execution: 2025 affiliation went from 0/38 to 37/38, recovered from the Forms sheet; `rf_project_url` turned out to be the real link field, not `rf_project_ext_url` as PLAN.md had it; and alt text could not be migrated at all, because it was never recorded.

---

## Running a show

The operational sequence — announce, collect, ingest, review, publish — is
documented for whoever runs the show in **[RUNNING-A-SHOW.md](RUNNING-A-SHOW.md)**,
written for an organiser rather than a developer, with every command verified
against a real run.

Two gates decide whether work is public, and both default to letting it through:
a project is `draft` until reviewed, and a show is `open` unless explicitly set
to `announced`.

---

## 1. Pre-flight findings

Phase 0 is complete — all three artifacts are on disk. I verified them against the audit checksums in PLAN.md before planning anything.

**Confirmed exactly:**

| Check | Audit | Export | |
| --- | --- | --- | --- |
| Portfolio items | 264 | 264 | ✅ |
| Published / draft | 240 / 24 | 240 / 24 | ✅ |
| Attachments | 850 | 850 | ✅ |
| Distinct `royal_portfolio_cats` terms | 189 | 189 | ✅ |
| `royal_portfolio_skills` assignments | 0 | 0 | ✅ |
| Items with zero categories | 8 | 8 (6 draft, 2 publish) | ✅ |
| Year resolvable from term prefix | 256 | 256 | ✅ |
| Per-year counts | 50/58/11/37/30/32/38 | identical | ✅ |
| Gallery ID/URL length mismatches | 0 | 0 | ✅ |
| `Open Show 2023` parent term | missing | missing | ✅ |

The export is complete and faithful. Nothing was lost.

**Two integrity checks PLAN.md did not have, both clean:**

- All 850 attachment URLs resolve to files that exist in `uploads/`. **Zero missing.**
- Projects reference 704 distinct image IDs. **Zero dangling.** Phase 2's resolve-by-ID strategy works with no fallback needed.

**Five corrections to the audit.** None are blockers; all change the work:

1. **19 items have no featured image, not 3.** All 19 are drafts, and all 19 have no gallery either — no images at all. So of the 24 drafts, 19 are empty stubs and only 5 are real projects.
2. **All 240 published items have a featured image.** The completeness claim holds for published content.
3. **The non-ASCII slug is already percent-encoded in the WXR** as `catlike%ef%bc%9aemotion-responsive-wearables`. Every slug in the export is ASCII. The trap is inverted from PLAN.md's description — the risk is *decoding* it. Keep slugs verbatim and the fullwidth colon never reaches disk.
4. **15 empty slugs, not 14.** All drafts.
5. **3 projects have non-empty `post_content`, not zero.** Needs preserving rather than assuming-empty.

**Two things wider than PLAN.md assumed:**

- **22 pages, not 3.** 13 have content — one WPBakery, four Gutenberg, the rest plain. Phase 3 needs a triage step.
- **146 of 850 attachments are unreferenced by any project.** Page images, logos, theme assets. Excluded from the project pipeline, retained until pages are triaged.

---

## 2. Goals

PLAN.md's three outcomes, restated with the expanded requirements folded in.

**A. The archive survives independently.** 264 projects and seven years of student work currently live inside an unsupported theme with a known-risky slider plugin on a public university domain. The archive is fully recoverable *right now* — verified above. That window is open today and stays open only while nothing happens to the live site.

**B. Submission and publishing stop depending on one person's time.** Currently someone hand-enters 30–50 projects a year and resizes images. The data shows what that costs: 19 empty draft stubs, 8 items with no categories, and a parent term for 2023 that never got created.

**C. The archive stays queryable in ten years.** 189 terms for ~30 concepts is what happens without a controlled vocabulary. Cleaning it once is the smaller half; the input form preventing recurrence is the larger half.

**D. ~~Old URLs keep resolving.~~ DROPPED — the re-organisation changes them anyway.**

This was originally ranked near the top: students put these links on CVs and grad-school applications, and a dead link is a real cost to a specific person years later. That reasoning still holds in the abstract, but the site is being re-organised around shows and the archive, so the URLs change regardless. Accepted deliberately rather than by neglect.

Two consequences. **D6 stops being a conflict** — moving the archive to a path under a larger site no longer breaks a promise, so that decision is now about preference rather than cost. And `scripts/test-routes.mjs` keeps running, but its purpose changes: it now proves internal consistency — that all 264 slugs round-trip and no two resolve to the same URL, so nothing is unreachable *within* the new site.

If old links do matter later, redirects can be generated from `wordpress.link`, which every project record still carries.

**E. Presentation is flexible without being bespoke.** Per-show theming, per-project layout variants, and arbitrary re-slicing of the taxonomy — all without hand-editing HTML.

**F. Originals are preserved; derivatives are served.** Two tiers, permanently.

---

## 3. Decisions

| # | Decision | Status |
| --- | --- | --- |
| D1 | `uploads/` storage | **Decided** — git-ignored, backup confirmed off-machine |
| D2 | Deploy target | **Effectively decided** — Cloudflare, forced by video (§4.3) |
| D3 | Submission / review loop | **Superseded** — the spreadsheet is the CMS (below) |
| D4 | The 24 drafts | Proposed below |
| D5 | Is `affiliation` a public filter? | Open, not blocking |
| D6 | Canonical domain vs. subpath | Open, but **no longer a conflict** — see Goal D |
| D7 | Images: plain git or LFS | Open. 220 MB. Recommendation: plain git |

**D1 — DECIDED.** `uploads/` is git-ignored, backup confirmed off-machine. 3.0 GB, 8,603 files, of which 7,583 are WordPress derivatives the build regenerates. The tree stays local as source-of-truth; only the ~700 originals projects actually use get committed.

**D2 — Effectively decided by the video requirement.** Self-hosted video does not fit static-files-on-shared-hosting. See §4.4 for the numbers. Cloudflare Pages + R2 handles it; HostGator does not.

**D3 — SUPERSEDED. The spreadsheet and image folder are the CMS.**

Both original candidates — form-opens-a-PR and form-feeds-Airtable — assumed the form had to be built. It does not. Submissions already arrive as a Microsoft Forms response sheet plus a SharePoint folder, students already use it, and the institution already runs the auth and backups. There is nothing to build but the ingest step.

This is better than either candidate on the thing that matters most: Forms enforces the controlled vocabulary at the point of entry, which is a stronger guarantee against drift than a CMS gives, because a dropdown cannot be typed into.

`scripts/ingest.mjs` implements it. The governing rule is that **the spreadsheet is intake, not storage**: once ingested, the markdown file is canonical and ingest never overwrites it. New submissions are written; already-ingested ones are compared and reported, and changed only with `--update`. This is deliberately the opposite of `extract.mjs`, which fully regenerates because the WordPress export is frozen. Living data cannot be regenerated safely — without this rule, running ingest in 2028 would silently destroy two years of corrections.

Step 8 remains available and unchanged: a Git-based CMS still reads the same files. It is now a convenience rather than a plan.

**D4 — The 24 drafts. Proposed:** extract all 24, publish none, mark the 19 image-less stubs `status: "stub"` and the 5 substantive ones `status: "draft"`. A human reviews only those 5.

**D5 — Affiliation as a public filter.** Schema-neutral — extract it either way. Decide before the index page is built.

**D6 — Canonical domain. Needs your call.** "Lives under a bigger site" collides directly with Goal D. If the archive moves to `parentsite.ca/openshow/portfolio/items/<slug>`, every existing df.show link breaks — which is the specific outcome PLAN.md set out to prevent.

Recommendation: **keep df.show as the canonical domain** and integrate visually — shared navigation shell, shared design tokens, so it reads as part of the parent site without changing where content lives. If it must genuinely move to a subpath, then df.show stays alive permanently as a redirect layer, which is more infrastructure to maintain forever, not less.

Either way, the build gets a configurable `base` path from day one and no hardcoded absolute URLs. That's cheap insurance and keeps the option open.

---

## 4. Target architecture

### 4.1 Storage: JSON, confirmed

**No database.** 264 projects growing ~35/year is ~700 by 2036. The full corpus is ~500 KB of JSON today, ~1.5 MB then — read at build time, never shipped whole to the browser. Faceted filtering and search across 700 records is trivial client-side.

A database earns its place with concurrent writes at volume, queries against data too large to ship to the client, data changing between builds, or real relational joins. None apply. The threshold where this answer changes is ~50k records or content that must update without a rebuild — neither is on the horizon.

### 4.2 Data model

Two record types. Projects, and **shows** — not "years", because 2019 ran two.

```jsonc
// content/projects/<slug>.md — YAML frontmatter, shown here as JSON for clarity.
// `description` lives in the markdown body, not frontmatter (see §4.3).
{
  "id": 1234,
  "slug": "catlike%ef%bc%9aemotion-responsive-wearables", // verbatim, never decoded
  "title": "...",
  "credits": [{ "name": "Jane Doe", "role": null }],  // structured — see §6.3
  "creditsRaw": "Jane Doe, John Smith",                // original free-text, preserved
  "description": "...",
  "body": "",                    // post_content, non-empty on exactly 3
  "show": "2025",                // → content/shows/2025.json
  "year": 2025,
  "session": null,               // "december" | "february", 2019 only
  "affiliation": ["graduate"],
  "medium": ["installation", "sound"],
  "tags": [],                    // free axis — new thematics without schema change
  "media": [                     // ordered, polymorphic, multiples of each type
    { "type": "image", "id": 5678, "role": "featured", "alt": "...", "caption": "..." },
    { "type": "image", "id": 5679, "alt": "...", "caption": "..." },
    { "type": "video-embed", "provider": "youtube", "videoId": "...", "title": "..." },
    { "type": "video-file", "key": "2025/catlike/demo.mp4", "poster": 5680 }
  ],
  "layout": "default",           // named variant, not arbitrary CSS
  "links": [{ "label": "Project site", "url": "...", "status": "unchecked" }],
  "status": "publish",           // publish | draft | stub
  "sourceTerms": ["2025 Installation"]  // provenance — every normalisation reversible
}
```

```jsonc
// content/shows/2025.json   (2019 → 2019-december.json, 2019-february.json)
{
  "id": "2025",
  "year": 2025,
  "session": null,
  "title": "Open Show 2025",
  "dates": { "start": null, "end": null },
  "venue": null,
  "statement": null,             // curatorial text — currently exists nowhere
  "poster": null,
  "theme": {
    "tokens": { "--accent": "#...", "--bg": "#...", "--font-display": "..." },
    "indexLayout": "grid-dense",
    "defaultProjectLayout": "default"
  }
}
```

Three notes on this shape.

`media[]` replaces the single `rf_video_embed` field and is the change that would have been most painful to make after the site was built. Ordered and polymorphic means a project can interleave images, uploaded video, and embeds in whatever sequence it wants, with multiples of each.

`sourceTerms` is the audit trail — every taxonomy decision stays reversible without re-parsing the WXR.

**Show identity is forward-looking.** A show record carries a logo, poster, team photo, venue, dates and organising team. None of it exists for the archived shows — WordPress never recorded it, and there is nowhere to recover it from. Rather than invent placeholders, show pages render only what they have: a page whose content is simply the work reads as an archive, whereas a scaffold of empty rows reads as broken. Four of the eight shows do have editorial copy, recovered from their WordPress "Events" and "About" pages.

If the material for earlier shows surfaces later — posters in a drive, photographs in someone's folder — it drops into `config/overrides.yaml` under a `show:<id>` key with no code change, and the pages fill themselves in. The documented shape is at the end of that file.

**Theming is tokens plus named layouts, not free-form CSS.** This is a deliberate constraint. Arbitrary per-show CSS multiplies the responsive-QA surface across every year forever, and every theme has to keep working on mobile in perpetuity. Tokens and a handful of named layouts get most of the expressive range at a fraction of the maintenance cost. Same argument applies to per-show project layouts — a project opts into a named layout; the show sets the default.

### 4.3 Staying CMS-ready

Per D3 the CMS lands at Step 8, which means the data model has to be shaped for it now. Six constraints, all free today, all expensive to retrofit.

**Markdown with frontmatter, not pure JSON.** Structured fields go in YAML frontmatter, prose goes in the markdown body. This is Astro content collections' native idiom, it diffs far better in a PR, and it's what gives a CMS a rich-text editor instead of a textarea. Costs one extra step in extraction — the WP description meta contains HTML and needs converting to markdown.

**One file per record.** Already planned. A single large array would be unreadable in diffs and unusable by any Git CMS.

**Controlled vocabularies in one shared file.** `content/vocabularies.json` holds the medium, affiliation, and tag lists, read by the build now and by the CMS config at Step 8. If the lists get written twice they drift — which is precisely the failure this project exists to fix.

**Route from the `slug` field, never the filename.** They're allowed to diverge. This matters specifically for `catlike%ef%bc%9a…`, whose filename a CMS's create-new flow might generate differently.

**Stable numeric `id`, independent of slug.** Renaming a slug then orphans nothing.

**No derived data stored.** Nothing computed gets written into a record where an editor could desync it. Counts, sort keys, and thumbnails derive at build time.

One thing to verify at Step 5 rather than assume: `media[]` is a discriminated union, which Keystatic models cleanly as blocks and Decap as variable-type lists. It's the one part of the schema where CMS choice actually constrains the shape, so it's worth a quick proof before the schema is frozen.

### 4.4 Media and storage tiers

Video is the requirement that breaks the static-files-on-HostGator assumption.

Rough arithmetic: 50 projects/year × 1–3 videos × ~50 MB well-encoded is **2.5–7.5 GB per year, growing permanently**, with no adaptive bitrate and no CDN. That's a bandwidth and storage problem on shared hosting, likely a terms-of-service problem, and it must never go into git or Git LFS.

Three tiers:

| Tier | Contents | Where |
| --- | --- | --- |
| **Archive** | True originals — full-res images, video masters | Object storage (R2 / B2). Cold, cheap, never served to browsers |
| **Source** | The ~700 referenced image originals | Git (LFS), committed. What the build consumes |
| **Derived** | Responsive images, WebP/AVIF, transcoded video | Built artifacts. Never committed, regenerated on every build |

This is Goal F implemented directly: preserve large, serve optimized.

**Served files are renamed; archived files never are.** The archive keeps whatever name a file arrived with — `WhatsApp Image 2025-11-11 at 19.32.19 (1)_Srikripa Krishnan.jpeg` and all — because that is the only record of what was actually submitted, because `UPLOADS-MANIFEST.txt` keys 8,603 SHA-256 hashes on those exact paths, and because both the WXR and the SQL dump reference them. Renaming there would break the ability to re-derive anything from source.

The served copy is renamed to `<show>/<slug>_<n>.<ext>`. This costs nothing, because project frontmatter refers to images by archive path and `content/image-manifest.json` does the mapping — no project record changes. Two things are gained: predictable URLs, and **478 of 704 public URLs stop containing a student's name.**

New submissions follow the same rule. `ingest.mjs` archives uploads under their original names in `sources/submissions/<show>/`, and `sync-media.mjs` resolves against either archive root.

---

## 5. Build order

### Step 1 — Lock the sources ✅

- `.gitignore`: `uploads/`, `node_modules/`, `dist/`, `.astro/`
- SHA-256 manifest committed as `sources/CHECKSUMS.txt`
- Move artifacts into `sources/`, `chmod -w`
- Confirm the 3 GB tree is backed up — **done**

### Step 2 — The extractor ✅

Node, keeping one toolchain with Astro. Streaming XML parse. Pure function: exports in, JSON out, deterministic, re-runnable, no network.

Emits `content/projects/`, `content/shows/`, and a `reports/` directory.

**Gate:** prints the §1 checksum table and exits non-zero on any mismatch. Enforced in code, not by eyeball.

### Step 3 — The taxonomy map ✅

Its own reviewed step, not a line inside Step 2. Every term is `[<session>] <year> <concept>` plus 7 bare `Open Show <year>` parents, so the mechanical split is reliable and year resolution is proven at 256/264.

What needs judgement is collapsing ~180 concept strings. I'll generate `taxonomy-map.yaml` with every term, its frequency, and a proposed target.

*Safe to auto-merge:* `Sculputure`→`Sculpture`, `Performace`→`Performance`, `PhysicalComputing`→`Physical Computing`, `DigitalFabrication`→`Digital Fabrication`, `3Dprinting`→`3D Printing`, `Undergrad`→`Undergraduate`, `DataVisualization`→`Data Visualization`.

*AI cluster, wider than PLAN.md lists:* `AI`, `ML_AI`, `Machine Learning`, `Artificial Intelligence`, `Deep Neural Networks` — five terms, one concept.

*Judgement calls:*

| Question | Why it's not obvious |
| --- | --- |
| `Interactive Installation` vs `Installation` | 2022 used the former for 15 items; every other year used the latter |
| `3D Animation` vs `Animation` | Both used, sometimes same year |
| `Sound` / `Audio` / `Sonic Art` / `NIME` | NIME is a research field, not a medium — may not belong on this axis |
| `Webdoc` vs `Interactive Documentary` | Almost certainly one concept, one item each |
| `Generative` / `Generative Art` / `Generative design` | Three variants |
| `Wearables` vs `Wearable Electronics` | PLAN.md says merge; worth confirming |
| ~20 single-use terms | `Playshop`, `Business`, `Wellness`, `Art Movement`, `Automation`… keep, merge, or drop |

Affiliation needs no review: `Undergraduate`/`Undergrad`, `Graduate`, `Alumni`, `Faculty`, `UGThesis`.

Parent terms are unreliable and must not be used for year — `Open Show 2024` covers 22 of 32 items, `Open Show 2025` covers 34 of 38, `Open Show 2023` doesn't exist, and 2019 February uses an en-dash where December uses a hyphen. Prefix resolution is correct and verified.

**Outputs:** reviewed map, `reports/merged-terms.md`, and `reports/unresolved.md` — the 8 items needing manual year assignment, of which `MetaHospital` and `Diver` are published.

### Step 4 — Media ✅

Resolve each of the 704 referenced IDs to its true original: prefer un-suffixed, fall back through `-scaled`, never take a `WxH` derivative. Carry alt text and caption from attachment records — the accessibility data only the WXR provides.

Populate `media[]`, migrating existing `rf_video_embed` values into it. Establish the three storage tiers. Verify all 704 land.

### Step 5 — Astro ← *next*

Content collections over both record types, Zod schemas mirroring §4.2, images through `astro:assets` and sharp. Configurable `base`, no hardcoded absolute URLs.

The theming system: token sets per show, named index layouts, named project layouts. Index re-sliceable by year, medium, affiliation, and tags.

`/portfolio/items/<slug>` preserved exactly — the percent-encoded slug gets a routing test of its own.

Then page triage: review the 13 non-empty pages, port what's worth keeping, hand-clean the WPBakery one.

### Step 6 — Deploy and redirect

Old-URL verification against a generated list of all 264, not spot-checked. WordPress stays running but unlinked through a grace period.

### Step 7 — Submissions ✅

PR-based per D3. A form writes a record and opens a pull request; review is a diff plus a preview deploy. Form fields match the §4.2 schema exactly, with medium and affiliation read from `content/vocabularies.json` — the thing that stops the drift recurring.

### Step 8 — CMS

Deferred, not declined. The site is live and populated before this starts, so it can be evaluated against real content rather than guessed at.

Keystatic is the likely fit — Astro-native, TypeScript config, and it models discriminated unions like `media[]` cleanly. Sveltia is the alternative if a Decap-compatible YAML config is preferable. Either reads the same markdown files the build already consumes and commits through the same git history, so **this is a configuration exercise, not a migration** — provided §4.3 has been honoured.

What it changes when it lands: reviewers no longer need git, theme tokens and show metadata become editable in a form, and the Goal B dependency on one technical person goes away.

Worth confirming at Step 5 rather than discovering here: that the chosen CMS can model `media[]` as designed.

---

## 6. Additions worth building in

Not in the original brief. Roughly prioritised.

**6.1 Search.** At 700 projects people want to find "the one with the robot". Pagefind is nearly free on a static build.

**6.2 Accessibility as compliance.** If this is an Ontario university, AODA/WCAG 2.0 AA is likely a legal obligation rather than a nicety. Worth confirming with whoever owns web compliance *before* the design locks — retrofitting is far worse than designing for it. Alt-text carry-over in Step 4 is a start, not the whole job.

**6.3 Name changes and takedowns.** Over a decade students will ask for a name corrected or a project removed — marriage, transition, professional reasons, or simply changing their mind. Structured `credits[]` rather than a free-text field makes this a two-minute edit instead of a hunt. This is why the schema carries both `credits[]` and `creditsRaw`.

**6.4 Consent and licensing at submission.** Can't be obtained retroactively for the existing 264, but every future submission can record what the student agreed to.

**6.5 Per-project social cards.** Students share these links; a generated OG image per project costs nothing at build.

**6.6 A tested export path.** You're escaping WordPress lock-in — don't rebuild it. Getting everything out again should be a script that runs, not a promise.

**6.7 External link rot.** `rf_project_ext_url` points at student portfolio sites, many already dead. Worth checking all of them once, recording `status` per link, and deciding whether to mark or archive.

---

## 7. Sequencing

Steps 1 → 2 → 3 are strictly serial; each gates the next. Step 4 can begin as soon as Step 2 lands — media resolution doesn't depend on taxonomy. Step 5 needs both. Steps 7 and 8 are independent of each other; 8 can be pulled forward at any time, or slip indefinitely, without disturbing anything upstream.

**Goal A is not really a phase of this project.** Steps 1, 2, and 4 produce a complete, self-contained archive that survives without WordPress, Astro, or any decision about hosting and submissions. That's roughly a day of work and it discharges the highest-priority goal outright.

Everything after it is a website, and websites take as long as they take. Get the archive safe first; treat the rest as unhurried.

The critical path is not code. It's the Step 3 taxonomy review — the one step needing a human who knows what these projects actually were.
