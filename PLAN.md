# Open Show site migration

Moving df.show off an unmaintained WordPress theme onto a static site, preserving 264 archived projects and building a submission workflow students can use directly.

## Goal

Three outcomes, in priority order.

1. Content survives independently of WordPress. The archive is the asset, the CMS is disposable.
2. Students submit their own projects, someone reviews, publishing is a merge or a checkbox.
3. Image resizing stops being a task anyone thinks about.

## Current state

The public site runs the Royal theme from ThemeForest with WPBakery, Visual Composer, and Revolution Slider layered on. The theme is unsupported. Half the database schema belongs to Revolution Slider, which is unused. There are pending core updates and a known-risky slider plugin on a public university site, so the security posture is an argument for moving sooner rather than later.

**Host:** HostGator shared, Apache, PHP 8.2.32, cPanel.
**Web root:** `/home2/wals7uyxsg3v/public_html`
**Database:** `wals7uyx_3741312335776371`, 11.9 MiB, 24 tables, `wp_` prefix.

Apache serving static files means the built site can live on this same host and domain. No infrastructure change is required to stay put.

## Source data model

Projects are a custom post type, `royal_portfolio`, with two taxonomies. `royal_portfolio_cats` carries everything meaningful. `royal_portfolio_skills` exists but is empty across all 264 items.

The critical finding is that `post_content` is empty on every item sampled. Despite three page builders being installed, the projects themselves contain no shortcode markup. All real content sits in post meta.

| Concept | Storage |
| --- | --- |
| Project title | `post_title` |
| Student names | `rf_project_desc_title` |
| Description | `rf_project_description` |
| Featured image | `_thumbnail_id` |
| Gallery image IDs | `rf_gallery_img_ids`, comma-separated |
| Gallery image URLs | `rf_gallery_imgs_src`, comma-separated, parallel to the above |
| Video embed | `rf_video_embed` with `rf_video_type` |
| External link | `rf_project_ext_url`, sometimes `rf_project_url` |
| Year, medium, affiliation | `royal_portfolio_cats` terms, all three conflated |

`rf_project_client` is registered by the theme but used zero times. Ignore it.

Note the field naming is misleading. `rf_project_desc_title` holds student names, not a title. Do not infer purpose from field names anywhere in this schema.

## Audit results

Run against all 264 items on 2026-08-03. These numbers are the migration checksum. A local parse of the WXR export must reproduce them exactly, and any deviation means the export lost something.

**Counts:** 264 total, 240 published, 24 drafts.

**Per year**, derived from category prefix:

| Year | Items |
| --- | --- |
| 2019 | 50 |
| 2020 | 58 |
| 2021 | 11 |
| 2022 | 37 |
| 2023 | 30 |
| 2024 | 32 |
| 2025 | 38 |
| No categories at all | 8 |

**Field completeness is close to perfect.** Every item has a description, student names, and a featured image, with three exceptions total. One 2024 item has no description, and two uncategorised items lack both a description and student names.

**Referential integrity is clean.** Gallery ID lists and gallery URL lists match in length on all 264 items. No images are hosted offsite. Two items have `http://` rather than `https://` gallery URLs.

**Media library:** 850 attachments.

## The taxonomy problem

This is the actual work. Everything else is mechanical.

`royal_portfolio_cats` has 189 distinct terms expressing roughly 30 concepts, because it conflates three orthogonal dimensions into one flat vocabulary.

- **Year**, encoded as a text prefix on every term (`2025 AI`, `2023 Code`)
- **Medium** (`Installation`, `Code`, `VR`, `Sound`)
- **Affiliation** (`Undergraduate`, `Graduate`, `Alumni`, `Faculty`, `UGThesis`)

2019 ran two shows, so that year's terms carry a `December` or `February` prefix stacked on top of the year, producing terms like `December Physical Computing`.

The vocabulary has also drifted over seven years. Known collision groups to merge:

- `Performance` / `Performace`
- `Physical Computing` / `PhysicalComputing`
- `Digital Fabrication` / `DigitalFabrication`
- `3D Printing` / `3Dprinting`
- `Sculpture` / `Sculputure`
- `Undergraduate` / `Undergrad`
- `Wearables` / `Wearable Electronics`
- `AI` / `ML_AI` / `Machine Learning`
- `Generative` / `Generative Art`

This list is not exhaustive. Build the full mapping from the extracted term list and have it reviewed before applying, since some merges are judgement calls rather than obvious typos.

**Target shape** is three separate fields per project.

```
year:        2025
session:     "december"        // only meaningful for 2019
affiliation: ["graduate"]
medium:      ["installation", "sound", "ar"]
```

## Target architecture

Content becomes JSON plus original images in this repo. Astro builds it to flat HTML. The build handles all image derivatives through sharp, so originals go in and responsive sizes plus WebP and AVIF come out. Nobody resizes anything by hand again.

Deploy target is either the existing HostGator account or Cloudflare Pages. Decide later, since a static build works on both and the choice is reversible.

URLs stay as `/portfolio/items/<slug>` so existing links keep resolving. This was originally filed as nice-to-have, but it costs nothing on a static build, so do it.

**Still undecided:** the shape of the submission and review loop. Two candidates.

*Form opens a pull request.* Review means reading a diff and a preview deploy, then merging. Costs nothing, everything lives in one place, but the reviewer needs GitHub comfort.

*Form feeds Airtable or NocoDB.* Review means ticking an approved box in a grid, and a build script pulls approved rows. Friendlier if the reviewer is not a developer, at the cost of another service in the stack.

Pick this after Phase 3, when the content schema is settled. Designing the form before the schema is backwards.

## Phases

### Phase 0 — Get the exports in

Three artifacts from the live site, none of which are in this repo yet.

- `wordpress-export.xml`, from Tools > Export > All content. Take all content, not just Portfolio, so attachment records and the About pages come along.
- `uploads/`, the full `wp-content/uploads` tree, unfiltered.
- `database.sql`, the phpMyAdmin dump. Belt and braces, not load-bearing.

Keep these read-only and untracked or in LFS. They are the source of truth and nothing should ever write back to them.

### Phase 1 — Extract and normalise

Parse the WXR into one canonical JSON file, one record per project.

Validate against the audit numbers above before proceeding. This gate matters. If the counts do not match, stop and diagnose rather than pressing on with partial data.

Split year, session, affiliation, and medium into separate fields. Apply the vocabulary merge map. Emit a report of every term that was merged and every item whose year could not be resolved, for human review.

### Phase 2 — Image pipeline

Identify true originals in the uploads tree and discard WordPress's generated derivatives. Resolve each project's images by attachment ID rather than by the stored URL string.

Carry alt text and captions across from the attachment records. This is the main thing the WXR gives that a scrape of the admin would not, and it matters for accessibility.

### Phase 3 — Build the site

Astro, content collections backed by the JSON from Phase 1, images through the built-in pipeline. Index by year, filter by medium and affiliation.

Port the three static pages, which are the only content anywhere on the site that contains page-builder markup and will need hand cleaning.

### Phase 4 — Deploy and redirect

Ship to the chosen host. Verify old URLs resolve. Keep WordPress running but unlinked for a grace period rather than deleting it.

### Phase 5 — Submission workflow

Build the loop chosen above. Design the form fields to match the Phase 1 schema exactly, with medium and affiliation as controlled vocabularies rather than free text, which is what prevents the drift documented above from recurring.

## Known traps

Things that will silently produce wrong output if not handled deliberately.

**Do not derive the year from the post date.** Post dates are unreliable. The 2023 show has items dated both April and December 2023, and the 2020 show spans October and November 2020. Year comes from the category prefix and nothing else.

**The `Open Show 2023` parent term does not exist.** 59 items are missing their year parent term entirely. Year is still recoverable for 256 of 264 items from the prefix on any of their other terms. The remaining 8 have no terms at all and need manual assignment. Two of those 8 are published, `MetaHospital` and `Diver`, so they matter. The other six are drafts.

**At least one slug contains a non-ASCII character.** `catlike：emotion-responsive-wearables` uses a fullwidth colon, which appears percent-encoded as `%ef%bc%9a` in URLs. Do not assume slugs are ASCII-safe when writing files to disk.

**14 items have empty slugs.** These are drafts where WordPress never generated one. Generate slugs from titles, and check for collisions after doing so.

**`-scaled` files are not originals.** WordPress preserves the true original alongside a `-scaled` version for large uploads, and the scaled one is what the site actually serves. Prefer the true original.

**Trust attachment IDs over stored URLs.** `rf_gallery_imgs_src` holds absolute URLs baked in at save time, two of which are `http://`. Resolve images through `rf_gallery_img_ids` against the attachment records instead.

**Drafts are not noise.** 24 of 264 are drafts, and some are real projects that were never published rather than abandoned stubs. Extract them, flag them, and let a human decide.

## Decisions taken

- Static site, not headless WordPress. WordPress is being removed, not kept as a backend.
- Content lives in git as JSON, not in a hosted CMS. The submission layer writes into it rather than owning it.
- Existing URL structure is preserved.
- Students submit, with a review step before publication.

## Open questions

- Submission backend shape, per Phase 3 above.
- Final deploy target, HostGator or Cloudflare Pages.
- Whether `affiliation` should be public-facing as a filter or kept as internal metadata.
- What happens to the 24 drafts.
