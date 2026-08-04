#!/usr/bin/env node
// Move a show through its two gates.
//
//   node scripts/publish.mjs --show 2026 --review     draft -> publish
//   node scripts/publish.mjs --show 2026 --open       announced -> open
//
// The gates are deliberately separate. `status: publish` says a human looked at
// this work and it is right. A show being `open` says the exhibition has
// started. Reviewing forty submissions in November should not put them online
// in November — so both must hold before anything is public.
//
// --review edits config/overrides.yaml rather than the project files, because
// extract regenerates those; --open flips one line on the show declaration.

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OV = join(ROOT, 'config/overrides.yaml')

const argv = process.argv.slice(2)
const arg = (n) => { const i = argv.indexOf(`--${n}`); return i === -1 ? null : argv[i + 1] }
const SHOW = arg('show')
const DRY = argv.includes('--dry-run')

const CREATE = argv.includes('--create')
if (!SHOW || (!CREATE && !argv.includes('--review') && !argv.includes('--open'))) {
  console.error(`
  Usage: node scripts/publish.mjs --show <id> [options]

    --create   declare a new show so its page can go up before any work
                 --date  2026-12-09        --time  "5:00 – 8:00 pm"
                 --venue "205 Richmond Street West"
                 --rooms "Graduate Gallery, X Fab Space"
    --review   mark every draft in this show as reviewed (draft -> publish)
    --open     release work held back by "visibility: announced"
    --dry-run  print what would change and write nothing

  Then: npm run extract && npm run build
`)
  process.exit(1)
}

const projects = readdirSync(join(ROOT, 'content/projects'))
  .map((f) => load(readFileSync(join(ROOT, 'content/projects', f), 'utf8').split('---')[1]) ?? {})
  .filter((p) => p.show === SHOW)

let text = existsSync(OV) ? readFileSync(OV, 'utf8') : ''
const additions = []

if (CREATE) {
  if (new RegExp(`^show:${SHOW}:`, 'm').test(text)) {
    console.log(`  ${SHOW} is already declared in config/overrides.yaml — nothing to do`)
  } else {
    const rooms = arg('rooms')
    const date = arg('date')
    additions.push([
      `show:${SHOW}:`,
      `  current: true`,
      date ? `  dates: { start: "${date}", end: "${arg('end') ?? date}" }` : `  dates: { start: null, end: null }`,
      arg('time') ? `  time: "${arg('time')}"` : null,
      arg('venue') ? `  venue: "${arg('venue')}"` : null,
      rooms ? `  rooms: [${rooms.split(',').map((r) => `"${r.trim()}"`).join(', ')}]` : null,
    ].filter(Boolean).join('\n'))
    console.log(`  ${SHOW}: declared${date ? `, ${date}` : ''}`)

    // Only one show is the current one.
    const others = [...text.matchAll(/^show:(\S+):/gm)].map((m) => m[1]).filter((id) => id !== SHOW)
    const stillCurrent = others.filter((id) =>
      new RegExp(`^show:${id}:(?:\\n\\s+.*)*?\\n\\s+current:\\s*true`, 'm').test(text))
    for (const id of stillCurrent) {
      text = text.replace(new RegExp(`(show:${id}:(?:\\n\\s+.*)*?\\n\\s+current:\\s*)true`), '$1false')
      console.log(`  ${id}: current -> false`)
    }
  }
}

if (argv.includes('--review')) {
  const drafts = projects.filter((p) => p.status !== 'publish')
  console.log(`  ${drafts.length} unreviewed of ${projects.length} in ${SHOW}`)

  // An id already in the file must be extended, not appended again. YAML has no
  // notion of a repeated key — js-yaml throws — so a blind append would leave
  // config/overrides.yaml unparseable and every later run broken.
  const existing = new Set([...text.matchAll(/^(\d+):/gm)].map((m) => m[1]))
  const fresh = drafts.filter((p) => !existing.has(String(p.id)))
  const clash = drafts.filter((p) => existing.has(String(p.id)))

  for (const p of fresh) additions.push(`${p.id}:\n  status: publish\n  note: "reviewed for ${SHOW}"`)

  if (clash.length) {
    console.log(`\n  ${clash.length} already have an entry in config/overrides.yaml.`)
    console.log(`  Add "status: publish" to each by hand rather than duplicating the key:`)
    for (const p of clash.slice(0, 20)) console.log(`      ${p.id}  ${p.title}`)
  }
  if (!drafts.length) console.log('  nothing to review')
}

if (argv.includes('--open')) {
  // Line-based, not a regex over the whole file. config/overrides.yaml is
  // hand-maintained and full of comments, and an earlier whole-file regex
  // silently appended a SECOND `show:<id>:` block when it failed to match —
  // YAML has no repeated keys, so js-yaml then refused to parse anything and
  // every later run broke. Find the block, edit inside it, or append only when
  // it genuinely is not there.
  const lines = text.split('\n')
  const head = lines.findIndex((l) => l.trimEnd() === `show:${SHOW}:`)

  if (head === -1) {
    additions.push(`show:${SHOW}:\n  visibility: open`)
    console.log(`  ${SHOW}: no declaration found — adding one, set to open`)
  } else {
    let end = head + 1
    while (end < lines.length && (lines[end].startsWith('  ') || lines[end].trim() === '')) end++
    const vis = lines.slice(head + 1, end).findIndex((l) => /^\s+visibility:/.test(l))
    if (vis === -1) {
      lines.splice(head + 1, 0, '  visibility: open')
      console.log(`  ${SHOW}: visibility added, set to open`)
    } else {
      const at = head + 1 + vis
      const was = lines[at].split(':')[1].trim()
      lines[at] = lines[at].replace(/visibility:\s*\w+/, 'visibility: open')
      console.log(`  ${SHOW}: ${was} -> open`)
    }
    text = lines.join('\n')
  }
}

if (additions.length) {
  text += `\n# Added by scripts/publish.mjs\n${additions.join('\n')}\n`
}

if (DRY) {
  console.log('\n  dry run — config/overrides.yaml unchanged\n')
} else {
  writeFileSync(OV, text)
  console.log(`\n  Wrote config/overrides.yaml. Run \`npm run extract\` to apply.\n`)
}
