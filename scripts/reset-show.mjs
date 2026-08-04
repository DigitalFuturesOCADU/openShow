#!/usr/bin/env node
// Delete a show and everything ingested for it, so you can start again.
//
//   node scripts/reset-show.mjs --show 2026              see what would go
//   node scripts/reset-show.mjs --show 2026 --confirm 2026   do it
//
// Deliberately awkward: it reports first, and doing it for real means typing
// the show id a second time. A stray return key cannot delete a year's work.
//
// It removes what was brought IN — ingested records, archived submission files,
// the show's declaration and the corrections attached to its projects. It does
// not touch sources/wordpress-export.xml, so a show that came from the archive
// cannot be erased this way, and it says so rather than half-doing it.

import { readdirSync, readFileSync, writeFileSync, existsSync, rmSync, statSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OV = join(ROOT, 'config/overrides.yaml')

const argv = process.argv.slice(2)
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : argv[i + 1] }
const SHOW = arg('show')
const CONFIRM = arg('confirm')

if (!SHOW) {
  console.error(`
  Usage: node scripts/reset-show.mjs --show <id> [--confirm <id>]

  Without --confirm it only reports. With --confirm matching --show, it deletes:
    · every project ingested for that show
    · the archived copies of the files submitted to it
    · the show's declaration, and corrections attached to its projects

  config/overrides.yaml is backed up first.
`)
  process.exit(1)
}

const subDir = join(ROOT, 'submissions', SHOW)
const archiveDir = join(ROOT, 'sources/submissions', SHOW)

// ------------------------------------------------------------- what exists

const records = existsSync(join(subDir, 'projects'))
  ? readdirSync(join(subDir, 'projects')).filter((f) => f.endsWith('.md'))
  : []

const projectIds = records.map((f) => {
  const fm = load(readFileSync(join(subDir, 'projects', f), 'utf8').split('---')[1]) ?? {}
  return String(fm.id)
})

const bytes = (dir) => {
  if (!existsSync(dir)) return 0
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    n += e.isDirectory() ? bytes(p) : statSync(p).size
  }
  return n
}

const text = existsSync(OV) ? readFileSync(OV, 'utf8') : ''
const hasDecl = new RegExp(`^show:${SHOW}:`, 'm').test(text)
const overrideIds = projectIds.filter((id) => new RegExp(`^${id}:`, 'm').test(text))

// A show whose work came from WordPress cannot be reset — the projects are
// derived from the export, and deleting its overrides would throw away
// hand-recovered data with nothing to regenerate it from.
const fromArchive = !records.length && existsSync(join(ROOT, 'content/projects')) &&
  readdirSync(join(ROOT, 'content/projects')).some((f) => {
    const fm = load(readFileSync(join(ROOT, 'content/projects', f), 'utf8').split('---')[1]) ?? {}
    return fm.show === SHOW
  })

if (fromArchive) {
  console.error(`\n  ✗ ${SHOW} came from the WordPress archive, not from a submission.`)
  console.error(`    Its projects are regenerated from sources/wordpress-export.xml every run,`)
  console.error(`    so deleting them here would achieve nothing and would throw away the`)
  console.error(`    dates and affiliations recovered by hand into config/overrides.yaml.`)
  console.error(`\n    To hide it instead, remove its show:${SHOW}: block from config/overrides.yaml.\n`)
  process.exit(1)
}

// ------------------------------------------------------------- report

console.log(`\n  RESETTING ${SHOW} would delete\n`)
const line = (n, what) => console.log(`  ${String(n).padStart(5)}  ${what}`)
line(records.length, `ingested project record(s) in submissions/${SHOW}/projects/`)
line(`${(bytes(archiveDir) / 1e6).toFixed(1)} MB`, `archived submitted files in sources/submissions/${SHOW}/`)
line(overrideIds.length, 'correction(s) in config/overrides.yaml for those projects')
line(hasDecl ? 1 : 0, `show declaration (date, venue, rooms)`)

if (!records.length && !hasDecl && !overrideIds.length) {
  console.log(`\n  Nothing to reset — ${SHOW} has nothing ingested or declared.\n`)
  process.exit(0)
}

if (CONFIRM !== SHOW) {
  console.log(`\n  Nothing has been deleted.`)
  console.log(`  To go ahead:  node scripts/reset-show.mjs --show ${SHOW} --confirm ${SHOW}\n`)
  process.exit(0)
}

// ------------------------------------------------------------- do it

copyFileSync(OV, OV + '.bak')
console.log(`\n  Backed up config/overrides.yaml -> config/overrides.yaml.bak`)

let out = text
if (hasDecl || overrideIds.length) {
  // Remove whole blocks by line, not by regex over the file: a block ends at
  // the next line that is not indented and not blank.
  const lines = out.split('\n')
  const drop = new Set()
  const kill = (head) => {
    drop.add(head)
    let i = head + 1
    while (i < lines.length && (lines[i].startsWith(' ') || lines[i].trim() === '')) drop.add(i++)
  }
  lines.forEach((l, i) => {
    const key = l.match(/^([^\s#][^:]*):/)?.[1]
    if (!key) return
    if (key === `show:${SHOW}` || overrideIds.includes(key)) kill(i)
  })
  out = lines.filter((_, i) => !drop.has(i)).join('\n').replace(/\n{3,}/g, '\n\n')
  writeFileSync(OV, out)
  console.log(`  Removed ${overrideIds.length} correction(s)${hasDecl ? ' and the show declaration' : ''}`)
}

for (const [dir, what] of [[subDir, 'ingested records'], [archiveDir, 'archived files']]) {
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true })
    console.log(`  Deleted ${what} (${dir.replace(ROOT + '/', '')})`)
  }
}

console.log(`\n  ${SHOW} is reset. Run extract to rebuild, then ingest again when ready.\n`)
