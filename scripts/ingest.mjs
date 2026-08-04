#!/usr/bin/env node
// Microsoft Forms submissions -> content/projects/
//
// The spreadsheet is INTAKE, not storage. Once a project is ingested, its
// markdown file is canonical and this tool must never overwrite it — a typo
// fixed in 2027 has to survive a re-run in 2028. So ingest is ADDITIVE:
//
//   new submission      -> write the file
//   already ingested    -> compare, report the difference, change nothing
//   --update            -> apply differences for named fields only
//
// That is the opposite of extract.mjs, which fully regenerates because the
// WordPress export is frozen. Living data cannot be regenerated safely.
//
//   node scripts/ingest.mjs --sheet <x.xlsx> --show 2026 --media <folder> [--dry-run]
//
// Column mapping and vocabularies live in config/form-map.yaml. Only mapped
// columns are read, so a new PII column in next year's Form cannot leak.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, basename, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load, dump } from 'js-yaml'
import ExcelJS from 'exceljs'
import { splitCredits, decodeEntities, personSlug } from './lib/people.mjs'
import { slugify } from './lib/taxonomy.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// ---------------------------------------------------------------- args

const argv = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : (argv[i + 1] ?? true)
}
const DRY = argv.includes('--dry-run')
const UPDATE = argv.includes('--update')

const SHEET = arg('sheet')
const SHOW = arg('show')
const MEDIA_DIR = arg('media')

if (!SHEET || !SHOW) {
  console.error(`
  Usage: node scripts/ingest.mjs --sheet <file.xlsx> --show <id> [options]

    --sheet   <path>   Microsoft Forms response export
    --show    <id>     show to file these under, e.g. 2026 (organiser-assigned;
                       the Form must not ask submitters for the year)
    --media   <dir>    folder of synced submission files, for resolving uploads
    --dry-run          report only, write nothing
    --update           apply changes to already-ingested projects (off by default)
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

    const orderMatch = name.match(orderRe)
    out.push({
      type: IMG.has(ext) ? 'image' : 'video-file',
      sourceName: name,
      file: found ? found.replace(ROOT + '/', '') : null,
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
  noConsent: [], noMedia: [],
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

const CHANGEABLE = ['affiliation', 'medium', 'tags', 'links', 'consent', 'submission']
const created = []
const unchanged = []
const differing = []

// Match an existing project by NORMALISED TITLE as well as by slug. Slugs are
// derived and can differ between WordPress and this tool for the same project
// — accents, punctuation, percent-encoding. Title is the stable human identity,
// and getting this wrong means creating a duplicate of a project that exists.
const titleKey = (s) =>
  String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

const existingByTitle = new Map()
const projectsDir = join(ROOT, 'content/projects')
if (existsSync(projectsDir)) {
  for (const fn of readdirSync(projectsDir)) {
    if (!fn.endsWith('.md')) continue
    try {
      const fm = load(readFileSync(join(projectsDir, fn), 'utf8').split('---')[1]) ?? {}
      if (fm.title) existingByTitle.set(titleKey(fm.title), fn.replace(/\.md$/, ''))
    } catch {}
  }
}

for (const b of built) {
  const matchedSlug = existingByTitle.get(titleKey(b.frontmatter.title))
  if (matchedSlug && matchedSlug !== b.slug) {
    // Keep the established slug — URLs depend on it.
    b.slug = matchedSlug
    b.frontmatter.slug = matchedSlug
  }
  const path = join(ROOT, 'content/projects', `${b.slug}.md`)
  const body = `---\n${dump(b.frontmatter, { noRefs: true, lineWidth: 100, quotingType: '"' })}---\n\n${b.description}\n`

  if (!existsSync(path)) {
    created.push(b.slug)
    if (!DRY) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, body)
    }
    continue
  }

  // Already ingested. Compare, never clobber.
  const existing = load(readFileSync(path, 'utf8').split('---')[1]) ?? {}
  const diffs = CHANGEABLE.filter(
    (k) => JSON.stringify(existing[k] ?? null) !== JSON.stringify(b.frontmatter[k] ?? null),
  )
  if (!diffs.length) {
    unchanged.push(b.slug)
    continue
  }
  differing.push({ slug: b.slug, diffs })
  if (UPDATE && !DRY) {
    const merged = { ...existing }
    for (const k of diffs) merged[k] = b.frontmatter[k]
    const raw = readFileSync(path, 'utf8')
    const bodyText = raw.slice(raw.indexOf('---', 3) + 3).replace(/^\n+/, '')
    writeFileSync(path, `---\n${dump(merged, { noRefs: true, lineWidth: 100, quotingType: '"' })}---\n\n${bodyText}`)
  }
}

// ---------------------------------------------------------------- report

const line = (n, label) => console.log(`  ${String(n).padStart(4)}  ${label}`)

console.log('  RESULT')
line(created.length, DRY ? 'would be created' : 'created')
line(unchanged.length, 'already ingested, identical')
line(differing.length, `already ingested, differ${UPDATE && !DRY ? ' (updated)' : ' (left alone — pass --update to apply)'}`)
if (superseded.length) line(superseded.length, 'superseded by a later resubmission')

for (const d of differing.slice(0, 10)) console.log(`        ${d.slug}: ${d.diffs.join(', ')}`)

const section = (title, items, fmt) => {
  if (!items.length) return
  console.log(`\n  ${title} (${items.length})`)
  for (const i of items.slice(0, 12)) console.log(`      ${fmt(i)}`)
}

section('Pasted a link instead of uploading — collect by hand', flags.pastedLinks,
  (f) => `${f.title}\n        ${f.url.slice(0, 90)}`)
section('Referenced file not found in --media folder', flags.missingFiles,
  (f) => `${f.title}: ${f.name}`)
section('No hero marked — first image assumed', flags.heroGuessed,
  (f) => `${f.title} -> ${f.file}`)
section('No media at all', flags.noMedia, (f) => f.title)
section('Did NOT consent — must not be published', flags.noConsent,
  (f) => `${f.title} (answered ${JSON.stringify(f.answer)})`)

for (const [label, bucket] of [['medium', flags.unmappedMedium], ['affiliation', flags.unmappedAffiliation]]) {
  if (!bucket.size) continue
  console.log(`\n  Unmapped ${label} values — routed to tags, add to config/form-map.yaml (${bucket.size})`)
  for (const [v, n] of [...bucket].sort((a, b) => b[1] - a[1])) console.log(`      ${n}x  ${JSON.stringify(v)}`)
}

console.log(`\n  Everything lands as status: draft. Promote to publish after review.`)
console.log(DRY ? '  Dry run — nothing written.\n' : '')
