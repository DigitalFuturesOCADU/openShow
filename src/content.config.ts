import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

// Schemas mirror what scripts/extract.mjs and scripts/ingest.mjs emit. If a
// field is added there, add it here — a build failure is the point, because a
// silently dropped field is how archives lose data.

const mediaItem = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('image'),
    id: z.number(),
    file: z.string(),
    role: z.literal('featured').optional(),
    // Present only where the true original was recovered from a WordPress
    // "-scaled" copy; kept as provenance.
    servedByWordpress: z.string().optional(),
    bytes: z.number().optional(),
    alt: z.string().nullable(),
    caption: z.string().nullable(),
  }),
  z.object({
    type: z.literal('video-file'),
    file: z.string().nullable(),
    poster: z.union([z.number(), z.string()]).nullable().optional(),
    sourceName: z.string().optional(),
    role: z.literal('featured').optional(),
    order: z.number().optional(),
    alt: z.string().nullable().optional(),
    caption: z.string().nullable().optional(),
  }),
  z.object({
    type: z.literal('video-embed'),
    provider: z.enum(['youtube', 'vimeo', 'other']),
    videoId: z.string().optional(),
    url: z.string().optional(),
  }),
  z.object({
    type: z.literal('external-link'),
    url: z.string(),
    note: z.string().optional(),
  }),
])

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/projects' }),
  schema: z.object({
    id: z.number(),
    slug: z.string(),
    title: z.string(),
    show: z.string().nullable(),
    year: z.number().nullable(),
    session: z.string().nullable(),
    affiliation: z.array(z.string()),
    medium: z.array(z.string()),
    tags: z.array(z.string()),
    credits: z.array(
      z.object({
        personId: z.string(),
        name: z.string(),
        role: z.string().nullable(),
        // Null for everything migrated from WordPress, which recorded
        // affiliation per project. See INTAKE-FORM.md §1d.
        affiliation: z.string().nullable().optional(),
      }),
    ),
    creditsRaw: z.string().nullable(),
    media: z.array(mediaItem),
    layout: z.string().default('default'),
    links: z.array(
      z.object({
        label: z.string(),
        url: z.string(),
        status: z.enum(['unchecked', 'ok', 'dead', 'unreachable', 'redirect']).default('unchecked'),
        checkedAt: z.string().optional(),
        finalUrl: z.string().optional(),
      }),
    ),
    status: z.enum(['publish', 'draft', 'stub']),
    consent: z.boolean().optional(),
    sourceTerms: z.array(z.string()).optional(),
    manualOverrides: z.array(z.string()).optional(),
    wordpress: z
      .object({
        postDate: z.string().nullable(),
        originalSlug: z.string().nullable(),
        link: z.string().nullable(),
      })
      .optional(),
    submission: z.record(z.string(), z.any()).optional(),
  }),
})

const shows = defineCollection({
  loader: glob({ pattern: '**/*.json', base: './content/shows' }),
  schema: z.object({
    id: z.string(),
    year: z.number(),
    session: z.string().nullable(),
    title: z.string(),
    dates: z.object({ start: z.string().nullable(), end: z.string().nullable() }),
    venue: z.string().nullable(),
    statement: z.string().nullable(),
    current: z.boolean().default(false),
    logo: z.string().nullable(),
    poster: z.union([z.number(), z.string()]).nullable(),
    teamPhoto: z.string().nullable().default(null),
    team: z.array(z.union([z.string(), z.object({ name: z.string(), role: z.string().nullable() })])).default([]),
    aboutPage: z.string().nullable().default(null),
    theme: z.object({
      tokens: z.record(z.string(), z.string()),
      indexLayout: z.string(),
      defaultProjectLayout: z.string(),
    }),
    projectCount: z.number(),
  }),
})

const pages = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './content/pages' }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    status: z.string(),
    wordpress: z.object({ originalSlug: z.string().nullable(), link: z.string().nullable() }).optional(),
  }),
})

export const collections = { projects, shows, pages }
