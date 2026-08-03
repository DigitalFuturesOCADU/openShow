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

import { mkdirSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dump } from 'js-yaml'
import TurndownService from 'turndown'
import { readWxr, byType } from './lib/wxr.mjs'
import { parseTerm, slugify, deriveLabel, AFFILIATION, AUTO_MERGE, REVIEW_MERGE, buildProposalYaml, loadMap } from './lib/taxonomy.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'sources/wordpress-export.xml')
const UPLOADS = join(ROOT, 'sources/uploads')
const MAP_PATH = join(ROOT, 'config/taxonomy-map.yaml')

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

const splitCredits = (raw) =>
  String(raw)
    .split(/\s*(?:,|;|\band\b|&|\/)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((name) => ({ name, role: null }))

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

// id -> attachment facts, so images resolve by ID and never by stored URL.
const attIndex = new Map()
for (const a of attachments) {
  const rel = uploadRelPath(a.attachmentUrl)
  attIndex.set(a.id, {
    id: Number(a.id),
    file: rel,
    exists: rel ? existsSync(join(UPLOADS, rel)) : false,
    bytes: rel && existsSync(join(UPLOADS, rel)) ? statSync(join(UPLOADS, rel)).size : 0,
    mime: rel ? (rel.split('.').pop() || '').toLowerCase() : '',
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
  noAlt: 0, withAlt: 0, links: [], selfHostedVideo: [], embeds: [], dedupedImages: 0,
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
    media.push({
      type: 'image', id: a.id, file: a.file,
      ...(role ? { role } : {}),
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

  if (!year) notes.unresolvedYear.push({ id: p.id, title: p.title, status, slug })

  records.push({
    p, slug, year, session, status,
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
      credits: splitCredits(creditsRaw),
      creditsRaw: creditsRaw || null,
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

const vocab = { medium: new Set(), affiliation: new Set() }
for (const r of records) {
  r.frontmatter.medium.forEach((m) => vocab.medium.add(m))
  r.frontmatter.affiliation.forEach((a) => vocab.affiliation.add(a))
}

const overrides = reviewedMap?.labels ?? {}
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
Assign manually in the project file's frontmatter.

${table([['ID', 'Status', 'Title', 'Slug'], ['---', '---', '---', '---'],
  ...notes.unresolvedYear.map((u) => [u.id, u.status, u.title, `\`${u.slug}\``])])}

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

console.log(`  Wrote ${records.length} projects, ${shows.size} shows`)
console.log(`  Vocabularies: ${vocab.medium.size} medium, ${vocab.affiliation.size} affiliation`)
console.log(`  Reports in reports/`)
if (generatedProposal) {
  console.log(`\n  ⚠  config/taxonomy-map.yaml was GENERATED and needs review.`)
  console.log(`     Edit it, then re-run to apply. Your edits will not be overwritten.\n`)
}
