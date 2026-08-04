#!/usr/bin/env node
// Microsoft Forms submissions -> submissions/<show>/projects/
//
// THE SPREADSHEET IS THE SOURCE. Fix something in it, run this again, and the
// records are rebuilt from what it now says. Re-ingesting is how you correct
// submitted data, so it overwrites rather than merges.
//
// Nothing hand-made is lost by that, because nothing hand-made lives here.
// Corrections that cannot come from the form — merging two spellings of a
// name, assigning a medium, fixing a year — go in config/ and are applied by
// extract.mjs afterwards, so they survive every re-ingest.
//
// Records are written to submissions/, not content/projects/, because extract
// clears that directory on every run and would otherwise delete them.
//
//   node scripts/ingest.mjs --sheet <x.xlsx> --show 2026 --media <folder> [--dry-run]
//
// Column mapping and vocabularies live in config/form-map.yaml. Only mapped
// columns are read, so a new PII column in next year's Form cannot leak.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync, rmSync } from 'node:fs'
import { join, dirname, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load, dump } from 'js-yaml'
import ExcelJS from 'exceljs'
import { splitCredits, decodeEntities, personSlug } from './lib/people.mjs'
import { slugify } from './lib/taxonomy.mjs'
import { SUBMISSIONS_DIR } from './lib/submissions.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : (argv[i + 1] ?? true)
}
const DRY = argv.includes('--dry-run')
const KEEP = argv.includes('--keep')

const SHEET = arg('sheet')
const SHOW = arg('show')
const MEDIA_DIR = arg('media')
// Submitted files are archived under their ORIGINAL names, exactly as
// sources/uploads holds WordPress's. The archive keeps provenance; the served
// copy is renamed to <show>/<slug>_<n> by scripts/sync-media.mjs. Renaming the
// archive would throw away the only record of what a submitter actually sent.
const ARCHIVE_DIR = join(ROOT, 'sources/submissions')

if (!SHEET || !SHOW) {
  console.error(`
  Usage: node scripts/ingest.mjs --sheet <file.xlsx> --show <id> [options]

    --sheet   <path>   Microsoft Forms response export
    --show    <id>     show to file these under, e.g. 2026 (organiser-assigned;
                       the Form must not ask submitters for the year)
    --media   <dir>    folder of synced submission files, for resolving uploads
    --dry-run          report only, write nothing
    --keep             leave existing records alone instead of rebuilding them
`)
  process.exit(1)
}

const cfg = load(readFileSync(join(ROOT, 'config/form-map.yaml'), 'utf8'))
const vocab = JSON.parse(readFileSync(join(ROOT, 'content/vocabularies.json'), 'utf8'))
const validMedium = new Set(vocab.medium.map((t) => t.slug))
const validAffiliation = new Set(vocab.affiliation.map((t) => t.slug))

// ---------------------------------------------------------------- read sheet

const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(SHEET)
const ws = wb.worksheets[0]

const headers = []
ws.getRow(1).eachCell({ includeEmpty: true }, (cell, n) => {
  headers[n] = String(cell.value ?? '').replace(/\s+/g, ' ').trim()
})

// Match columns by pattern so a reworded question does not silently drop data.
const colOf = {}
const unmatched = []
for (const [field, pattern] of Object.entries({ ...cfg.columns, ...(cfg.optionalColumns ?? {}) })) {
  const re = new RegExp(pattern, 'i')
  const idx = headers.findIndex((h) => h && re.test(h))
  // Only a missing REQUIRED column means data is being dropped. Optional ones
  // are forward-looking questions the form may not ask yet.
  if (idx === -1) { if (field in cfg.columns) unmatched.push(field) }
  else colOf[field] = idx
}
if (unmatched.length) {
  console.warn(`  ⚠  no column matched: ${unmatched.join(', ')}`)
  console.warn(`     Update the patterns in config/form-map.yaml if the Form was reworded.\n`)
}

const rows = []
ws.eachRow((row, n) => {
  if (n === 1) return
  const get = (field) => {
    const i = colOf[field]
    if (i == null) return ''
    const v = row.getCell(i).value
    if (v == null) return ''
    if (typeof v === 'object' && 'text' in v) return String(v.text).trim()
    if (typeof v === 'object' && 'hyperlink' in v) return String(v.hyperlink).trim()
    if (v instanceof Date) return v.toISOString()
    return String(v).trim()
  }
  if (!get('title')) return
  rows.push(get)
})

console.log(`${rows.length} submission rows in ${basename(SHEET)}\n`)

// ---------------------------------------------------------------- dedupe

// Students resubmit. Both duplicates in the 2025 sheet were refinements by the
// same team, so the later row wins.
const bySlug = new Map()
const superseded = []
for (const get of rows) {
  const slug = slugify(get('title'))
  if (!slug) continue
  const prev = bySlug.get(slug)
  if (prev && String(prev('submitted')) > String(get('submitted'))) {
    superseded.push(get('title'))
    continue
  }
  if (prev) superseded.push(prev('title'))
  bySlug.set(slug, get)
}

// ---------------------------------------------------------------- media index

// Files land in the synced folder named "<original>_<Submitter Name>.<ext>".
// Index by basename; the Form guarantees uniqueness within a submission window.
const mediaIndex = new Map()
if (MEDIA_DIR) {
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else mediaIndex.set(e.name.toLowerCase(), p)
    }
  }
  if (existsSync(MEDIA_DIR)) walk(MEDIA_DIR)
  else console.warn(`  ⚠  --media folder not found: ${MEDIA_DIR}\n`)
}

const IMG = new Set(cfg.media.imageExtensions)
const VID = new Set(cfg.media.videoExtensions)
const heroRe = new RegExp(cfg.media.heroPattern, 'i')
const orderRe = new RegExp(cfg.media.orderPattern)

function resolveMedia(cell, flags, title) {
  const out = []
  const entries = String(cell || '').split(';').map((s) => s.trim()).filter(Boolean)

  for (const [i, url] of entries.entries()) {
    const name = decodeURIComponent(url.split('?')[0].split('/').pop() ?? '')
    const ext = extname(name).replace('.', '').toLowerCase()

    // Some submitters paste a Drive/Slides link instead of uploading. These
    // cannot be fetched and will rot; surface them rather than dropping them.
    if (!IMG.has(ext) && !VID.has(ext)) {
      flags.pastedLinks.push({ title, url })
      out.push({ type: 'external-link', url, note: 'pasted instead of uploaded — needs collecting by hand' })
      continue
    }

    const found = mediaIndex.get(name.toLowerCase())
    if (!found && MEDIA_DIR) flags.missingFiles.push({ title, name })

    // Copy into the archive under the original name, and record the path
    // relative to sources/submissions — the same shape sync-media expects.
    let archiveRel = null
    if (found) {
      archiveRel = `${SHOW}/${name}`
      const dest = join(ARCHIVE_DIR, archiveRel)
      if (!existsSync(dest)) {
        mkdirSync(dirname(dest), { recursive: true })
        copyFileSync(found, dest)
        flags.archived.push(archiveRel)
      }
    }

    const orderMatch = name.match(orderRe)
    out.push({
      type: IMG.has(ext) ? 'image' : 'video-file',
      sourceName: name,
      file: archiveRel,
      hero: heroRe.test(name),
      order: orderMatch ? Number(orderMatch[1]) : i + 1,
      alt: null,
      caption: null,
    })
  }

  // Explicit numeric prefixes win; otherwise upload order is preserved.
  out.sort((a, b) => (a.order ?? 99) - (b.order ?? 99))

  const hero = out.find((m) => m.hero && m.type === 'image')
  const first = out.find((m) => m.type === 'image')
  const featured = hero ?? first
  if (featured) featured.role = 'featured'
  if (!hero && first) flags.heroGuessed.push({ title, file: first.sourceName })

  for (const m of out) delete m.hero
  return out
}

// ---------------------------------------------------------------- build

const flags = {
  pastedLinks: [], missingFiles: [], heroGuessed: [],
  unmappedMedium: new Map(), unmappedAffiliation: new Map(),
  noConsent: [], noMedia: [], archived: [],
}

const mapList = (raw, table, valid, bucket, title) => {
  const mapped = new Set()
  const extra = []
  for (const piece of String(raw || '').split(';').map((s) => s.trim()).filter(Boolean)) {
    const hit = table[piece]
    if (hit === undefined) {
      bucket.set(piece, (bucket.get(piece) ?? 0) + 1)
      extra.push(piece)
      continue
    }
    if (hit === null) extra.push(piece)
    else if (valid.has(hit)) mapped.add(hit)
    else bucket.set(piece, (bucket.get(piece) ?? 0) + 1)
  }
  return { mapped: [...mapped].sort(), extra }
}

const built = []
for (const [slug, get] of bySlug) {
  const title = get('title')

  const med = mapList(get('tags'), cfg.medium, validMedium, flags.unmappedMedium, title)
  const aff = mapList(get('affiliation'), cfg.affiliation, validAffiliation, flags.unmappedAffiliation, title)

  const consent = /^yes/i.test(get('consent'))
  if (!consent) flags.noConsent.push({ title, answer: get('consent') })

  const media = resolveMedia(get('images'), flags, title)
  if (!media.length) flags.noMedia.push({ title })

  // Per-person affiliation (INTAKE-FORM.md 1d). When the form supplies named
  // slots, use them — that is the only way to know which member of a mixed
  // team is the faculty one. Fall back to splitting the single free-text field.
  const slotted = []
  for (let n = 1; n <= 8; n++) {
    const nm = get(`person${n}Name`)
    if (!nm) continue
    const aff = cfg.affiliation[get(`person${n}Affiliation`)] ?? null
    slotted.push({ name: nm, role: null, affiliation: validAffiliation.has(aff) ? aff : null })
  }

  const credits = (slotted.length ? slotted : splitCredits(get('team'))).map((c) => ({
    personId: personSlug(c.name),
    name: c.name,
    role: c.role ?? null,
    affiliation: c.affiliation ?? null,
  }))

  // With per-person data the project-level value is derived, not asked.
  const perPerson = [...new Set(credits.map((c) => c.affiliation).filter(Boolean))].sort()

  const links = []
  const url = get('link')
  if (url && /^https?:\/\//i.test(url)) links.push({ label: 'Project', url, status: 'unchecked' })

  const frontmatter = {
    id: null, // assigned below; WordPress ids are historical only
    slug,
    title,
    show: String(SHOW),
    year: Number(String(SHOW).slice(0, 4)),
    session: null,
    affiliation: perPerson.length ? perPerson : aff.mapped,
    medium: med.mapped,
    tags: [...med.extra, ...aff.extra].sort(),
    credits,
    creditsRaw: decodeEntities(get('team')) || null,
    media,
    layout: 'default',
    links,
    status: 'draft', // never auto-publish; a human promotes after review
    consent,
    submission: {
      source: basename(SHEET),
      responseId: get('responseId') || null,
      submitted: get('submitted') || null,
      wallCard: get('wallCard') || null,
      presentation: get('presentation') || null,
      stage: get('stage') || null,
      soundNeeds: get('soundNeeds') || null,
      lighting: get('lighting') || null,
      screen: get('screen') || null,
      course: get('course') || null,
      createdWhen: get('createdWhen') || null,
      notes: get('submitterNotes') || null,
    },
  }

  built.push({ slug, frontmatter, description: get('description') })
}

// Stable ids above the WordPress range so the two never collide.
let nextId = 100000
for (const b of built.sort((a, b) => a.slug.localeCompare(b.slug))) b.frontmatter.id = nextId++

// ---------------------------------------------------------------- write

const OUT_DIR = join(ROOT, SUBMISSIONS_DIR, String(SHOW), 'projects')
const written = []
const kept = []
const removed = []

// Rebuilt from the sheet each time. Anything previously ingested for this show
// that the sheet no longer lists has been withdrawn, so it goes too — otherwise
// a deleted submission would linger forever.
const existingFiles = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => f.endsWith('.md')) : []
const wanted = new Set(built.map((b) => `${b.slug}.md`))

for (const b of built) {
  const path = join(OUT_DIR, `${b.slug}.md`)
  if (KEEP && existsSync(path)) {
    kept.push(b.slug)
    continue
  }
  const body = `---\n${dump(b.frontmatter, { noRefs: true, lineWidth: 100, quotingType: '"' })}---\n\n${b.description}\n`
  written.push(b.slug)
  if (!DRY) {
    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(path, body)
  }
}

for (const f of existingFiles) {
  if (wanted.has(f)) continue
  removed.push(f.replace(/\.md$/, ''))
  if (!DRY && !KEEP) rmSync(join(OUT_DIR, f))
}

// ---------------------------------------------------------------- report

const line = (n, label) => console.log(`  ${String(n).padStart(4)}  ${label}`)

console.log('  RESULT')
line(written.length, DRY ? 'would be written from the sheet' : 'written from the sheet')
if (kept.length) line(kept.length, 'left alone (--keep)')
if (removed.length) line(removed.length, DRY ? 'would be removed — no longer in the sheet' : 'removed — no longer in the sheet')
if (superseded.length) line(superseded.length, 'superseded by a later resubmission')
for (const r of removed.slice(0, 10)) console.log(`        ${r}`)

const section = (title, items, fmt) => {
  if (!items.length) return
  console.log(`\n  ${title} (${items.length})`)
  for (const i of items.slice(0, 12)) console.log(`      ${fmt(i)}`)
}

section('Pasted a link instead of uploading — collect by hand', flags.pastedLinks,
  (f) => `${f.title}\n        ${f.url.slice(0, 90)}`)
section('Referenced file not found in --media folder', flags.missingFiles,
  (f) => `${f.title}: ${f.name}`)

// UNVERIFIED ASSUMPTION, called out at the point it fails.
//
// Filename matching assumes the SharePoint sync client preserves the
// "<original>_<Submitter Name>.<ext>" name that Microsoft Forms writes. That
// held for the 2025 response sheet's URLs, but has never been checked against a
// genuinely synced folder — none was available when this was written. If the
// client rewrites names, EVERY file misses at once, and the failure is silent
// unless it is named. See OPEN-ITEMS.md.
// Every uploaded file the sheet points at. Missing ones are a subset of this,
// not an addition to it — they are still emitted, with a null path.
const referenced = built.reduce(
  (n, b) => n + b.frontmatter.media.filter((m) => m.type === 'image' || m.type === 'video-file').length, 0)
if (MEDIA_DIR && mediaIndex.size > 0 && referenced > 0 && flags.missingFiles.length === referenced) {
  console.error(`\n  ✗ NONE of the ${referenced} referenced files matched, though the folder holds ${mediaIndex.size}.`)
  console.error(`    That pattern means the names in the sheet and the names on disk disagree —`)
  console.error(`    most likely the sync client rewrote the "_<Submitter Name>" suffix that`)
  console.error(`    matching depends on. Compare one filename in the sheet against the folder`)
  console.error(`    and adjust the lookup in resolveMedia(). This assumption is unverified;`)
  console.error(`    see OPEN-ITEMS.md.\n`)
} else if (MEDIA_DIR && flags.missingFiles.length && flags.missingFiles.length < referenced) {
  console.log(`\n  ${flags.missingFiles.length} of ${referenced} files missing — individual gaps, not a naming mismatch.`)
}
section('No hero marked — first image assumed', flags.heroGuessed,
  (f) => `${f.title} -> ${f.file}`)
section('No media at all', flags.noMedia, (f) => f.title)
if (flags.archived.length) {
  console.log(`\n  Archived ${flags.archived.length} submitted file(s) to sources/submissions/${SHOW}/`)
  console.log(`      Original names kept. Run sync-media to produce renamed web masters.`)
}
section('Did NOT consent — must not be published', flags.noConsent,
  (f) => `${f.title} (answered ${JSON.stringify(f.answer)})`)

for (const [label, bucket] of [['medium', flags.unmappedMedium], ['affiliation', flags.unmappedAffiliation]]) {
  if (!bucket.size) continue
  console.log(`\n  Unmapped ${label} values — routed to tags, add to config/form-map.yaml (${bucket.size})`)
  for (const [v, n] of [...bucket].sort((a, b) => b[1] - a[1])) console.log(`      ${n}x  ${JSON.stringify(v)}`)
}

console.log(`\n  Records are in ${SUBMISSIONS_DIR}/${SHOW}/projects/. Run extract to build the site.`)
console.log(`  Everything lands as status: draft. Promote to publish after review.`)
console.log(`  Corrections that cannot come from the form belong in config/ — they survive re-ingest.`)
console.log(DRY ? '  Dry run — nothing written.\n' : '')
