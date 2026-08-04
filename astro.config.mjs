import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'

// `base` and `site` are read from the environment so the same build can be
// deployed at a domain root or under a path on a larger site (decision D6,
// still open). Nothing in the source may hardcode an absolute URL — use
// Astro.url / import.meta.env.BASE_URL so both layouts stay possible.
export default defineConfig({
  site: process.env.SITE_URL ?? 'https://df.show',
  base: process.env.BASE_PATH ?? '/',
  // Discoverability: an archive nobody can find is an archive nobody reads.
  integrations: [sitemap()],
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  image: {
    // Web masters are already capped at 2560px by scripts/sync-media.mjs;
    // these are the widths actually served.
    responsiveStyles: true,
  },
})
