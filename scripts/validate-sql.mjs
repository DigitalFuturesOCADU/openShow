#!/usr/bin/env node
// Independent cross-validation of the extractor.
//
// The audit gate in extract.mjs proves the WXR parser is self-consistent. It
// cannot prove the parser is correct, because it uses that same parser to
// check itself. A parser that is consistently wrong passes its own gate.
//
// This script re-derives the same counts from sources/database.sql — a
// different source file, read by different code, with no shared parsing.
// Agreement between the two is real evidence; the gate alone is not.
//
// This is a phpMyAdmin dump, so every INSERT carries its own column list.
// Fields are read by name from that list rather than by assumed WordPress
// column order, so a schema difference cannot silently shift every value.

import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const sql = readFileSync(join(ROOT, 'sources/database.sql'), 'utf8')

// ------------------------------------------------------- tuple parser

/**
 * Parse one VALUES tuple starting at `i` (which must point at '(').
 * Returns [values, nextIndex]. Quote state is tracked explicitly so a ')' or
 * ';' inside a string literal cannot terminate anything early.
 */
function readTuple(i) {
  const row = []
  let cur = ''
  let inStr = false
  i++ // past '('
  for (; i < sql.length; i++) {
    const c = sql[i]
    if (inStr) {
      if (c === '\\') { cur += sql[++i] ?? ''; continue }        // backslash escape
      if (c === "'" && sql[i + 1] === "'") { cur += "'"; i++; continue } // '' escape
      if (c === "'") { inStr = false; continue }
      cur += c
      continue
    }
    if (c === "'") { inStr = true; continue }
    if (c === ',') { row.push(cur.trim()); cur = ''; continue }
    if (c === ')') { row.push(cur.trim()); return [row, i + 1] }
    cur += c
  }
  return [row, i]
}

/**
 * Yield an accessor per row across every INSERT for `table`. Column names come
 * from each statement's own `(\`a\`, \`b\`, ...)` list.
 */
function* readTable(table) {
  const re = new RegExp('INSERT INTO `' + table + '` \\(([^)]*)\\) VALUES', 'g')
  let stmt
  while ((stmt = re.exec(sql)) !== null) {
    const cols = stmt[1].split(',').map((s) => s.trim().replace(/`/g, ''))
    const idx = Object.fromEntries(cols.map((c, n) => [c, n]))
    let i = stmt.index + stmt[0].length
    for (;;) {
      while (i < sql.length && sql[i] !== '(' && sql[i] !== ';') i++
      if (i >= sql.length || sql[i] === ';') break
      const [row, next] = readTuple(i)
      yield (name) => row[idx[name]]
      i = next
      while (i < sql.length && /\s/.test(sql[i])) i++
      if (sql[i] !== ',') break
    }
  }
}

const tableReader = (table) => ({ read: () => readTable(table) })

// ------------------------------------------------------- derive counts

const posts = tableReader('wp_posts')
const byTypeStatus = new Map()
const postIdsByType = new Map()
for (const get of posts.read()) {
  const type = get('post_type')
  const status = get('post_status')
  byTypeStatus.set(`${type}/${status}`, (byTypeStatus.get(`${type}/${status}`) ?? 0) + 1)
  if (!postIdsByType.has(type)) postIdsByType.set(type, new Set())
  postIdsByType.get(type).add(get('ID'))
}

const portfolio = postIdsByType.get('royal_portfolio') ?? new Set()
const publish = byTypeStatus.get('royal_portfolio/publish') ?? 0
const draft = byTypeStatus.get('royal_portfolio/draft') ?? 0
const attachments = (postIdsByType.get('attachment') ?? new Set()).size

// terms in royal_portfolio_cats
const terms = new Map() // term_id -> name
for (const get of tableReader('wp_terms').read()) terms.set(get('term_id'), get('name'))

const catTtIds = new Set()
const skillTtIds = new Set()
for (const get of tableReader('wp_term_taxonomy').read()) {
  if (get('taxonomy') === 'royal_portfolio_cats') catTtIds.add(get('term_taxonomy_id'))
  if (get('taxonomy') === 'royal_portfolio_skills') skillTtIds.add(get('term_taxonomy_id'))
}
const ttToTerm = new Map()
for (const get of tableReader('wp_term_taxonomy').read()) ttToTerm.set(get('term_taxonomy_id'), get('term_id'))

// per-year, from the term prefix — same rule as the extractor, independent code
const RE_YEAR = /\b(20\d\d)\b/
const yearsByPost = new Map()
let skillAssignments = 0
const distinctCatTerms = new Set()
for (const get of tableReader('wp_term_relationships').read()) {
  const objectId = get('object_id')
  const ttId = get('term_taxonomy_id')
  if (skillTtIds.has(ttId)) skillAssignments++
  if (!catTtIds.has(ttId) || !portfolio.has(objectId)) continue
  const name = terms.get(ttToTerm.get(ttId)) ?? ''
  distinctCatTerms.add(name)
  const y = name.match(RE_YEAR)?.[1]
  if (!y) continue
  if (!yearsByPost.has(objectId)) yearsByPost.set(objectId, new Set())
  yearsByPost.get(objectId).add(Number(y))
}

const yearCounts = {}
for (const ys of yearsByPost.values()) {
  const y = Math.min(...ys)
  yearCounts[y] = (yearCounts[y] ?? 0) + 1
}
const unresolved = portfolio.size - yearsByPost.size

// thumbnail + gallery references, for the referential-integrity claim
const meta = tableReader('wp_postmeta')
const refIds = new Set()
let galleryMismatch = 0
const galleries = new Map()
for (const get of meta.read()) {
  const pid = get('post_id')
  if (!portfolio.has(pid)) continue
  const k = get('meta_key')
  const v = get('meta_value')
  if (k === '_thumbnail_id' && v.trim()) refIds.add(v.trim())
  if (k === 'rf_gallery_img_ids' || k === 'rf_gallery_imgs_src') {
    const n = v.split(',').map((s) => s.trim()).filter(Boolean)
    if (k === 'rf_gallery_img_ids') n.forEach((i) => refIds.add(i))
    const g = galleries.get(pid) ?? {}
    g[k === 'rf_gallery_img_ids' ? 'ids' : 'srcs'] = n.length
    galleries.set(pid, g)
  }
}
for (const g of galleries.values()) if ((g.ids ?? 0) !== (g.srcs ?? 0)) galleryMismatch++

const allAttachmentIds = postIdsByType.get('attachment') ?? new Set()
const dangling = [...refIds].filter((i) => !allAttachmentIds.has(i))

// ------------------------------------------------------- compare

const EXPECT = {
  'portfolio items': [portfolio.size, 264],
  published: [publish, 240],
  drafts: [draft, 24],
  attachments: [attachments, 850],
  'distinct cats terms': [distinctCatTerms.size, 189],
  'skills assignments': [skillAssignments, 0],
  'year unresolved': [unresolved, 8],
  'year 2019': [yearCounts[2019] ?? 0, 50],
  'year 2020': [yearCounts[2020] ?? 0, 58],
  'year 2021': [yearCounts[2021] ?? 0, 11],
  'year 2022': [yearCounts[2022] ?? 0, 37],
  'year 2023': [yearCounts[2023] ?? 0, 30],
  'year 2024': [yearCounts[2024] ?? 0, 32],
  'year 2025': [yearCounts[2025] ?? 0, 38],
  'distinct image refs': [refIds.size, 704],
  'dangling image ids': [dangling.length, 0],
  'gallery id/url mismatch': [galleryMismatch, 0],
}

console.log('\n  SQL CROSS-VALIDATION')
console.log('  Source: sources/database.sql (independent of the WXR)\n')
let bad = 0
for (const [label, [got, want]] of Object.entries(EXPECT)) {
  const ok = got === want
  if (!ok) bad++
  console.log(`  ${ok ? '✓' : '✗'} ${label.padEnd(26)} ${String(got).padStart(4)}  expected ${want}`)
}

if (bad) {
  console.error(`\n  ✗ ${bad} disagreement(s) between the SQL dump and the audit.`)
  console.error('    The two sources do not tell the same story — diagnose before trusting either.\n')
  process.exit(1)
}
console.log('\n  → SQL dump agrees with the WXR on every count.')
console.log('    Two independent sources, two independent parsers, same numbers.\n')
