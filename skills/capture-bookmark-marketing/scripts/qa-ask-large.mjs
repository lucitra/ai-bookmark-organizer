import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdtemp } from 'node:fs/promises'
import puppeteer from 'puppeteer'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectDir = resolve(scriptDir, '../../..')
const extensionDir = process.env.LUCITRA_EXTENSION_DIR
  ? resolve(process.env.LUCITRA_EXTENSION_DIR)
  : projectDir
const profileDir = await mkdtemp(join(tmpdir(), 'lucitra-bookmark-ask-'))
let browser

function fail(message) {
  throw new Error(message)
}

try {
  browser = await puppeteer.launch({
    headless: true,
    pipe: true,
    userDataDir: profileDir,
    enableExtensions: true,
    protocolTimeout: 180_000,
    args: [
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-default-apps',
      '--disable-sync',
      '--no-first-run',
      '--no-default-browser-check',
    ],
  })

  const installedExtensionId = await browser.installExtension(extensionDir)
  const workerTarget = await browser.waitForTarget(
    (target) =>
      target.type() === 'service_worker' &&
      /^chrome-extension:\/\/[^/]+\/service-worker\.js$/.test(target.url()),
    { timeout: 30_000 },
  )
  const extensionId = new URL(workerTarget.url()).host
  if (extensionId !== installedExtensionId) fail('Installed extension ID mismatch.')

  const page = await browser.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(() => {
    globalThis.LanguageModel = {
      async availability() {
        return 'available'
      },
      async create() {
        return {
          async prompt() {
            throw new Error('Injected Built-in AI prompt failure')
          },
          destroy() {},
        }
      },
    }
  })
  await page.goto(`chrome-extension://${extensionId}/workspace.html#ask`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('#askScopeSelect option[value="all"]')

  const seededCount = await page.evaluate(async () => {
    const call = (namespace, method, ...args) =>
      new Promise((resolveCall, rejectCall) => {
        namespace[method](...args, (value) => {
          const error = chrome.runtime.lastError
          if (error) rejectCall(new Error(error.message))
          else resolveCall(value)
        })
      })

    await call(chrome.storage.local, 'clear')
    const tree = await call(chrome.bookmarks, 'getTree')
    const roots = tree[0]?.children || []
    for (const root of roots) {
      const children = await call(chrome.bookmarks, 'getChildren', root.id)
      for (const child of children) {
        if (child.url) await call(chrome.bookmarks, 'remove', child.id)
        else await call(chrome.bookmarks, 'removeTree', child.id)
      }
    }

    const destination =
      roots.find((node) => node.title?.toLowerCase() === 'other bookmarks') ||
      roots.find((node) => !node.unmodifiable)
    if (!destination) throw new Error('No writable bookmark root is available.')

    const groups = [
      ['AI & Developer Tools', 300, 'AI developer platform'],
      ['Venture Capital', 280, 'Venture capital firm'],
      ['Research & Learning', 180, 'Research learning resource'],
      ['Companies', 120, 'Startup company profile'],
      ['Design', 100, 'Product design reference'],
      ['Operations', 80, 'Business operations guide'],
      ['Personal', 44, 'Personal reference'],
    ]
    let created = 0
    for (const [title, count, bookmarkTitle] of groups) {
      const folder = await call(chrome.bookmarks, 'create', {
        parentId: destination.id,
        title,
      })
      for (let start = 0; start < count; start += 100) {
        const batch = Array.from(
          { length: Math.min(100, count - start) },
          (_, offset) => start + offset,
        )
        await Promise.all(
          batch.map((index) =>
            call(chrome.bookmarks, 'create', {
              parentId: folder.id,
              title: `${bookmarkTitle} ${index + 1}`,
              url: `https://example-${created + index + 1}.test/${encodeURIComponent(title)}`,
            }),
          ),
        )
      }
      created += count
    }
    return created
  })
  if (seededCount !== 1104) fail(`Expected 1,104 bookmarks, created ${seededCount}.`)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () => document.querySelector('#askScopeCount')?.textContent?.includes('1,104'),
    { timeout: 30_000 },
  )
  await page.type('#questionInput', 'Which VC firms do I have bookmarked?')
  await page.click('#askButton')
  await page.waitForFunction(
    () =>
      document.querySelector('#chatMessages')?.getAttribute('aria-busy') === 'false' &&
      document.querySelectorAll('.chat-message.assistant').length > 0,
    { timeout: 60_000 },
  )

  const result = await page.evaluate(() => ({
    scope: document.querySelector('#askScopeCount')?.textContent?.trim(),
    answer: [...document.querySelectorAll('.chat-message.assistant .message-body p')]
      .at(-1)
      ?.textContent?.trim(),
    sources: document.querySelectorAll('.chat-message.assistant .source-panel a').length,
    badge: document.querySelector('#aiBadge')?.textContent?.trim(),
  }))
  if (!result.answer) fail('The large-library Ask flow returned no answer.')
  if (!result.answer.includes('Local rules are active')) {
    fail(`The Built-in AI failure did not fall back to local rules: ${result.answer}`)
  }
  if (result.badge !== 'Local rules') fail(`Expected a Local rules badge, got ${result.badge}.`)
  if (errors.length > 0) fail(`The large-library Ask flow emitted errors:\n${errors.join('\n')}`)

  const manifest = JSON.parse(await readFile(join(extensionDir, 'manifest.json'), 'utf8'))
  console.log(
    `Large Ask QA passed: AI Bookmark Organizer ${manifest.version}, ${result.scope}, injected AI failure recovered with ${result.sources} grounded sources.`,
  )
  console.log(`Answer: ${result.answer}`)
} finally {
  if (browser) await browser.close()
  await rm(profileDir, { recursive: true, force: true })
}
