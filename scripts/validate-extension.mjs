import { readFileSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(projectDir, 'manifest.json')
const releaseFilesPath = join(projectDir, 'release-files.txt')

function fail(message) {
  console.error(`Validation failed: ${message}`)
  process.exit(1)
}

function readText(relativePath) {
  return readFileSync(join(projectDir, relativePath), 'utf8')
}

function assert(condition, message) {
  if (!condition) fail(message)
}

function sorted(values) {
  return [...values].sort((a, b) => a.localeCompare(b))
}

function readPngDimensions(relativePath) {
  const buffer = readFileSync(join(projectDir, relativePath))
  const signature = '89504e470d0a1a0a'
  assert(buffer.subarray(0, 8).toString('hex') === signature, `${relativePath} is not a PNG`)
  assert(buffer.subarray(12, 16).toString('ascii') === 'IHDR', `${relativePath} is missing PNG IHDR data`)
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

let manifest
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
} catch (error) {
  fail(`manifest.json is not valid JSON: ${error.message}`)
}

assert(manifest.manifest_version === 3, 'manifest_version must be 3')
assert(
  /^\d{1,5}(?:\.\d{1,5}){0,3}$/.test(manifest.version),
  'manifest version must use Chrome numeric version syntax',
)
assert(Number(manifest.minimum_chrome_version) >= 138, 'minimum_chrome_version must be at least 138')
assert(manifest.action?.default_popup === 'popup.html', 'action.default_popup must be popup.html')
assert(!manifest.host_permissions, 'host_permissions are not allowed for this extension')
assert(!manifest.optional_host_permissions, 'optional_host_permissions are not allowed for this extension')
assert(!manifest.update_url, 'update_url must be supplied by Chrome Web Store, not the source manifest')

const permissions = sorted(manifest.permissions || [])
assert(
  JSON.stringify(permissions) === JSON.stringify(['bookmarks', 'storage']),
  'permissions must be limited to bookmarks and storage',
)

const expectedIcons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
}
assert(JSON.stringify(manifest.icons) === JSON.stringify(expectedIcons), 'manifest icons do not match the required set')
assert(
  JSON.stringify(manifest.action.default_icon) === JSON.stringify(expectedIcons),
  'action icons do not match the required set',
)

const releaseFiles = readFileSync(releaseFilesPath, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)

assert(releaseFiles.length > 0, 'release-files.txt is empty')
assert(new Set(releaseFiles).size === releaseFiles.length, 'release-files.txt contains duplicate paths')
assert(releaseFiles[0] === 'manifest.json', 'manifest.json must be the first package entry')

for (const relativePath of releaseFiles) {
  assert(!isAbsolute(relativePath), `package path must be relative: ${relativePath}`)
  assert(!relativePath.split('/').includes('..'), `package path cannot traverse directories: ${relativePath}`)

  const absolutePath = join(projectDir, relativePath)
  let stats
  try {
    stats = statSync(absolutePath)
  } catch {
    fail(`missing package file: ${relativePath}`)
  }
  assert(stats.isFile(), `package entry must be a regular file: ${relativePath}`)

  const resolvedPath = realpathSync(absolutePath)
  assert(
    !relative(projectDir, resolvedPath).startsWith('..'),
    `package entry resolves outside the repository: ${relativePath}`,
  )
}

const requiredPackageFiles = [
  'manifest.json',
  'popup.html',
  'popup.css',
  'popup.js',
  ...Object.values(expectedIcons),
]
assert(
  JSON.stringify(sorted(releaseFiles)) === JSON.stringify(sorted(requiredPackageFiles)),
  'release-files.txt must contain only the extension runtime files',
)

for (const [size, relativePath] of Object.entries(expectedIcons)) {
  const dimensions = readPngDimensions(relativePath)
  assert(
    dimensions.width === Number(size) && dimensions.height === Number(size),
    `${relativePath} must be exactly ${size}x${size}`,
  )
}

const popupHtml = readText('popup.html')
const scriptTags = [...popupHtml.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi)]
assert(scriptTags.length === 1, 'popup.html must load exactly one external script')
assert(scriptTags[0][1] === 'popup.js', 'popup.html may load only popup.js')
assert(!/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(popupHtml), 'inline scripts are not allowed')
assert(!/(?:src|href)=["'](?:https?:)?\/\//i.test(popupHtml.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')), 'remote runtime resources are not allowed')

const popupJs = readText('popup.js')
const prohibitedRuntimePatterns = [
  [/\beval\s*\(/, 'eval'],
  [/\bnew\s+Function\s*\(/, 'new Function'],
  [/\bimport\s*\(/, 'dynamic import'],
  [/\bimportScripts\s*\(/, 'importScripts'],
  [/\bfetch\s*\(/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
]
for (const [pattern, label] of prohibitedRuntimePatterns) {
  assert(!pattern.test(popupJs), `${label} is not allowed in popup.js`)
}

console.log(`Validated AI Bookmark Organizer ${manifest.version}`)
