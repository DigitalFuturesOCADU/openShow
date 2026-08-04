/**
 * Slug ↔ URL handling.
 *
 * One archived project has a fullwidth colon in its slug. WordPress stored it
 * percent-encoded — `catlike%ef%bc%9aemotion-responsive-wearables` — and that
 * is the literal URL students have on their CVs.
 *
 * The trap: handing that stored string to a router as a path parameter gets the
 * `%` encoded again, yielding `catlike%25ef%25bc%259a…`, which 404s. The route
 * parameter has to be the DECODED text, so the encoder reproduces the original.
 *
 *     stored slug   catlike%ef%bc%9aemotion-responsive-wearables
 *     route param   catlike：emotion-responsive-wearables
 *     emitted URL   catlike%ef%bc%9aemotion-responsive-wearables   ← matches
 *
 * PLAN.md warned about non-ASCII slugs but had the direction backwards: the
 * export is already ASCII, so the risk is failing to decode, not failing to
 * encode.
 */

/** Stored slug → route parameter. */
export function toRouteParam(slug: string): string {
  if (!slug.includes('%')) return slug
  try {
    return decodeURIComponent(slug)
  } catch {
    // A stray '%' that is not a valid escape. Leave it alone rather than throw:
    // a wrong-looking URL beats a build that dies on one bad record.
    return slug
  }
}

/** Route parameter → stored slug, for looking an entry back up. */
export function fromRouteParam(param: string): string {
  return encodeURIComponent(param).replace(/%2F/gi, '/')
}

/** The path a project is served at. Honours `base` for subpath deploys (D6). */
export function projectPath(slug: string, base = import.meta.env.BASE_URL ?? '/'): string {
  const prefix = base.endsWith('/') ? base : `${base}/`
  return `${prefix}portfolio/items/${encodeURIComponent(toRouteParam(slug))}`
}
