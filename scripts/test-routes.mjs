#!/usr/bin/env node
// Routing test for slugs, run before every deploy.
//
// Existing URLs are on students' CVs and grad-school applications. A slug that
// stops resolving is a real cost to a specific person years after they can do
// anything about it, so this is checked mechanically rather than spot-checked.

import { readdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const toRouteParam = (s) => {
  if (!s.includes('%')) return s
  try { return decodeURIComponent(s) } catch { return s }
}

let failed = 0
const check = (ok, label, detail = '') => {
  if (!ok) failed++
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? `\n      ${detail}` : ''}`)
}

// --- unit: the encoding round-trip ----------------------------------------

console.log('\n  SLUG ROUND-TRIP')
for (const stored of ['catlike%ef%bc%9aemotion-responsive-wearables', 'light-paint', 'jungle-straggle']) {
  const emitted = encodeURIComponent(toRouteParam(stored))
  check(
    emitted.toLowerCase() === stored.toLowerCase(),
    `${stored.slice(0, 46)} survives decode → encode`,
    emitted.toLowerCase() === stored.toLowerCase() ? '' : `got ${emitted}`,
  )
}

// A '%' that is not a valid escape must not throw. It cannot round-trip, and
// is not expected to — the requirement is that one bad record cannot kill the
// build for all 264.
let threw = false
try { toRouteParam('100%-broken') } catch { threw = true }
check(!threw, 'a stray % is tolerated rather than thrown on')

// --- integration: every real project ---------------------------------------

console.log('\n  EVERY PROJECT SLUG')
const dir = join(ROOT, 'content/projects')
const entries = readdirSync(dir).filter((f) => f.endsWith('.md'))
const seen = new Map()
let encodedCount = 0

for (const fn of entries) {
  const fm = load(readFileSync(join(dir, fn), 'utf8').split('---')[1]) ?? {}
  const slug = fm.slug ?? fn.replace(/\.md$/, '')
  const param = toRouteParam(slug)
  const emitted = encodeURIComponent(param)
  if (slug.includes('%')) encodedCount++
  if (emitted.toLowerCase() !== slug.toLowerCase()) {
    check(false, `${slug} does not round-trip`, `emitted ${emitted}`)
  }
  // Two projects resolving to one URL means one of them is unreachable.
  const key = param.toLowerCase()
  if (seen.has(key)) check(false, `URL collision: ${slug} and ${seen.get(key)}`)
  seen.set(key, slug)
}

check(true, `${entries.length} slugs checked, ${seen.size} distinct URLs, ${encodedCount} percent-encoded`)

console.log(failed ? `\n  ✗ ${failed} failure(s)\n` : '\n  → all route checks passed\n')
process.exit(failed ? 1 : 0)
