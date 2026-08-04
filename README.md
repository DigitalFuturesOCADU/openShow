# Digital Futures OPEN Show

The archive of the Digital Futures OPEN Show at OCAD University, and the tools
that run it. **240 projects and 323 creators, 2019 to 2025**, migrated off
WordPress and now held as plain files in this repository.

Nothing here depends on a CMS, a database or a running server. The site is
static; the content is markdown and JSON; every page can be rebuilt from source
at any time.

---

## If you are running a show

**→ [RUNNING-A-SHOW.md](RUNNING-A-SHOW.md)**

Announce it, take in submissions, review them, publish. Five stages, each one
command — or use the control panel and skip the terminal entirely:

```bash
npm install
npm start
```

## If you are changing the submission form

**→ [INTAKE-FORM.md](INTAKE-FORM.md)**

What to change before the next call goes out, and why. Some of it cannot be
added retroactively — a question not asked is data that does not exist.

## If you are picking up the project

**→ [EXECUTION.md](EXECUTION.md)** — what was built and why
**→ [OPEN-ITEMS.md](OPEN-ITEMS.md)** — what is still outstanding
**→ [PLAN.md](PLAN.md)** — the original brief

---

## How it fits together

```
sources/        the WordPress export and its uploads — read-only, never edited
submissions/    work ingested from the submission form
config/         corrections a human made — survives every rebuild
content/        generated from the above; never edit these by hand
src/            the website
scripts/        the tools
```

### Images are in a second repository

The 227 MB of web-master images live in
**[openShow-images](https://github.com/DigitalFuturesOCADU/openShow-images)**,
checked out to `content/images`. This repository is 15 MB, so cloning it gives
you every project record, every document and the whole site source without
waiting for 700 photographs. The deploy workflow checks out both, so the
published site is complete.

You only need the images locally if you want to preview the site yourself:

```bash
git clone https://github.com/DigitalFuturesOCADU/openShow-images content/images
```

Or regenerate them from the originals, which takes about three minutes:

```bash
node scripts/sync-media.mjs
```

Everything else — editing text, fixing data, reviewing submissions, reading the
reports — works without them.

The rule that matters: **`config/` is editable and permanent, `content/` is
rebuilt and disposable.** A correction typed into `content/` disappears on the
next run.

## Commands

| | |
| --- | --- |
| `npm start` | Control panel — everything below, with buttons |
| `npm run ingest` | Read the submission spreadsheet |
| `npm run media` | Make web-sized images |
| `npm run extract` | Rebuild all content from source |
| `npm run build` | Produce the finished site in `dist/` |
| `npm run dev` | Preview locally |
| `npm test` | Check every page has a working address |
| `npm run links` | Check external links, hide dead ones |
| `npm run reset` | Delete a show and start it over |

## Integrity

The archive is verified rather than assumed. `npm run extract` reproduces the
2026-08-03 audit of the WordPress export exactly — 264 items, 240 published,
850 attachments, 189 taxonomy terms — and refuses to write anything if a single
count is off. `scripts/validate-sql.mjs` re-derives the same numbers from the
SQL dump using different code, because a gate that uses the parser it is
checking cannot catch a parser that is consistently wrong.
