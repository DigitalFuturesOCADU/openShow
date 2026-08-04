#!/usr/bin/env node
// External link checker.
//
// 233 projects link out, mostly to student portfolio sites, itch.io pages and
// personal domains. Those decay: a link that worked in 2019 frequently does not
// now, and the archive has no way to know without asking.
//
// Results are written to config/link-status.json rather than into the project
// files, because extract.mjs regenerates those on every run. extract reads the
// file back and stamps each link with what was found.
//
//   node scripts/check-links.mjs            check every link
//   node scripts/check-links.mjs --stale 30 only re-check entries older than 30 days
//
// Deliberately gentle: low concurrency, a real User-Agent, HEAD before GET, and
// one retry. The point is to learn which links are dead, not to hammer anyone's
// personal site.

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'config/link-status.json')

const argv = process.argv.slice(2)
const staleArg = argv.indexOf('--stale')
const STALE_DAYS = staleArg === -1 ? null : Number(argv[staleArg + 1] ?? 30)

const CONCURRENCY = 6
const TIMEOUT_MS = 12_000
const UA = 'df.show-archive-linkcheck/1.0 (+https://df.show)'

// ---------------------------------------------------------------- collect

const links = new Map() // url -> [{project, title}]
for (const fn of readdirSync(join(ROOT, 'content/projects'))) {
  const fm = load(readFileSync(join(ROOT, 'content/projects', fn), 'utf8').split('---')[1]) ?? {}
  for (const l of fm.links ?? []) {
    if (!/^https?:\/\//i.test(l.url)) continue
    if (!links.has(l.url)) links.set(l.url, [])
    links.get(l.url).push({ project: fm.slug, title: fm.title })
  }
}

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')).links ?? {} : {}
const cutoff = STALE_DAYS ? Date.now() - STALE_DAYS * 864e5 : null

const queue = [...links.keys()].filter((url) => {
  if (!cutoff) return true
  const prev = previous[url]
  return !prev?.checkedAt || Date.parse(prev.checkedAt) < cutoff
})

console.log(`${links.size} distinct external links across ${new Set([...links.values()].flat().map((v) => v.project)).size} projects`)
console.log(`${queue.length} to check${STALE_DAYS ? ` (older than ${STALE_DAYS} days)` : ''}\n`)

// ---------------------------------------------------------------- check

async function probe(url, method) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method,
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'user-agent': UA, accept: '*/*' },
    })
    return { status: res.status, finalUrl: res.url }
  } finally {
    clearTimeout(timer)
  }
}

async function check(url) {
  // HEAD first — cheaper for everyone. Plenty of servers reject or mishandle it,
  // so a non-2xx HEAD is retried as GET before being believed.
  for (const method of ['HEAD', 'GET']) {
    try {
      const { status, finalUrl } = await probe(url, method)
      if (status >= 200 && status < 400) {
        const redirected = finalUrl && finalUrl.replace(/\/$/, '') !== url.replace(/\/$/, '')
        return {
          state: redirected ? 'redirect' : 'ok',
          httpStatus: status,
          ...(redirected ? { finalUrl } : {}),
        }
      }
      if (method === 'GET') return { state: 'dead', httpStatus: status }
    } catch (e) {
      if (method === 'GET') {
        const why = e.name === 'AbortError' ? 'timeout' : (e.cause?.code ?? e.message ?? 'error')
        return { state: 'unreachable', error: String(why).slice(0, 60) }
      }
    }
  }
  return { state: 'unreachable', error: 'no response' }
}

const results = { ...previous }
let done = 0

async function worker(items) {
  for (const url of items) {
    const r = await check(url)
    results[url] = { ...r, checkedAt: new Date().toISOString() }
    done++
    if (done % 25 === 0) process.stdout.write(`  ${done}/${queue.length}\n`)
  }
}

const chunks = Array.from({ length: CONCURRENCY }, (_, i) =>
  queue.filter((_, n) => n % CONCURRENCY === i),
)
await Promise.all(chunks.map(worker))

// ---------------------------------------------------------------- report

const tally = {}
for (const url of links.keys()) {
  const st = results[url]?.state ?? 'unchecked'
  tally[st] = (tally[st] ?? 0) + 1
}

writeFileSync(OUT, JSON.stringify({
  $comment: 'External link health. Written by scripts/check-links.mjs and read back by extract.mjs, which stamps each link. Kept out of content/ because that is regenerated.',
  checkedAt: new Date().toISOString(),
  links: results,
}, null, 2) + '\n')

console.log('\n  RESULT')
for (const [state, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  ${state}`)
}

const broken = [...links.keys()].filter((u) => ['dead', 'unreachable'].includes(results[u]?.state))
if (broken.length) {
  console.log(`\n  BROKEN (${broken.length}) — these projects link nowhere:`)
  for (const url of broken.slice(0, 25)) {
    const who = links.get(url)[0]
    const r = results[url]
    console.log(`      ${who.title.slice(0, 34).padEnd(34)} ${r.state}${r.httpStatus ? ` ${r.httpStatus}` : ''}${r.error ? ` (${r.error})` : ''}`)
    console.log(`        ${url.slice(0, 88)}`)
  }
  if (broken.length > 25) console.log(`      …and ${broken.length - 25} more, all in ${OUT.replace(ROOT + '/', '')}`)
}

console.log(`\n  Written to ${OUT.replace(ROOT + '/', '')}. Re-run extract to stamp the project files.\n`)
