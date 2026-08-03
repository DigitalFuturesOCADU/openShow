// WXR (WordPress eXtended RSS) reader.
//
// Reads the export into plain JS objects. Knows nothing about portfolios or
// the Royal theme — that lives in extract.mjs. The only job here is to turn
// XML into predictable shapes and to make meta/term lookup ergonomic.

import { readFileSync } from 'node:fs'
import { XMLParser } from 'fast-xml-parser'

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  // Titles like "2020" and slugs like "404" must stay strings.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  // A tag that appears once and a tag that appears many times should both
  // arrive as arrays, so callers never branch on cardinality.
  isArray: (name) =>
    ['item', 'wp:postmeta', 'category', 'wp:tag', 'wp:term', 'wp:category'].includes(name),
})

const text = (v) => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  // fast-xml-parser puts mixed content under #text
  if (typeof v === 'object' && '#text' in v) return String(v['#text'])
  return ''
}

export function readWxr(path) {
  const doc = parser.parse(readFileSync(path, 'utf8'))
  const channel = doc.rss.channel
  const items = (channel.item ?? []).map(normalizeItem)
  return { channel, items }
}

function normalizeItem(raw) {
  const meta = new Map()
  for (const m of raw['wp:postmeta'] ?? []) {
    meta.set(text(m['wp:meta_key']), text(m['wp:meta_value']))
  }

  // <category domain="..." nicename="..."> carries both taxonomies.
  const terms = []
  for (const c of raw.category ?? []) {
    terms.push({
      domain: c['@_domain'] ?? '',
      nicename: c['@_nicename'] ?? '',
      name: text(c),
    })
  }

  return {
    id: text(raw['wp:post_id']),
    type: text(raw['wp:post_type']),
    status: text(raw['wp:status']),
    title: text(raw.title),
    slug: text(raw['wp:post_name']),
    date: text(raw['wp:post_date']),
    parent: text(raw['wp:post_parent']),
    menuOrder: text(raw['wp:menu_order']),
    link: text(raw.link),
    content: text(raw['content:encoded']),
    excerpt: text(raw['excerpt:encoded']),
    attachmentUrl: text(raw['wp:attachment_url']),
    meta,
    terms,
    /** Convenience: meta value or '' */
    m(key) {
      return this.meta.get(key) ?? ''
    },
    /** Terms in one taxonomy */
    termsIn(domain) {
      return this.terms.filter((t) => t.domain === domain)
    },
  }
}

export const byType = (items, type) => items.filter((i) => i.type === type)
