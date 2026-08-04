// Ingested submissions, kept apart from generated content.
//
// WHY THIS EXISTS
//
// `extract.mjs` clears content/projects/ and rebuilds it from source every run.
// Ingest used to write into that same directory, so the first "Rebuild content"
// after bringing in a year's submissions would have deleted all of them.
//
// So ingest writes here instead — submissions/<show>/projects/ — and extract
// reads these back and merges them with the WordPress archive. One writer for
// content/, and the layering matches the rest of the system:
//
//   sources/ + submissions/   what came in
//   config/                   corrections a human made
//   content/                  generated from both, never edited by hand
//
// Because extract regenerates everything, correcting the spreadsheet and
// re-ingesting updates the site. That is the intended way to fix submitted
// data: fix it at source, bring it in again. Corrections that cannot come from
// the form — merging two spellings of a name, assigning a medium — live in
// config/ and survive re-ingest because they are applied afterwards.

import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { load } from 'js-yaml'

export const SUBMISSIONS_DIR = 'submissions'

/** Every ingested project record, across all shows. */
export function readSubmissions(root) {
  const base = join(root, SUBMISSIONS_DIR)
  if (!existsSync(base)) return []

  const out = []
  for (const show of readdirSync(base, { withFileTypes: true })) {
    if (!show.isDirectory()) continue
    const dir = join(base, show.name, 'projects')
    if (!existsSync(dir)) continue

    for (const file of readdirSync(dir)) {
      if (!file.endsWith('.md')) continue
      const raw = readFileSync(join(dir, file), 'utf8')
      const split = raw.split('---')
      const frontmatter = load(split[1]) ?? {}
      const body = split.slice(2).join('---').replace(/^\n+/, '').trimEnd()
      out.push({ show: show.name, slug: file.replace(/\.md$/, ''), frontmatter, body })
    }
  }
  return out
}

/** Shows that have been ingested, whether or not anything else references them. */
export function submittedShows(root) {
  const base = join(root, SUBMISSIONS_DIR)
  if (!existsSync(base)) return []
  return readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
}
