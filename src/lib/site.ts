import type { CollectionEntry } from 'astro:content'
import vocab from '../../content/vocabularies.json'
import peopleData from '../../content/people.json'

export type Project = CollectionEntry<'projects'>

type Term = { slug: string; label: string; count: number }
export const MEDIUM = vocab.medium as Term[]
export const AFFILIATION = vocab.affiliation as Term[]

export const label = (axis: 'medium' | 'affiliation', slug: string) =>
  (axis === 'medium' ? MEDIUM : AFFILIATION).find((t) => t.slug === slug)?.label ?? slug

export type Person = {
  id: string
  name: string
  sortName: string
  kind: 'person' | 'collective'
  variants: string[]
  projects: string[]
  shows: string[]
  affiliations: string[]
  projectCount: number
  appearances: {
    show: string | null
    year: number | null
    project: string
    title: string
    affiliation: string[]
    affiliationExact?: boolean
    role: string | null
  }[]
}

export const PEOPLE = (peopleData as { people: Person[] }).people
export const personById = new Map(PEOPLE.map((p) => [p.id, p]))

/**
 * Alt text.
 *
 * 704 archived images carry none — WordPress recorded alt on 14 of 850
 * attachments, and those were placeholders. It cannot be migrated because it
 * was never written.
 *
 * `alt=""` would declare the image decorative, which is false: these images
 * ARE the content. A generated fallback naming the work and its position is
 * poor alt text but honest, and it beats announcing nothing. Real descriptions
 * arrive with 2026 submissions — see INTAKE-FORM.md §1b.
 */
export function altFor(projectTitle: string, alt: string | null, index: number, total: number): string {
  if (alt && alt.trim()) return alt.trim()
  return total > 1 ? `${projectTitle} — image ${index + 1} of ${total}` : projectTitle
}

export const featuredImage = (p: Project) =>
  p.data.media.find((m) => m.type === 'image' && m.role === 'featured') ??
  p.data.media.find((m) => m.type === 'image')

/** Facet counts across a set of projects, ordered by frequency. */
export function facetCounts(projects: Project[], axis: 'medium' | 'affiliation' | 'tags') {
  const counts = new Map<string, number>()
  for (const p of projects) {
    for (const v of p.data[axis] ?? []) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([slug, count]) => ({
      slug,
      count,
      label: axis === 'tags' ? slug : label(axis as 'medium' | 'affiliation', slug),
    }))
}

export const showTitle = (id: string) => {
  const [year, session] = id.split('-')
  return session ? `${session[0].toUpperCase()}${session.slice(1)} ${year}` : year
}
