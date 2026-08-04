#!/usr/bin/env node
// Materialise the source tier: true originals -> web masters.
//
// Three tiers, per EXECUTION.md §4.4:
//
//   ARCHIVE  true originals, 1.33 GB. Stay in sources/uploads (git-ignored,
//            backed up off-machine) and belong in cold object storage.
//            Never served, never in git, never re-encoded. The preservation copy.
//
//   SOURCE   content/images/ — one web master per image, long edge capped at
//            2560px. This is what the site build consumes and what lives in
//            git. Lossy relative to the archive by design; the archive is the
//            thing that must not be.
//
//   DERIVED  responsive widths, WebP, AVIF. Produced at build time by Astro,
//            never committed.
//
// Re-encoding here is safe precisely because the archive tier exists. Nothing
// is lost that cannot be regenerated from sources/uploads.
//
//   node scripts/sync-media.mjs --dry-run   measure without writing
//   node scripts/sync-media.mjs             write content/images/

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync, statSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { load } from 'js-yaml'
import sharp from 'sharp'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const UPLOADS = join(ROOT, 'sources/uploads')
const DEST = join(ROOT, 'content/images')
const DRY = process.argv.includes('--dry-run')

// WordPress' own cap. Beyond this adds bytes no browser will ever use.
const MAX_EDGE = 2560
const JPEG_QUALITY = 82

const mb = (n) => (n / 1e6).toFixed(1) + ' MB'

// ---------------------------------------------------------------- collect

const images = new Map() // file -> {id, bytes}
for (const fn of readdirSync(join(ROOT, 'content/projects'))) {
  const fm = load(readFileSync(join(ROOT, 'content/projects', fn), 'utf8').split('---')[1])
  for (const m of fm.media ?? []) {
    if (m.type === 'image' && m.file) images.set(m.file, { id: m.id, bytes: m.bytes ?? 0 })
  }
}
// Editorial pages reference a handful of images too. They are copied verbatim
// rather than re-encoded, so the relative paths written into the markdown stay
// valid whatever the original extension was.
let pageImageCount = 0
try {
  const pageList = JSON.parse(readFileSync(join(ROOT, 'content/page-images.json'), 'utf8')).images ?? []
  for (const rel of pageList) {
    const src = join(UPLOADS, rel)
    if (!existsSync(src)) continue
    if (!DRY) {
      mkdirSync(dirname(join(DEST, rel)), { recursive: true })
      copyFileSync(src, join(DEST, rel))
    }
    pageImageCount++
  }
} catch {}

console.log(`${images.size} source images referenced by projects` +
  (pageImageCount ? `, plus ${pageImageCount} on editorial pages` : '') + '\n')

// ---------------------------------------------------------------- process

let inBytes = 0
let outBytes = 0
let resized = 0
let copied = 0
const failures = []
const oversize = []
const verbatimReasons = []
const manifest = {}
let converted = 0

for (const [rel, meta] of images) {
  const src = join(UPLOADS, rel)
  if (!existsSync(src)) {
    failures.push({ rel, why: 'missing from uploads' })
    continue
  }
  inBytes += statSync(src).size

  const dst = join(DEST, rel)

  const copyVerbatim = async (why) => {
    if (!DRY) {
      mkdirSync(dirname(dst), { recursive: true })
      copyFileSync(src, dst)
    }
    const bytes = statSync(src).size
    outBytes += bytes
    copied++
    let w = null, h = null
    try {
      const m = await sharp(src, { failOn: 'none', limitInputPixels: false }).metadata()
      w = m.width; h = m.height
    } catch {}
    manifest[rel] = { file: rel, bytes, width: w, height: h }
    if (why) verbatimReasons.push({ rel, why })
  }

  try {
    // failOn:'none' tolerates the one JPEG in the archive with invalid SOS
    // parameters; limitInputPixels:false allows a large animated GIF whose
    // frames multiply past sharp's default ceiling. Both are real files here,
    // and refusing them would mean losing an image rather than shipping one.
    const img = sharp(src, { animated: true, failOn: 'none', limitInputPixels: false })
    const { width, height, format, pages } = await img.metadata()
    const longEdge = Math.max(width ?? 0, height ?? 0)

    // Animated formats: re-encoding risks dropping frames for little gain, and
    // they are a small share of the total. Preserve them as-is.
    if (format === 'gif' || (pages ?? 1) > 1) {
      await copyVerbatim(null)
      continue
    }

    let pipeline = img
    if (longEdge > MAX_EDGE) {
      pipeline = pipeline.resize({
        ...(width >= height ? { width: MAX_EDGE } : { height: MAX_EDGE }),
        withoutEnlargement: true,
      })
      resized++
    }

    // Format choice matters more than any quality knob here.
    //
    // Half the archive is PNG, and much of it is photographic — screenshots of
    // installations, documentation photos saved as PNG. Recompressing those as
    // PNG almost always produces a LARGER file, because the original encoder
    // already did the work. Palette-quantising them to 256 colours would shrink
    // them dramatically, but it visibly bands photographs, which is not an
    // acceptable trade for an art archive.
    //
    // So: transparency keeps PNG and stays lossless. Everything else becomes
    // JPEG, which is what it should have been. The true original is preserved
    // in the archive tier regardless.
    const hasAlpha = Boolean((await img.stats()).isOpaque === false)
    const useJpeg = format !== 'png' || !hasAlpha
    const ext = useJpeg ? 'jpg' : 'png'

    pipeline = useJpeg
      ? pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      : pipeline.png({ compressionLevel: 9 })

    const buf = await pipeline.toBuffer()
    const outRel = rel.replace(/\.\w+$/, '.' + ext)
    const outDst = join(DEST, outRel)

    // A "web master" larger than the original helps nobody.
    if (buf.length >= statSync(src).size) {
      await copyVerbatim('re-encode was larger than the original')
      continue
    }

    outBytes += buf.length
    if (buf.length > 4e6) oversize.push({ rel: outRel, bytes: buf.length })
    if (ext !== rel.split('.').pop().toLowerCase()) converted++

    manifest[rel] = { file: outRel, bytes: buf.length, width: null, height: null }
    const meta2 = await sharp(buf).metadata()
    manifest[rel].width = meta2.width
    manifest[rel].height = meta2.height

    if (!DRY) {
      mkdirSync(dirname(outDst), { recursive: true })
      writeFileSync(outDst, buf)
    }
  } catch (e) {
    // Never lose an image to a processing error — ship the original instead.
    try {
      await copyVerbatim(`could not re-encode: ${e.message}`)
    } catch {
      failures.push({ rel, why: e.message })
    }
  }
}

// ---------------------------------------------------------------- report

console.log(`  archive tier (true originals):  ${mb(inBytes)}`)
console.log(`  source tier  (web masters):     ${mb(outBytes)}   ${(100 * (1 - outBytes / inBytes)).toFixed(0)}% smaller`)
console.log(`  downscaled to ${MAX_EDGE}px:            ${resized}`)
console.log(`  re-encoded PNG -> JPEG:         ${converted}`)
console.log(`  copied verbatim (animated/unprocessable): ${copied}`)
if (verbatimReasons.length) {
  console.log(`\n  ${verbatimReasons.length} copied verbatim for a specific reason:`)
  for (const v of verbatimReasons) console.log(`      ${v.rel}\n        ${v.why}`)
}

if (oversize.length) {
  console.log(`\n  ${oversize.length} web master(s) still over 4 MB:`)
  for (const o of oversize.slice(0, 5)) console.log(`      ${mb(o.bytes)}  ${o.rel}`)
}

if (failures.length) {
  console.error(`\n  ✗ ${failures.length} failed:`)
  for (const f of failures.slice(0, 10)) console.error(`      ${f.rel}: ${f.why}`)
  process.exit(1)
}

if (!DRY) {
  writeFileSync(join(ROOT, 'content/image-manifest.json'), JSON.stringify({
    $comment: 'Maps each archived original (the stable identity used in project frontmatter) to its web master in content/images/, with dimensions. Generated by scripts/sync-media.mjs.',
    maxEdge: MAX_EDGE,
    images: manifest,
  }, null, 2) + '\n')
}

console.log(DRY ? '\n  dry run — nothing written\n' : `\n  wrote ${images.size - failures.length} files to content/images/\n`)
