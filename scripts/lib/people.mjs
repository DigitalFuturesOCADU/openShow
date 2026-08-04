// Creator names — capture, sort, display.
//
// WordPress stored all creators as one free-text string in a field misleadingly
// named `rf_project_desc_title`. There was no person entity, so the same human
// credited on four projects was four unrelated strings, and there was no way to
// list a person's work or to sort creators at all.
//
// This module turns that string into people: a registry of 347 distinct
// creators, each with a stable id, a display name, a sort name, and the
// variants they were credited under.

import { readFileSync, existsSync } from 'node:fs'
import { load } from 'js-yaml'

// WordPress stores HTML entities literally in post meta, so "A &amp; B" arrives
// with the entity intact. Decoding must happen BEFORE splitting on "&" or the
// separator itself becomes a person named "amp".
const ENTITIES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
  '&nbsp;': ' ', '&#039;': "'", '&#39;': "'", '&#8217;': '’',
  '&#8216;': '‘', '&#8220;': '“', '&#8221;': '”', '&#8211;': '–',
}

export function decodeEntities(s) {
  return String(s)
    .replace(/&[a-z]+;|&#\d+;/gi, (m) => ENTITIES[m.toLowerCase()] ?? ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
}

// Separators actually present in the data: "," (84), " and " (12), ";" (5),
// "&" (4). "/" appears in zero strings and is deliberately NOT a separator —
// splitting on it would only ever damage a name.
const SEP_AT_START = /^(\s*(?:,|;|&|\band\b)\s*)/i

/**
 * Split a credit string into { name, role, isCollective } entries.
 *
 * Three real patterns in the data, each needing different treatment:
 *
 *   "A, B and C"                      plain list
 *   "Ziqi Guo (Director); Yi Liu (Actor)"   trailing parenthetical is a ROLE
 *   "CAM Collective (A, B, C)."       parenthetical is a MEMBER LIST
 *
 * Splitting must therefore respect parentheses, or the collective's members
 * become fragments like "CAM Collective (Carisa Putri Antariksa".
 * A parenthetical containing a comma is read as members; otherwise as a role.
 */
export function splitCredits(raw) {
  const decoded = decodeEntities(raw).trim().replace(/\s*\.\s*$/, '')
  if (!decoded) return []

  // Split on separators only at paren depth 0.
  const chunks = []
  let cur = ''
  let depth = 0
  for (let i = 0; i < decoded.length; i++) {
    const ch = decoded[i]
    if (ch === '(') depth++
    else if (ch === ')') depth = Math.max(0, depth - 1)

    if (depth === 0 && ch !== ')') {
      const m = decoded.slice(i).match(SEP_AT_START)
      if (m) {
        chunks.push(cur)
        cur = ''
        i += m[1].length - 1
        continue
      }
    }
    cur += ch
  }
  chunks.push(cur)

  const out = []
  for (const chunk of chunks) {
    const text = chunk.replace(/\s+/g, ' ').trim()
    if (!text) continue

    const paren = text.match(/^(.*?)\s*\(([^)]*)\)\s*$/)
    if (!paren) {
      out.push({ name: text, role: null, isCollective: false })
      continue
    }

    const [, outer, inside] = paren
    const name = outer.trim()
    if (!name) {
      out.push({ name: inside.trim(), role: null, isCollective: false })
      continue
    }

    if (inside.includes(',')) {
      // "CAM Collective (A, B, C)" — the group plus its members, all credited.
      out.push({ name, role: null, isCollective: true })
      for (const member of inside.split(',').map((s) => s.trim()).filter(Boolean)) {
        out.push({ name: member, role: null, isCollective: false })
      }
    } else {
      out.push({ name, role: inside.trim() || null, isCollective: false })
    }
  }
  return out
}

/** Accent- and punctuation-insensitive key, for spotting the same person
 *  credited two ways ("Castaño-Suárez" vs "Castano Suarez"). */
export const nameKey = (n) =>
  String(n)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export const personSlug = (n) =>
  String(n)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// Particles that belong with the family name, not before it.
const PARTICLES = new Set(['van', 'von', 'de', 'del', 'della', 'da', 'di', 'dos', 'du', 'la', 'le', 'den', 'ter', 'bin', 'al'])

/**
 * "Family, Given" sort key.
 *
 * This is a heuristic and it is wrong for some names — family-name-first
 * conventions, compound surnames, mononyms. It exists to give a sensible
 * default, not to be authoritative. `needsSortReview` flags the cases a human
 * should confirm, and config/people.yaml overrides any of them.
 */
export function defaultSortName(name) {
  const parts = String(name).trim().split(/\s+/)
  if (parts.length === 1) return parts[0]

  let i = parts.length - 1
  while (i > 1 && PARTICLES.has(parts[i - 1].toLowerCase())) i--
  const family = parts.slice(i).join(' ')
  const given = parts.slice(0, i).join(' ')
  return `${family}, ${given}`
}

/** True when the sort heuristic is on shaky ground and a human should look. */
export const needsSortReview = (name) => {
  const parts = String(name).trim().split(/\s+/)
  return parts.length === 1 || parts.length > 3 || parts.some((p) => PARTICLES.has(p.toLowerCase()))
}

export function loadPeopleConfig(path) {
  if (!existsSync(path)) return { aliases: {}, sortNames: {}, collectives: [], notPeople: [] }
  const text = readFileSync(path, 'utf8')
  if (!text.replace(/^\s*#.*$/gm, '').trim()) return { aliases: {}, sortNames: {}, collectives: [], notPeople: [] }
  const doc = load(text) ?? {}
  return {
    aliases: doc.aliases ?? {},
    sortNames: doc.sortNames ?? {},
    collectives: doc.collectives ?? [],
    notPeople: doc.notPeople ?? [],
  }
}

/**
 * Build the people registry from all project records.
 * @param records  extracted project records
 * @param cfg      reviewed config/people.yaml
 */
export function buildPeople(records, cfg) {
  const collectives = new Set(cfg.collectives.map(nameKey))
  const notPeople = new Set(cfg.notPeople.map(nameKey))
  // alias -> canonical, matched on the normalised key so accents do not matter
  const aliasTo = new Map(Object.entries(cfg.aliases).map(([from, to]) => [nameKey(from), to]))

  const people = new Map() // slug -> person
  const variantsSeen = new Map() // key -> Set(raw spellings)

  for (const r of records) {
    const resolved = []
    for (const credit of r.credits) {
      const credited = credit.name
      const key = nameKey(credited)
      if (!key || notPeople.has(key)) continue

      const canonical = aliasTo.get(key) ?? credited
      const cslug = personSlug(canonical)
      if (!cslug) continue

      if (!people.has(cslug)) {
        people.set(cslug, {
          id: cslug,
          name: canonical,
          // A collective is never sorted as "Family, Given".
          sortName: cfg.sortNames[canonical] ?? (credit.isCollective ? canonical : defaultSortName(canonical)),
          kind: credit.isCollective || collectives.has(nameKey(canonical)) ? 'collective' : 'person',
          variants: [],
          projects: [],
          shows: [],
          appearances: [],
          sortReviewed: canonical in cfg.sortNames,
        })
      }
      const p = people.get(cslug)
      if (credit.isCollective) p.kind = 'collective'
      if (!p.projects.includes(r.slug)) p.projects.push(r.slug)
      const show = r.frontmatter.show
      if (show && !p.shows.includes(show)) p.shows.push(show)

      // Affiliation lives on the project, and it is a snapshot: the same person
      // can be an undergraduate in 2019 and an alum in 2023. So it is recorded
      // per appearance, never rolled up to a single value on the person. This
      // is what makes "participants in 2024, grouped by affiliation" answerable.
      // Where the project records more than one affiliation and has more than
      // one person, the project-level value cannot say WHICH person is which.
      // Inheriting the whole set puts every member in every group, which
      // inflates participant counts. Flag it rather than pretend precision.
      const teamIsMixed = r.frontmatter.affiliation.length > 1 && r.credits.length > 1
      p.appearances.push({
        show: show ?? null,
        year: r.frontmatter.year ?? null,
        project: r.slug,
        title: r.frontmatter.title,
        affiliation: credit.affiliation ? [credit.affiliation] : [...r.frontmatter.affiliation],
        affiliationExact: Boolean(credit.affiliation) || !teamIsMixed,
        role: credit.role ?? null,
      })

      if (!variantsSeen.has(cslug)) variantsSeen.set(cslug, new Set())
      variantsSeen.get(cslug).add(credited)

      resolved.push({
        personId: cslug,
        name: credited,
        role: credit.role ?? null,
        // Per-person affiliation. Always null for migrated data: WordPress
        // recorded affiliation on the project, so a mixed team of one faculty
        // member and three grads is indistinguishable from four of each.
        // The 2026 form asks per person — see INTAKE-FORM.md.
        affiliation: credit.affiliation ?? null,
      })
    }
    r.frontmatter.credits = resolved
  }

  for (const [slug, p] of people) {
    p.variants = [...(variantsSeen.get(slug) ?? [])].sort()
    p.projects.sort()
    p.shows.sort()
    p.appearances.sort((a, b) => String(a.show).localeCompare(String(b.show)))
    p.projectCount = p.projects.length
    // Every affiliation this person has ever been credited under, across all
    // years. Convenience for a global index; the per-year truth is appearances.
    p.affiliations = [...new Set(p.appearances.flatMap((a) => a.affiliation))].sort()
  }

  return people
}

/** Near-duplicate groups: distinct spellings that normalise to the same key.
 *  Safe to propose as automatic aliases — the letters are identical and only
 *  accents, hyphens or spacing differ. */
export function findNearDuplicates(allNames) {
  const groups = new Map()
  for (const n of allNames) {
    const k = nameKey(n)
    if (!groups.has(k)) groups.set(k, new Set())
    groups.get(k).add(n)
  }
  return [...groups.values()].filter((s) => s.size > 1).map((s) => [...s].sort())
}

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
    }
    prev = cur
  }
  return prev[b.length]
}

/**
 * Probable typos: names whose normalised keys are within a small edit distance
 * but are NOT identical — "maclearwall" vs "maclOearwall".
 *
 * These must never be merged automatically. Two real people can have names one
 * character apart, and silently collapsing them would erase someone's credit.
 * Proposed for human confirmation only.
 */
export function findFuzzyDuplicates(allNames, maxDistance = 2) {
  const keyed = allNames.map((n) => ({ n, k: nameKey(n) }))
  const pairs = []
  for (let i = 0; i < keyed.length; i++) {
    for (let j = i + 1; j < keyed.length; j++) {
      const a = keyed[i]
      const b = keyed[j]
      if (a.k === b.k) continue // exact match, handled by findNearDuplicates
      if (a.k.length < 8 || b.k.length < 8) continue // short names collide by chance
      const d = editDistance(a.k, b.k)
      if (d <= maxDistance) pairs.push({ a: a.n, b: b.n, distance: d })
    }
  }
  return pairs.sort((x, y) => x.distance - y.distance)
}
