// Taxonomy normalisation — the part of the migration that needs human review.
//
// `royal_portfolio_cats` conflates three orthogonal dimensions into one flat
// vocabulary of 189 terms. Observed shapes, in the order we test for them:
//
//   Open Show 2019 - December     parent//marker term, no concept
//   Open Show 2019 – February     ...and it uses an EN DASH. Both are real.
//   2019 December Installation    year + session + concept
//   2025 Installation             year + concept
//   3D Animation                  bare concept, no year
//
// Year is taken from the prefix and NEVER from the post date — see the Known
// Traps section of PLAN.md. Post dates are unreliable; 2023 items are dated
// both April and December 2023.

import { readFileSync, existsSync } from 'node:fs'
import { load } from 'js-yaml'

const RE_PARENT = /^Open Show\s+(20\d\d)(?:\s*[-–—]\s*(December|February))?\s*$/i
const RE_YEAR_SESSION = /^(20\d\d)\s+(December|February)\s+(.+)$/i
const RE_YEAR = /^(20\d\d)\s+(.+)$/

export function parseTerm(name) {
  const raw = name.trim()

  let m = raw.match(RE_PARENT)
  if (m) {
    return { kind: 'parent', year: Number(m[1]), session: m[2]?.toLowerCase() ?? null, concept: null }
  }
  m = raw.match(RE_YEAR_SESSION)
  if (m) {
    return { kind: 'concept', year: Number(m[1]), session: m[2].toLowerCase(), concept: m[3].trim() }
  }
  m = raw.match(RE_YEAR)
  if (m) {
    return { kind: 'concept', year: Number(m[1]), session: null, concept: m[2].trim() }
  }
  return { kind: 'concept', year: null, session: null, concept: raw }
}

export const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

// Affiliation is unambiguous — no review needed.
export const AFFILIATION = {
  Undergraduate: 'undergraduate',
  Undergrad: 'undergraduate',
  Graduate: 'graduate',
  Alumni: 'alumni',
  Faculty: 'faculty',
  UGThesis: 'ug-thesis',
}

// Typos and spacing only. Merging these loses no information.
export const AUTO_MERGE = {
  Sculputure: 'Sculpture',
  Performace: 'Performance',
  PhysicalComputing: 'Physical Computing',
  DigitalFabrication: 'Digital Fabrication',
  '3Dprinting': '3D Printing',
  DataVisualization: 'Data Visualization',
  SpeculativeFiction: 'Speculative Fiction',
}

// Defensible but not obvious. Each needs a human to confirm the merge does not
// erase a distinction someone meant. Proposed target -> rationale.
export const REVIEW_MERGE = {
  ML_AI: ['AI', 'one of five terms for the same concept'],
  'Machine Learning': ['AI', 'one of five terms for the same concept'],
  'Artificial Intelligence': ['AI', 'one of five terms for the same concept'],
  'Deep Neural Networks': ['AI', 'a technique, not a medium — merge or drop?'],
  'Generative Art': ['Generative', 'three variants of one concept'],
  'Generative design': ['Generative', 'three variants of one concept'],
  'Wearable Electronics': ['Wearables', 'PLAN.md proposes this merge'],
  'Interactive Installation': [
    'Installation',
    '2022 used this for 15 items; every other year used "Installation". Drift or a real distinction?',
  ],
  '3D Animation': ['Animation', 'both used, sometimes in the same year'],
  'Sonic Art': ['Sound', 'sound-family term'],
  Audio: ['Sound', 'sound-family term'],
  NIME: ['Sound', 'NIME is a research field, not a medium — may not belong on this axis at all'],
  Webdoc: ['Interactive Documentary', 'almost certainly one concept, one item each'],
  'UX Design': ['UX', 'spacing variant'],
  'visualization and analysis': ['Data Visualization', 'lowercase one-off'],
  'Digital Artwork': [null, 'too generic to be a useful facet — drop?'],
}

/**
 * Build a review-ready mapping proposal from the observed term list.
 * Returns YAML text with counts and review markers as comments, because a
 * reviewer needs to see frequency to judge whether a merge matters.
 */
export function buildProposalYaml(conceptCounts) {
  const affil = []
  const auto = []
  const review = []
  const plain = []

  for (const [concept, count] of [...conceptCounts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    if (concept in AFFILIATION) {
      affil.push([concept, AFFILIATION[concept], count, null])
    } else if (concept in AUTO_MERGE) {
      auto.push([concept, slugify(AUTO_MERGE[concept]), count, `-> ${AUTO_MERGE[concept]}`])
    } else if (concept in REVIEW_MERGE) {
      const [target, why] = REVIEW_MERGE[concept]
      review.push([concept, target ? slugify(target) : null, count, why])
    } else {
      plain.push([concept, slugify(concept), count, count === 1 ? 'used once — keep, merge, or drop?' : null])
    }
  }

  const line = ([src, target, count, note]) => {
    const key = /[^A-Za-z0-9 ]/.test(src) || /^\d/.test(src) ? JSON.stringify(src) : src
    const val = target === null ? '~' : target
    const comment = note ? `   # (${count}) ${note}` : `   # (${count})`
    return `  ${key}: ${val}${comment}`
  }

  return `# Taxonomy mapping — REVIEW REQUIRED
#
# Generated from the 189 terms in royal_portfolio_cats. Edit this file, then
# re-run \`npm run extract\` to apply it. The extractor reads this file if it
# exists and regenerates it only when it does not, so your edits are safe.
#
# Left side  = concept as it appears in WordPress (year/session already stripped)
# Right side = normalised slug, or \`~\` to drop the term entirely
# Comment    = (item count) and, where relevant, why this one needs a decision
#
# Sections marked REVIEW are judgement calls, not typos. Everything in
# AUTO-MERGE is a spelling or spacing variant and is safe as proposed.

affiliation:
${affil.map(line).join('\n')}

medium:

  # --- AUTO-MERGE: spelling and spacing variants, safe as proposed ----------
${auto.map(line).join('\n')}

  # --- REVIEW: merges that may erase a real distinction ---------------------
${review.map(line).join('\n')}

  # --- UNAMBIGUOUS: kept as-is -------------------------------------------
${plain.map(line).join('\n')}
`
}

export function loadMap(path) {
  if (!existsSync(path)) return null
  const doc = load(readFileSync(path, 'utf8')) ?? {}
  return {
    affiliation: doc.affiliation ?? {},
    medium: doc.medium ?? {},
  }
}
