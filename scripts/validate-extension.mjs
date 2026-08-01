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
assert(
  JSON.stringify(manifest.background) === JSON.stringify({ service_worker: 'service-worker.js' }),
  'background must contain only the local service-worker.js bridge',
)
assert(!manifest.content_scripts, 'content scripts are not allowed')
assert(!manifest.externally_connectable, 'external extension connections are not allowed')
assert(!manifest.host_permissions, 'host_permissions are not allowed for this extension')
assert(!manifest.optional_host_permissions, 'optional_host_permissions are not allowed for this extension')
assert(
  JSON.stringify(sorted(manifest.optional_permissions || [])) === JSON.stringify(['nativeMessaging']),
  'nativeMessaging must be the only optional permission',
)
assert(
  JSON.stringify(manifest.options_ui) === JSON.stringify({ page: 'settings.html', open_in_tab: true }),
  'options_ui must open the packaged settings.html page in a tab',
)
assert(!manifest.update_url, 'update_url must be supplied by Chrome Web Store, not the source manifest')

const permissions = sorted(manifest.permissions || [])
assert(
  JSON.stringify(permissions) === JSON.stringify(['activeTab', 'bookmarks', 'storage']),
  'permissions must be limited to activeTab, bookmarks, and storage',
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
  'lucitra.css',
  'shared.js',
  'agent-core.js',
  'service-worker.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'workspace.html',
  'workspace.css',
  'workspace.js',
  'settings.html',
  'settings.css',
  'settings.js',
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

const extensionPages = new Map([
  [
    'popup.html',
    {
      styles: ['lucitra.css', 'popup.css'],
      scripts: ['shared.js', 'popup.js'],
      source: 'popup.js',
    },
  ],
  [
    'workspace.html',
    {
      styles: ['lucitra.css', 'workspace.css'],
      scripts: ['shared.js', 'workspace.js'],
      source: 'workspace.js',
    },
  ],
  [
    'settings.html',
    {
      styles: ['lucitra.css', 'settings.css'],
      scripts: ['shared.js', 'agent-core.js', 'settings.js'],
      source: 'settings.js',
    },
  ],
])

for (const [pagePath, page] of extensionPages) {
  const html = readText(pagePath)
  const stylesheetLinks = [
    ...html.matchAll(/<link\b[^>]*\brel=["']stylesheet["'][^>]*\bhref=["']([^"']+)["'][^>]*>/gi),
  ]
  assert(
    JSON.stringify(stylesheetLinks.map((match) => match[1])) === JSON.stringify(page.styles),
    `${pagePath} must load only ${page.styles.join(' followed by ')}`,
  )
  const scriptTags = [
    ...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi),
  ]
  assert(
    JSON.stringify(scriptTags.map((match) => match[1])) === JSON.stringify(page.scripts),
    `${pagePath} must load only ${page.scripts.join(' followed by ')}`,
  )
  assert(!/<script\b(?![^>]*\bsrc=)[^>]*>/i.test(html), `${pagePath} contains an inline script`)
  const withoutAnchors = html.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '')
  assert(
    !/(?:src|href)=["'](?:https?:)?\/\//i.test(withoutAnchors),
    `${pagePath} contains a remote runtime resource`,
  )
  assert(
    !/\son\w+\s*=/i.test(html),
    `${pagePath} contains an inline event handler`,
  )

  const source = readText(page.source)
  const requiredIds = new Set(
    [...source.matchAll(/document\.getElementById\(['"]([^'"]+)['"]\)/g)].map(
      (match) => match[1],
    ),
  )
  for (const id of requiredIds) {
    assert(
      new RegExp(`\\bid=["']${id}["']`).test(html),
      `${page.source} requires missing #${id} in ${pagePath}`,
    )
  }
}

const prohibitedRuntimePatterns = [
  [/\beval\s*\(/, 'eval'],
  [/\bnew\s+Function\s*\(/, 'new Function'],
  [/\bimport\s*\(/, 'dynamic import'],
  [/\bfetch\s*\(/, 'fetch'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bsendBeacon\s*\(/, 'sendBeacon'],
]

const runtimeScripts = [
  'shared.js',
  'agent-core.js',
  'service-worker.js',
  'popup.js',
  'workspace.js',
  'settings.js',
]
for (const relativePath of runtimeScripts) {
  const source = readText(relativePath)
  for (const [pattern, label] of prohibitedRuntimePatterns) {
    assert(!pattern.test(source), `${label} is not allowed in ${relativePath}`)
  }
}

const serviceWorkerSource = readText('service-worker.js')
assert(
  /^importScripts\('shared\.js', 'agent-core\.js'\)/.test(serviceWorkerSource),
  'service-worker.js must import only the packaged shared and agent core scripts',
)
for (const relativePath of runtimeScripts.filter((path) => path !== 'service-worker.js')) {
  assert(!/\bimportScripts\s*\(/.test(readText(relativePath)), `importScripts is not allowed in ${relativePath}`)
}

for (const relativePath of ['lucitra.css', 'popup.css', 'workspace.css', 'settings.css']) {
  const source = readText(relativePath)
  assert(
    !/@import\b|url\(\s*["']?(?:https?:)?\/\//i.test(source),
    `remote CSS resources are not allowed in ${relativePath}`,
  )
}

console.log(`Validated AI Bookmark Organizer ${manifest.version}`)
