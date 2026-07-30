import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const docsDir = join(projectDir, 'docs')

function fail(message) {
  console.error(`Site validation failed: ${message}`)
  process.exit(1)
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function read(relativePath) {
  return readFileSync(join(projectDir, relativePath), 'utf8')
}

function tokenMap(source) {
  return new Map(
    [...source.matchAll(/(--luci-[a-z0-9-]+):\s*([^;]+);/gi)].map((match) => [
      match[1],
      match[2].replace(/\s+/g, ' ').trim(),
    ]),
  )
}

function relativeLuminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrastRatio(foreground, background) {
  const values = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (left, right) => right - left,
  )
  return (values[0] + 0.05) / (values[1] + 0.05)
}

const html = read('docs/index.html')
const stylesheets = [
  ...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi),
].map((match) => match[1])

assert(
  JSON.stringify(stylesheets) === JSON.stringify(['./lucitra.css', './styles.css']),
  'docs/index.html must load the Lucitra foundations before the page styles',
)
assert(!/<script\b/i.test(html), 'the landing page must remain script-free')
assert(!/\son\w+\s*=/i.test(html), 'inline event handlers are not allowed')

const runtimeHtml = html
  .replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')
  .replace(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi, '')
assert(
  !/(?:src|href)=["'](?:https?:)?\/\//i.test(runtimeHtml),
  'remote landing-page runtime resources are not allowed',
)

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1])
assert(new Set(ids).size === ids.length, 'docs/index.html contains duplicate IDs')

for (const relativePath of [
  'docs/lucitra.css',
  'docs/styles.css',
  'docs/assets/icon-32.png',
  'docs/assets/icon-128.png',
]) {
  assert(statSync(join(projectDir, relativePath)).isFile(), `missing site asset: ${relativePath}`)
}

for (const relativePath of ['docs/lucitra.css', 'docs/styles.css']) {
  const css = read(relativePath)
  assert(
    !/@import\b|url\(\s*["']?(?:https?:)?\/\//i.test(css),
    `remote CSS resources are not allowed in ${relativePath}`,
  )
}

const extensionTokens = tokenMap(read('lucitra.css'))
const siteTokens = tokenMap(read('docs/lucitra.css'))
assert(extensionTokens.size > 20, 'lucitra.css does not contain the expected token set')
assert(siteTokens.size === extensionTokens.size, 'site and extension token sets differ')
for (const [token, value] of extensionTokens) {
  assert(siteTokens.get(token) === value, `site token drift: ${token}`)
}

for (const [foreground, background, label] of [
  ['--luci-ink', '--luci-teal', 'ink on primary teal'],
  ['--luci-dim', '--luci-paper', 'dim text on paper'],
  ['--luci-ghost', '--luci-paper', 'ghost text on paper'],
  ['--luci-ghost-dark', '--luci-instrument', 'muted instrument text'],
]) {
  const ratio = contrastRatio(
    extensionTokens.get(foreground),
    extensionTokens.get(background),
  )
  assert(ratio >= 4.5, `${label} contrast is ${ratio.toFixed(2)}:1; expected at least 4.5:1`)
}

for (const requiredHref of [
  'https://github.com/lucitra/ai-bookmark-organizer',
  'https://github.com/lucitra/ai-bookmark-organizer/releases/latest/download/ai-bookmark-organizer.zip',
  'https://lucitra.ai/tools/ai-bookmark-organizer/privacy/',
]) {
  assert(html.includes(`href="${requiredHref}"`), `missing required landing-page link: ${requiredHref}`)
}

console.log('Validated GitHub Pages landing page against Lucitra foundations')
