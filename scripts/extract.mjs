#!/usr/bin/env node
// WXR -> content/. Pure: exports in, files out. No network, deterministic,
// safe to re-run. Never writes to sources/.
//
// Run 1 (no config/taxonomy-map.yaml): emits a mapping proposal for review and
//        normalises with the built-in defaults so you can see the shape.
// Run 2 (map present): applies the reviewed map. Your edits are never
//        overwritten — the proposal is only generated when the file is absent.
//
// Exits non-zero if the audit checksums in EXECUTION.md §1 do not reproduce.

import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dump, load as loadYaml } from 'js-yaml'
import TurndownService from 'turndown'
import { readWxr, byType } from './lib/wxr.mjs'
import { parseTerm, slugify, deriveLabel, AFFILIATION, AUTO_MERGE, REVIEW_MERGE, buildProposalYaml, loadMap } from './lib/taxonomy.mjs'
import { splitCredits, decodeEntities, buildPeople, loadPeopleConfig, findNearDuplicates, findFuzzyDuplicates, defaultSortName, needsSortReview, nameKey as nameKeyOf } from './lib/people.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'sources/wordpress-export.xml')
const UPLOADS = join(ROOT, 'sources/uploads')
const MAP_PATH = join(ROOT, 'config/taxonomy-map.yaml')
const OVERRIDES_PATH = join(ROOT, 'config/overrides.yaml')
const PEOPLE_PATH = join(ROOT, 'config/people.yaml')

const CATS = 'royal_portfolio_cats'
const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' })

// Expected values from the 2026-08-03 audit. The gate, not decoration.
const EXPECT = {
  total: 264, publish: 240, draft: 24, attachments: 850, terms: 189, unresolvedYear: 8,
  years: { 2019: 50, 2020: 58, 2021: 11, 2022: 37, 2023: 30, 2024: 32, 2025: 38 },
}

const out = (...p) => join(ROOT, ...p)
const write = (p, s) => (mkdirSync(dirname(p), { recursive: true }), writeFileSync(p, s))

// ---------------------------------------------------------------- helpers

const uploadRelPath = (url) => {
  const m = String(url).match(/\/uploads\/(.+)$/)
  if (!m) return null
  return decodeURIComponent(m[1].split('?')[0])
}

const hasHtml = (s) => /<[a-zA-Z/][^>]*>/.test(s)

const toMarkdown = (s) => {
  const t = String(s).trim()
  if (!t) return ''
  // Only run Turndown on real markup — it escapes markdown metacharacters,
  // which would mangle plain prose that merely contains an asterisk.
  return hasHtml(t) ? turndown.turndown(t).trim() : t
}

function parseEmbed(html) {
  const src = String(html).match(/src=["']([^"']+)["']/)?.[1]
  if (!src) return null
  let m = src.match(/player\.vimeo\.com\/video\/(\d+)/)
  if (m) return { type: 'video-embed', provider: 'vimeo', videoId: m[1] }
  m = src.match(/youtube(?:-nocookie)?\.com\/embed\/([\w-]+)/)
  if (m) return { type: 'video-embed', provider: 'youtube', videoId: m[1] }
  return { type: 'video-embed', provider: 'other', url: src }
}

// ---------------------------------------------------------------- read

console.log('Reading WXR…')
const { items } = readWxr(SRC)
const projects = byType(items, 'royal_portfolio')
const attachments = byType(items, 'attachment')
const pages = byType(items, 'page')

/**
 * WordPress caps large uploads at 2560px and serves that as "name-scaled.jpg",
 * keeping the untouched upload beside it as "name.jpg". The attachment record
 * points at the scaled copy, so following it would silently archive the
 * downsampled version and throw away the real one. 112 of the 704 referenced
 * images are affected, and the true original is present for every one.
 */
function resolveOriginal(rel) {
  if (!rel) return { file: null, servedFile: null, downsampled: false }
  const unscaled = rel.replace(/-scaled(\.\w+)$/, '$1')
  if (unscaled !== rel && existsSync(join(UPLOADS, unscaled))) {
    return { file: unscaled, servedFile: rel, downsampled: true }
  }
  return { file: rel, servedFile: rel, downsampled: false }
}

// id -> attachment facts, so images resolve by ID and never by stored URL.
const attIndex = new Map()
for (const a of attachments) {
  const { file, servedFile, downsampled } = resolveOriginal(uploadRelPath(a.attachmentUrl))
  const abs = file ? join(UPLOADS, file) : null
  const present = abs ? existsSync(abs) : false
  attIndex.set(a.id, {
    id: Number(a.id),
    file,
    servedFile,
    recoveredOriginal: downsampled,
    exists: present,
    bytes: present ? statSync(abs).size : 0,
    mime: file ? (file.split('.').pop() || '').toLowerCase() : '',
    alt: a.m('_wp_attachment_image_alt').trim(),
    caption: a.excerpt.trim(),
    title: a.title.trim(),
  })
}

// ---------------------------------------------------------------- taxonomy

const conceptCounts = new Map()
const rawTermNames = new Set()
for (const p of projects) {
  for (const t of p.termsIn(CATS)) {
    rawTermNames.add(t.name)
    const parsed = parseTerm(t.name)
    if (parsed.kind === 'concept') {
      conceptCounts.set(parsed.concept, (conceptCounts.get(parsed.concept) ?? 0) + 1)
    }
  }
}

let generatedProposal = false
if (!existsSync(MAP_PATH)) {
  write(MAP_PATH, buildProposalYaml(conceptCounts))
  generatedProposal = true
}
const reviewedMap = loadMap(MAP_PATH)

// Resolve a concept to { axis, value } using the reviewed map, falling back to
// the built-in defaults so run 1 still produces sensible output.
function resolveConcept(concept) {
  if (reviewedMap?.affiliation && concept in reviewedMap.affiliation) {
    const v = reviewedMap.affiliation[concept]
    return v == null ? null : { axis: 'affiliation', value: v }
  }
  if (reviewedMap?.medium && concept in reviewedMap.medium) {
    const v = reviewedMap.medium[concept]
    return v == null ? null : { axis: 'medium', value: v }
  }
  if (concept in AFFILIATION) return { axis: 'affiliation', value: AFFILIATION[concept] }
  const merged = AUTO_MERGE[concept] ?? REVIEW_MERGE[concept]?.[0] ?? concept
  return merged == null ? null : { axis: 'medium', value: slugify(merged) }
}

// ---------------------------------------------------------------- build

const labelSources = { medium: new Map(), affiliation: new Map() }
const usedSlugs = new Map()
function uniqueSlug(preferred, id) {
  let s = preferred || `project-${id}`
  if (!usedSlugs.has(s)) return (usedSlugs.set(s, id), s)
  let n = 2
  while (usedSlugs.has(`${s}-${n}`)) n++
  const final = `${s}-${n}`
  usedSlugs.set(final, id)
  return final
}

const records = []
const notes = {
  generatedSlugs: [], slugCollisions: [], unresolvedYear: [], yearConflicts: [],
  droppedTerms: new Map(), droppedByProject: new Map(), missingFiles: [], danglingIds: [], galleryMismatch: [],
  noAlt: 0, withAlt: 0, links: [], selfHostedVideo: [], embeds: [], dedupedImages: 0, recoveredOriginals: 0,
}

for (const p of projects) {
  const termObjs = p.termsIn(CATS).map((t) => ({ raw: t.name, ...parseTerm(t.name) }))

  // Year from the term prefix, never from the post date.
  const years = [...new Set(termObjs.map((t) => t.year).filter(Boolean))]
  const year = years.length ? Math.min(...years) : null
  if (years.length > 1) notes.yearConflicts.push({ id: p.id, title: p.title, years })

  const session = termObjs.find((t) => t.session)?.session ?? null

  const affiliation = new Set()
  const medium = new Set()
  for (const t of termObjs) {
    if (t.kind !== 'concept') continue
    const r = resolveConcept(t.concept)
    if (!r) {
      notes.droppedTerms.set(t.concept, (notes.droppedTerms.get(t.concept) ?? 0) + 1)
      notes.droppedByProject.set(p.id, [...(notes.droppedByProject.get(p.id) ?? []), t.concept])
      continue
    }
    ;(r.axis === 'affiliation' ? affiliation : medium).add(r.value)
    // Remember which source concepts fed each slug, so labels can recover the
    // original casing ("AI", not "Ai") instead of guessing from the slug.
    const src = labelSources[r.axis]
    if (!src.has(r.value)) src.set(r.value, new Map())
    const m = src.get(r.value)
    m.set(t.concept, (m.get(t.concept) ?? 0) + 1)
  }

  // --- slug ---------------------------------------------------------------
  const preferred = p.slug || slugify(p.title)
  if (!p.slug) notes.generatedSlugs.push({ id: p.id, title: p.title, slug: preferred })
  if (usedSlugs.has(preferred)) notes.slugCollisions.push({ id: p.id, title: p.title, slug: preferred })
  const slug = uniqueSlug(preferred, p.id)

  // --- media --------------------------------------------------------------
  const media = []
  // The Royal theme stores the featured image as the first gallery entry too,
  // so 220 of 264 projects would otherwise emit it twice. Featured is pushed
  // first, so keeping the first occurrence preserves the role.
  const seenImages = new Set()
  const pushImage = (rawId, role) => {
    const id = String(rawId).trim()
    if (!id) return
    const a = attIndex.get(id)
    if (!a) return notes.danglingIds.push({ project: p.id, imageId: id })
    if (seenImages.has(id)) return notes.dedupedImages++
    seenImages.add(id)
    if (!a.exists) notes.missingFiles.push({ project: p.id, imageId: id, file: a.file })
    a.alt ? notes.withAlt++ : notes.noAlt++
    if (a.recoveredOriginal) notes.recoveredOriginals++
    media.push({
      type: 'image', id: a.id, file: a.file,
      ...(role ? { role } : {}),
      ...(a.recoveredOriginal ? { servedByWordpress: a.servedFile } : {}),
      bytes: a.bytes,
      alt: a.alt || null, caption: a.caption || null,
    })
  }

  pushImage(p.m('_thumbnail_id'), 'featured')

  const galIds = p.m('rf_gallery_img_ids').split(',').map((s) => s.trim()).filter(Boolean)
  const galSrcs = p.m('rf_gallery_imgs_src').split(',').map((s) => s.trim()).filter(Boolean)
  if (galIds.length !== galSrcs.length) {
    notes.galleryMismatch.push({ id: p.id, ids: galIds.length, srcs: galSrcs.length })
  }
  for (const g of galIds) pushImage(g)

  const selfMp4 = p.m('rf_video_self_mp4').trim()
  if (selfMp4) {
    const rel = uploadRelPath(selfMp4)
    const exists = rel ? existsSync(join(UPLOADS, rel)) : false
    if (!exists) notes.missingFiles.push({ project: p.id, file: rel, kind: 'video' })
    notes.selfHostedVideo.push({ project: p.id, title: p.title, file: rel })
    media.push({ type: 'video-file', file: rel, poster: null })
  }

  const embedHtml = p.m('rf_video_embed').trim()
  if (embedHtml) {
    const e = parseEmbed(embedHtml)
    if (e) {
      media.push(e)
      notes.embeds.push({ project: p.id, ...e })
    }
  }

  // --- links --------------------------------------------------------------
  // rf_project_url is the real field (233 items). rf_project_ext_url has 2,
  // both duplicates. PLAN.md has these the wrong way round.
  const links = []
  const seenUrls = new Set()
  for (const [key, label] of [['rf_project_url', 'Project'], ['rf_project_ext_url', 'External']]) {
    const u = p.m(key).trim()
    if (u && !seenUrls.has(u)) {
      seenUrls.add(u)
      links.push({ label, url: u, status: 'unchecked' })
      notes.links.push({ project: p.id, url: u })
    }
  }

  // --- status -------------------------------------------------------------
  const description = toMarkdown(p.m('rf_project_description'))
  const body = toMarkdown(p.content)
  const creditsRaw = p.m('rf_project_desc_title').trim()
  const isStub = p.status === 'draft' && media.length === 0 && !description
  const status = p.status === 'publish' ? 'publish' : isStub ? 'stub' : 'draft'

  if (!year) notes.unresolvedYear.push({ id: p.id, title: p.title, status, slug, postDate: p.date })

  records.push({
    p, slug, year, session, status,
    credits: splitCredits(creditsRaw),
    frontmatter: {
      id: Number(p.id),
      slug,
      title: p.title.trim(),
      show: year ? (session ? `${year}-${session}` : String(year)) : null,
      year,
      session,
      affiliation: [...affiliation].sort(),
      medium: [...medium].sort(),
      tags: [],
      credits: [],
      creditsRaw: decodeEntities(creditsRaw) || null,
      media,
      layout: 'default',
      links,
      status,
      sourceTerms: termObjs.map((t) => t.raw).sort(),
      wordpress: { postDate: p.date, originalSlug: p.slug || null, link: p.link || null },
    },
    description,
    body,
  })
}

// ---------------------------------------------------------------- audit gate

const count = (fn) => records.filter(fn).length
const yearCounts = {}
for (const r of records) if (r.year) yearCounts[r.year] = (yearCounts[r.year] ?? 0) + 1

const checks = [
  ['total items', records.length, EXPECT.total],
  ['published', count((r) => r.p.status === 'publish'), EXPECT.publish],
  ['drafts', count((r) => r.p.status === 'draft'), EXPECT.draft],
  ['attachments', attachments.length, EXPECT.attachments],
  ['distinct cats terms', rawTermNames.size, EXPECT.terms],
  ['year unresolved', notes.unresolvedYear.length, EXPECT.unresolvedYear],
  ...Object.entries(EXPECT.years).map(([y, n]) => [`year ${y}`, yearCounts[y] ?? 0, n]),
  // Every referenced image lands exactly once, and the total matches the 704
  // distinct IDs the SQL cross-validation independently derives.
  ['image entries emitted', records.reduce((n, r) => n + r.frontmatter.media.filter((m) => m.type === 'image').length, 0), 704],
  ['dangling image ids', notes.danglingIds.length, 0],
  ['missing files on disk', notes.missingFiles.length, 0],
  ['gallery id/url mismatch', notes.galleryMismatch.length, 0],
  ['year conflicts', notes.yearConflicts.length, 0],
]

const failures = checks.filter(([, got, want]) => got !== want)

console.log('\n  AUDIT GATE')
for (const [label, got, want] of checks) {
  console.log(`  ${got === want ? '✓' : '✗'} ${label.padEnd(26)} ${String(got).padStart(4)}  expected ${want}`)
}

if (failures.length) {
  console.error(`\n  ✗ ${failures.length} check(s) failed — refusing to write output.`)
  console.error('    Diagnose before proceeding; do not press on with partial data.\n')
  process.exit(1)
}
console.log('  → all checks passed\n')

// ---------------------------------------------------------------- overrides
//
// Applied only after the gate. The gate measures fidelity to the export and
// must not be silenced by hand-entered corrections: if 8 items have no
// resolvable year in the WXR, that stays true however many are filled in here.

// A comment-only overrides file is the normal starting state, and js-yaml
// throws on a document with no content rather than returning empty.
const readOverrides = () => {
  if (!existsSync(OVERRIDES_PATH)) return {}
  const text = readFileSync(OVERRIDES_PATH, 'utf8')
  if (!text.replace(/^\s*#.*$/gm, '').trim()) return {}
  return loadYaml(text) ?? {}
}

const overrideDoc = readOverrides()
const byId = new Map(records.map((r) => [String(r.frontmatter.id), r]))
const applied = []
const unknownIds = []

for (const [rawId, fields] of Object.entries(overrideDoc)) {
  const rec = byId.get(String(rawId))
  if (!rec) {
    unknownIds.push(rawId)
    continue
  }
  const keys = Object.keys(fields ?? {}).filter((k) => k !== 'note')
  for (const k of keys) rec.frontmatter[k] = fields[k]
  if (keys.length) {
    rec.frontmatter.manualOverrides = keys.sort()
    // Keep derived fields consistent with an overridden year/session.
    if (keys.includes('year') || keys.includes('session')) {
      const y = rec.frontmatter.year
      const s = rec.frontmatter.session
      rec.frontmatter.show = y ? (s ? `${y}-${s}` : String(y)) : null
      rec.year = y
      rec.session = s
    }
    applied.push({ id: rawId, title: rec.frontmatter.title, keys, note: fields.note ?? null })
  }
}

if (unknownIds.length) {
  console.error(`  ⚠  config/overrides.yaml references ${unknownIds.length} unknown post id(s): ${unknownIds.join(', ')}`)
  console.error('     These match no project and were ignored — check for a typo.\n')
}
if (applied.length) console.log(`  Applied ${applied.length} manual override(s) from config/overrides.yaml\n`)

// ---------------------------------------------------------------- people
//
// WordPress had no person entity: creators were one free-text string per
// project, so the same human on four projects was four unrelated strings.
// Build a real registry so creators can be captured, sorted and displayed.

const allCredited = [...new Set(records.flatMap((r) => r.credits.map((c) => c.name)))].sort()
const nearDupes = findNearDuplicates(allCredited)
const fuzzyDupes = findFuzzyDuplicates(allCredited)

if (!existsSync(PEOPLE_PATH)) {
  const ambiguous = allCredited.filter(needsSortReview)
  write(PEOPLE_PATH, `# Creator registry corrections — REVIEW
#
# Generated from ${allCredited.length} distinct credited names across ${records.filter((r) => r.credits.length).length} projects.
# Edit and re-run "npm run extract". Regenerated only when absent, so edits survive.
#
# aliases:     map a spelling onto the canonical one. Both still appear in the
#              person's "variants", so nothing is lost.
# sortNames:   override the "Family, Given" sort key where the heuristic is wrong.
# collectives: credits that are groups or studios rather than individuals.
# notPeople:   credits that are not creators at all and should be discarded.

# --- Same person credited two ways. Detected automatically: accents, hyphens
# --- and spacing differ but the letters are identical. Confirm each.
aliases:
${nearDupes.map(([a, b]) => `  ${JSON.stringify(a)}: ${JSON.stringify(b)}`).join('\n') || '  {}'}

# --- PROBABLE TYPOS: normalised names within an edit distance of 2, but not
# --- identical. NOT applied automatically — two real people can have names one
# --- character apart. Confirm each, then move it into aliases above.
${fuzzyDupes.length
  ? fuzzyDupes.map((d) => `#   ${JSON.stringify(d.a)} <-> ${JSON.stringify(d.b)}   (distance ${d.distance})`).join('\n')
  : '#   none detected'}

# --- Sort keys the heuristic is unsure about: one-word names, four or more
# --- words, or a particle like "van"/"de". The default guess is shown.
sortNames:
${ambiguous.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(defaultSortName(n))}`).join('\n') || '  {}'}

# --- Groups, studios and labs. Displayed, but not treated as individuals.
# --- Detected by name; confirm and add any the heuristic missed.
collectives:
${allCredited.filter((n) => /\b(collective|lab|studio|group|team|society|inc\.?)\b/i.test(n)).map((n) => `  - ${JSON.stringify(n)}`).join('\n') || '  []'}

# --- Not creators at all. Detected where the credit is identical to the
# --- project's own title, which means the field was filled in with the wrong
# --- thing. Discarded entirely.
notPeople:
${(() => {
  const selfTitled = records
    .filter((r) => r.credits.length === 1 && nameKeyOf(r.credits[0].name) === nameKeyOf(r.frontmatter.title))
    .map((r) => r.credits[0].name)
  return [...new Set(selfTitled)].map((n) => `  - ${JSON.stringify(n)}`).join('\n') || '  []'
})()}
`)
  console.log(`  ⚠  config/people.yaml was GENERATED and needs review.\n`)
}

const peopleCfg = loadPeopleConfig(PEOPLE_PATH)
const people = buildPeople(records, peopleCfg)

// Every credit must point at a real registry entry, or a person page will 404
// and a participant list will silently omit someone.
const danglingCredits = records.flatMap((r) =>
  r.frontmatter.credits.filter((c) => !people.has(c.personId)).map((c) => ({ project: r.slug, name: c.name })),
)
if (danglingCredits.length) {
  console.error(`\n  ✗ ${danglingCredits.length} credit(s) do not resolve to a registry entry:`)
  for (const d of danglingCredits.slice(0, 10)) console.error(`      ${d.project}: ${d.name}`)
  process.exit(1)
}

const creditLinks = records.reduce((n, r) => n + r.frontmatter.credits.length, 0)
console.log(`  People: ${people.size} in registry, ${creditLinks} credit links, ` +
  `${[...people.values()].filter((p) => p.projectCount > 1).length} appear in more than one project`)

// ---------------------------------------------------------------- write

rmSync(out('content/projects'), { recursive: true, force: true })
rmSync(out('content/shows'), { recursive: true, force: true })

for (const r of records) {
  const fm = dump(r.frontmatter, { noRefs: true, lineWidth: 100, quotingType: '"' })
  const bodyParts = [r.description, r.body].filter(Boolean)
  write(out('content/projects', `${r.slug}.md`), `---\n${fm}---\n\n${bodyParts.join('\n\n')}\n`)
}

const shows = new Map()
for (const r of records) {
  if (!r.year) continue
  const id = r.frontmatter.show
  if (!shows.has(id)) {
    shows.set(id, {
      id, year: r.year, session: r.session,
      title: `Open Show ${r.year}${r.session ? ` — ${r.session[0].toUpperCase()}${r.session.slice(1)}` : ''}`,
      dates: { start: null, end: null }, venue: null, statement: null, poster: null,
      theme: { tokens: {}, indexLayout: 'grid', defaultProjectLayout: 'default' },
      projectCount: 0,
    })
  }
  shows.get(id).projectCount++
}
for (const s of shows.values()) write(out('content/shows', `${s.id}.json`), JSON.stringify(s, null, 2) + '\n')

write(
  out('content/people.json'),
  JSON.stringify(
    {
      $comment: 'Creator registry. Derived from project credits; corrections live in config/people.yaml. id is stable and safe to link to — a person page is /people/<id>.',
      people: [...people.values()].sort((a, b) => a.sortName.localeCompare(b.sortName)),
    },
    null, 2,
  ) + '\n',
)

const vocab = { medium: new Set(), affiliation: new Set() }
for (const r of records) {
  r.frontmatter.medium.forEach((m) => vocab.medium.add(m))
  r.frontmatter.affiliation.forEach((a) => vocab.affiliation.add(a))
}

const overrides = reviewedMap?.labels ?? {}
let mediumLabel = {}
const terms = (axis) =>
  [...vocab[axis]].sort().map((slug) => ({
    slug,
    label: deriveLabel(slug, labelSources[axis].get(slug) ?? new Map(), overrides),
    count: records.filter((r) => r.frontmatter[axis].includes(slug)).length,
  }))

// WordPress collapsed year, affiliation and medium into one flat taxonomy. They
// are not the same kind of thing, and the differences are load-bearing: they
// dictate cardinality, who supplies the value at submission, and whether the
// value can go stale. Recording that here keeps the filter UI, the Zod schema
// and the future CMS config from each re-deciding it.
mediumLabel = Object.fromEntries(terms('medium').map((t) => [t.slug, t.label]))

write(
  out('content/vocabularies.json'),
  JSON.stringify(
    {
      $comment: 'Single source of truth for controlled vocabularies. Read by the build and, at Step 8, by the CMS config. Do not duplicate these lists.',
      axes: {
        show: {
          describes: 'the event — which Open Show the work appeared in',
          cardinality: 'exactly one',
          storage: 'content/shows/*.json — a first-class record, not a string',
          setBy: 'organiser, never the submitter',
          volatile: false,
        },
        affiliation: {
          describes: 'the people — their relationship to the school at the time',
          cardinality: 'zero or more (23 projects span two or three)',
          storage: 'controlled vocabulary, project-level',
          setBy: 'submitter declares',
          volatile: true,
          note: 'A snapshot that ages: an undergraduate in 2019 is an alum now. The value records what was true at the time of the show and should not be updated retroactively. 60 of 264 projects carry none. Public visibility is decision D5.',
          subsets: { 'ug-thesis': 'undergraduate' },
          subsetNote: 'All 17 ug-thesis projects are also undergraduate; it never occurs alone. Kept on this axis by decision, but the two are not independent — a filter UI should not present them as equal siblings.',
        },
        medium: {
          describes: 'the work — materials, techniques, form',
          cardinality: 'zero or more (typically two or three, up to ten)',
          storage: 'controlled vocabulary, project-level',
          setBy: 'submitter picks from this list',
          volatile: false,
        },
        tags: {
          describes: 'anything else — themes, curatorial groupings, one-offs',
          cardinality: 'zero or more',
          storage: 'free-form',
          setBy: 'curator',
          volatile: false,
          note: 'Deliberately uncontrolled, so new thematics do not require a schema change. Keeping this axis open is what stops medium drifting back into a catch-all.',
        },
      },
      medium: terms('medium'),
      affiliation: terms('affiliation'),
      tags: [],
    },
    null, 2,
  ) + '\n',
)

// ---------------------------------------------------------------- reports

const table = (rows) => rows.map((r) => `| ${r.join(' | ')} |`).join('\n')

write(out('reports/audit.md'), `# Audit gate

Generated by \`scripts/extract.mjs\` against \`sources/wordpress-export.xml\`.

| Check | Got | Expected | |
| --- | ---: | ---: | :-: |
${table(checks.map(([l, g, w]) => [l, g, w, g === w ? 'PASS' : 'FAIL']))}

All checks passed. Counts reproduce the 2026-08-03 audit exactly.
`)

const dropped = [...notes.droppedTerms].sort((a, b) => b[1] - a[1])
const noMedium = records.filter((r) => r.frontmatter.medium.length === 0)
const noMediumPublished = noMedium.filter((r) => r.status === 'publish')

// Two distinct things that are easy to conflate: projects that ended up with no
// medium, and projects that lost a term to a drop decision. Report them apart,
// and state plainly whether any drop actually cost a project its last medium.
const touchedByDrop = records.filter((r) => notes.droppedByProject.has(String(r.frontmatter.id)))
const strippedByDrop = touchedByDrop.filter((r) => r.frontmatter.medium.length === 0)

write(out('reports/taxonomy.md'), `# Taxonomy normalisation

${rawTermNames.size} raw terms → ${vocab.medium.size} medium + ${vocab.affiliation.size} affiliation values.

Mapping applied from \`config/taxonomy-map.yaml\`${generatedProposal ? ' (**freshly generated — needs review**)' : ' (reviewed)'}.

## Medium (${vocab.medium.size})

${[...vocab.medium].sort().map((v) => `- \`${v}\``).join('\n')}

## Affiliation (${vocab.affiliation.size})

${[...vocab.affiliation].sort().map((v) => `- \`${v}\``).join('\n')}

## Dropped terms

${dropped.length ? table([['Term', 'Items'], ['---', '---:'], ...dropped]) : '_None dropped._'}

## Axis coverage by show

How complete each axis is, per show. A filter is only as useful as its
coverage: an axis at 0% for a given year means that year vanishes from it.

${(() => {
  const shows = [...new Set(records.map((r) => r.frontmatter.show ?? 'no show'))].sort()
  const rows = shows.map((s) => {
    const inShow = records.filter((r) => (r.frontmatter.show ?? 'no show') === s)
    const pct = (n) => `${n}/${inShow.length}` + (n === inShow.length ? '' : ` (${Math.round((100 * n) / inShow.length)}%)`)
    return [
      s,
      inShow.length,
      pct(inShow.filter((r) => r.frontmatter.affiliation.length).length),
      pct(inShow.filter((r) => r.frontmatter.medium.length).length),
    ]
  })
  return table([['Show', 'Items', 'Has affiliation', 'Has medium'], ['---', '---:', '---:', '---:'], ...rows])
})()}

**Affiliation was not recorded for the 2025 show at all.** That is not scatter or
export loss — no 2025 term carries an affiliation, so every one of those items
has an empty array. Across 2019–2024 the same axis is ${(() => {
  const older = records.filter((r) => r.frontmatter.year && r.frontmatter.year < 2025)
  const have = older.filter((r) => r.frontmatter.affiliation.length).length
  return `${have}/${older.length} (${Math.round((100 * have) / older.length)}%)`
})()} complete, so this is a
single-year regression rather than a long-standing gap.

Two consequences. It is recoverable — 2025 is the most recent show and the
people involved will still know who was an undergraduate and who was a
graduate, which will not stay true indefinitely. And it bears directly on
decision D5: making affiliation a public filter today would render the newest
show invisible to it.

This is precisely the drift that Step 7's controlled vocabulary exists to
prevent recurring.

## Cost of the drop decisions

${touchedByDrop.length} project${touchedByDrop.length === 1 ? '' : 's'} lost at least one term to a drop.
**${strippedByDrop.length} of them lost their only medium**${strippedByDrop.length === 0 ? ' — every affected project kept other mediums, so nothing became undiscoverable.' : '.'}

${touchedByDrop.length
  ? table([['ID', 'Title', 'Dropped', 'Retained'], ['---', '---', '---', '---'],
      ...touchedByDrop.map((r) => [r.frontmatter.id, r.frontmatter.title,
        (notes.droppedByProject.get(String(r.frontmatter.id)) ?? []).join(', '),
        r.frontmatter.medium.join(', ') || '**none**'])])
  : '_No terms were dropped._'}

## Projects with no medium (${noMedium.length})

Not caused by the drop decisions — see above. These carry no medium term in the
source data at all, so they will not appear under any medium filter.
${noMediumPublished.length} ${noMediumPublished.length === 1 ? 'is' : 'are'} published.

${noMedium.length
  ? table([['ID', 'Status', 'Title', 'Source terms'], ['---', '---', '---', '---'],
      ...noMedium.map((r) => [r.frontmatter.id, r.status, r.frontmatter.title,
        r.frontmatter.sourceTerms.length ? r.frontmatter.sourceTerms.join(', ') : '_none — no categories_'])])
  : '_None — every project has at least one medium._'}
`)

write(out('reports/unresolved.md'), `# Needs human attention

## Year could not be resolved (${notes.unresolvedYear.length})

These have no categories at all, so there is no prefix to read a year from.
Record the decision in \`config/overrides.yaml\`, keyed by the ID below — not in
the project file, which is regenerated on every extract.

${table([['ID', 'Status', 'Title', 'Post date (hint only)'], ['---', '---', '---', '---'],
  ...notes.unresolvedYear.map((u) => [u.id, u.status, u.title, u.postDate || '—'])])}

Post dates are a starting hint and must not be trusted as the answer — the 2023
show has items dated both April and December 2023, and the 2020 show spans
October and November.

**${notes.unresolvedYear.filter((u) => u.status === 'publish').length} of these are published** and therefore user-visible.

## Slugs generated from title (${notes.generatedSlugs.length})

WordPress never created a slug for these drafts.

${table([['ID', 'Title', 'Generated slug'], ['---', '---', '---'],
  ...notes.generatedSlugs.map((s) => [s.id, s.title, `\`${s.slug}\``])])}

## Slug collisions (${notes.slugCollisions.length})

${notes.slugCollisions.length
  ? table([['ID', 'Title', 'Wanted'], ['---', '---', '---'], ...notes.slugCollisions.map((s) => [s.id, s.title, `\`${s.slug}\``])])
  : '_None — every slug is unique._'}
`)

const totalVideoMb = notes.selfHostedVideo.reduce((n, v) => n + (v.file && existsSync(join(UPLOADS, v.file)) ? statSync(join(UPLOADS, v.file)).size : 0), 0) / 1e6

write(out('reports/media.md'), `# Media

## Accessibility: alt text is effectively absent

| | Count |
| --- | ---: |
| Image references with alt text | ${notes.withAlt} |
| Image references **without** alt text | ${notes.noAlt} |

PLAN.md Phase 2 assumed alt text would carry across from the attachment records
and called it "the main thing the WXR gives that a scrape would not". In fact
only 14 of 850 attachments carry any alt attribute, and the values are
placeholders ("Person Image", "Abha Patil Font") rather than descriptions.

**Alt text has to be authored, not migrated.** See EXECUTION.md §6.2.

## Self-hosted video (${notes.selfHostedVideo.length} projects, ${totalVideoMb.toFixed(1)} MB)

${table([['Project', 'Title', 'File'], ['---', '---', '---'],
  ...notes.selfHostedVideo.map((v) => [v.project, v.title, `\`${v.file}\``])])}

## Embedded video (${notes.embeds.length})

${table([['Project', 'Provider', 'ID'], ['---', '---', '---'],
  ...notes.embeds.map((e) => [e.project, e.provider, `\`${e.videoId ?? e.url}\``])])}

## External links (${notes.links.length})

Every link is recorded with \`status: unchecked\`. Link-rot checking is
EXECUTION.md §6.7 — many of these point at student portfolio sites.
`)

// ------------------------------------------------- participant + project lists
//
// Both directions of the same data: people-by-show grouped by affiliation, and
// projects-by-show. Generated rather than maintained, so they cannot drift.

const showIds = [...shows.keys()].sort()
const affLabel = Object.fromEntries(terms('affiliation').map((t) => [t.slug, t.label]))
const AFF_ORDER = ['undergraduate', 'ug-thesis', 'graduate', 'alumni', 'faculty']

const participantsBody = showIds.map((showId) => {
  const inShow = [...people.values()]
    .map((p) => ({ p, apps: p.appearances.filter((a) => a.show === showId) }))
    .filter((x) => x.apps.length)

  const groups = new Map()
  for (const { p, apps } of inShow) {
    const affs = [...new Set(apps.flatMap((a) => a.affiliation))]
    for (const a of affs.length ? affs : ['unspecified']) {
      if (!groups.has(a)) groups.set(a, [])
      groups.get(a).push(p)
    }
  }

  const ordered = [...AFF_ORDER.filter((a) => groups.has(a)), ...[...groups.keys()].filter((a) => !AFF_ORDER.includes(a))]
  const sections = ordered.map((a) => {
    const list = groups.get(a).sort((x, y) => x.sortName.localeCompare(y.sortName))
    return `#### ${affLabel[a] ?? 'Unspecified'} (${list.length})\n\n` +
      list.map((p) => `- ${p.name}${p.kind === 'collective' ? ' _(collective)_' : ''}`).join('\n')
  })

  return `### ${shows.get(showId).title}\n\n${inShow.length} participants.\n\n${sections.join('\n\n')}`
}).join('\n\n')

write(out('reports/participants.md'), `# Participants by show

Generated — do not edit. Re-run \`npm run extract\`.

Grouped by the affiliation recorded on the projects each person was credited
on **in that show**, not a single lifetime value: the same person can appear as
an undergraduate one year and an alum the next.

Where a show shows everyone under "Unspecified", affiliation was never recorded
for that show — see the coverage table in \`reports/taxonomy.md\`.

${participantsBody}
`)

const projectsBody = showIds.map((showId) => {
  const inShow = records
    .filter((r) => r.frontmatter.show === showId)
    .sort((a, b) => a.frontmatter.title.localeCompare(b.frontmatter.title))
  return `### ${shows.get(showId).title} (${inShow.length})\n\n` +
    table([
      ['Title', 'Creators', 'Medium', 'Status'],
      ['---', '---', '---', '---'],
      ...inShow.map((r) => [
        r.frontmatter.title,
        r.frontmatter.credits.map((c) => c.name).join(', ') || '—',
        r.frontmatter.medium.map((m) => mediumLabel[m] ?? m).join(', ') || '—',
        r.frontmatter.status,
      ]),
    ])
}).join('\n\n')

const orphans = records.filter((r) => !r.frontmatter.show)
write(out('reports/projects.md'), `# Projects by show

Generated — do not edit. Re-run \`npm run extract\`.

${records.length} projects across ${shows.size} shows.

${projectsBody}

### No show assigned (${orphans.length})

${table([['Title', 'Creators', 'Status'], ['---', '---', '---'],
  ...orphans.map((r) => [r.frontmatter.title, r.frontmatter.credits.map((c) => c.name).join(', ') || '—', r.frontmatter.status])])}
`)

console.log(`  Wrote ${records.length} projects, ${shows.size} shows, ${people.size} people`)
console.log(`  Vocabularies: ${vocab.medium.size} medium, ${vocab.affiliation.size} affiliation`)
console.log(`  Reports in reports/`)
if (generatedProposal) {
  console.log(`\n  ⚠  config/taxonomy-map.yaml was GENERATED and needs review.`)
  console.log(`     Edit it, then re-run to apply. Your edits will not be overwritten.\n`)
}
