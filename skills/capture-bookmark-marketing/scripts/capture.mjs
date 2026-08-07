import { createHash } from 'node:crypto'
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer'

const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectDir = resolve(scriptDir, '../../..')
const extensionDir = process.env.LUCITRA_EXTENSION_DIR
  ? resolve(process.env.LUCITRA_EXTENSION_DIR)
  : projectDir
const generatedDir = join(projectDir, 'store-assets', 'generated')
const viewport = Object.freeze({ width: 1280, height: 800, deviceScaleFactor: 1 })
const headed = process.argv.includes('--headed')
const duplicateUiQa = process.argv.includes('--qa-duplicate-ui')

const fixtures = [
  {
    folder: 'Research & Learning',
    bookmarks: [
      ['OpenAI Research', 'https://openai.com/research/'],
      ['Anthropic Research', 'https://www.anthropic.com/research'],
      ['Hugging Face', 'https://huggingface.co/'],
      ['DeepLearning.AI', 'https://www.deeplearning.ai/'],
      ['Y Combinator Library', 'https://www.ycombinator.com/library'],
    ],
  },
  {
    folder: 'Products & Design',
    bookmarks: [
      ['Linear — Plan and build products', 'https://linear.app/'],
      ['Notion — Your connected workspace', 'https://www.notion.so/product'],
      ['Figma — The collaborative interface design tool', 'https://www.figma.com/'],
      ['Superhuman — The most productive email app', 'https://superhuman.com/'],
      ['Grammarly — AI writing assistance', 'https://www.grammarly.com/'],
    ],
  },
  {
    folder: 'Companies & Investors',
    bookmarks: [
      ['Pear VC', 'https://pear.vc/'],
      ['Everywhere Ventures', 'https://everywhere.vc/'],
      ['Primary Venture Partners', 'https://www.primary.vc/'],
      ['Era Ventures', 'https://era.vc/'],
      ['Visible — Investor relationships', 'https://visible.vc/'],
    ],
  },
  {
    folder: 'Developer Tools',
    bookmarks: [
      ['GitHub', 'https://github.com/'],
      ['Chrome for Developers', 'https://developer.chrome.com/'],
      ['MDN Web Docs', 'https://developer.mozilla.org/'],
      ['Linear — Product workspace copy', 'https://linear.app/?utm_source=bookmark-demo'],
      ['Model Context Protocol', 'https://modelcontextprotocol.io/'],
    ],
  },
]

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds))

async function within(promise, milliseconds, label) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms.`)), milliseconds)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function closeBrowserWithin(browser, milliseconds = 5_000) {
  let closed = false
  await Promise.race([
    browser.close().then(() => {
      closed = true
    }),
    delay(milliseconds),
  ])
  if (!closed) browser.process()?.kill('SIGTERM')
}

function fail(message) {
  throw new Error(message)
}

async function configurePage(page) {
  await page.setViewport(viewport)
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: 'light' },
    { name: 'prefers-reduced-motion', value: 'reduce' },
  ])
}

async function waitForWorkspaceReady(page, consoleErrors = []) {
  await page.waitForSelector('#scopeSelect option[value="all"]')
  try {
    await page.waitForFunction(() => {
      const count = document.querySelector('#askScopeCount')?.textContent || ''
      const status = document.querySelector('#statusText')?.textContent || ''
      return !count.includes('Loading') && !status.includes('Loading')
    }, { timeout: 30_000 })
  } catch (error) {
    const state = await page.evaluate(() => ({
      readyState: document.readyState,
      askScopeCount: document.querySelector('#askScopeCount')?.textContent || null,
      statusText: document.querySelector('#statusText')?.textContent || null,
    }))
    throw new Error(
      `${error.message} Workspace state: ${JSON.stringify(state)}. Page errors: ${consoleErrors.join(' | ') || 'none'}`,
    )
  }
}

async function seedBookmarks(page) {
  const fixtureGroups = fixtures
  const result = await page.evaluate(async (fixtureGroups) => {
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
    const rootFolders = tree[0]?.children || []

    for (const root of rootFolders) {
      const children = await call(chrome.bookmarks, 'getChildren', root.id)
      for (const child of children) {
        if (child.url) await call(chrome.bookmarks, 'remove', child.id)
        else await call(chrome.bookmarks, 'removeTree', child.id)
      }
    }

    const writableRoot =
      rootFolders.find((node) => node.title?.toLowerCase() === 'other bookmarks') ||
      rootFolders.find((node) => !node.unmodifiable)
    if (!writableRoot) throw new Error('No writable bookmark root is available in the test profile.')

    let bookmarkCount = 0
    for (const group of fixtureGroups) {
      const folder = await call(chrome.bookmarks, 'create', {
        parentId: writableRoot.id,
        title: group.folder,
      })
      await Promise.all(
        group.bookmarks.map(([title, url]) =>
          call(chrome.bookmarks, 'create', { parentId: folder.id, title, url }),
        ),
      )
      bookmarkCount += group.bookmarks.length
    }

    return { bookmarkCount, rootId: writableRoot.id, rootTitle: writableRoot.title }
  }, fixtureGroups)

  if (result.bookmarkCount !== 20) {
    fail(`Expected 20 fixture bookmarks, created ${result.bookmarkCount}.`)
  }
  return result
}

async function capturePage(page, filename, evidence) {
  const path = join(generatedDir, filename)
  await page.screenshot({
    path,
    type: 'png',
    captureBeyondViewport: false,
  })
  const buffer = await readFile(path)
  const details = await stat(path)
  return {
    filename,
    width: viewport.width,
    height: viewport.height,
    bytes: details.size,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    evidence,
  }
}

async function openExtensionPage(browser, extensionId, relativePath) {
  const page = await browser.newPage()
  await configurePage(page)
  await page.goto(`chrome-extension://${extensionId}/${relativePath}`, { waitUntil: 'domcontentloaded' })
  return page
}

async function captureBookmarkManager(browser, folderId) {
  const page = await browser.newPage()
  await configurePage(page)
  try {
    await page.goto(`chrome://bookmarks/?id=${encodeURIComponent(folderId)}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15_000,
    })
    await page.waitForFunction(() => document.querySelector('bookmarks-app, bookmarks-manager'), {
      timeout: 10_000,
    })
    await delay(1_000)
    return {
      page,
      screenshot: await capturePage(page, '05-bookmark-folders.png', {
        surface: 'chrome-bookmarks',
        organizerFolderId: folderId,
      }),
    }
  } catch (error) {
    await page.close()
    return { error: error.message }
  }
}

async function main() {
  await rm(generatedDir, { recursive: true, force: true })
  await mkdir(generatedDir, { recursive: true })
  const profileDir = await mkdtemp(join(tmpdir(), 'lucitra-bookmark-marketing-'))
  let browser
  const pages = []
  const captures = []
  const consoleErrors = []
  let bookmarkManagerError = null
  let organizerRelocationRoundTrip = false
  let deterministicBookmarkCount = false
  let duplicateKeeperSwap = false
  let duplicateModeExit = false
  let duplicateQaScreenshot = null

  try {
    browser = await puppeteer.launch({
      headless: headed ? false : true,
      pipe: true,
      userDataDir: profileDir,
      enableExtensions: true,
      defaultViewport: viewport,
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
    if (extensionId !== installedExtensionId) {
      fail(`Loaded extension ID ${extensionId} does not match installed ID ${installedExtensionId}.`)
    }
    const workspacePage = await openExtensionPage(browser, extensionId, 'workspace.html#organize')
    pages.push(workspacePage)
    workspacePage.on('pageerror', (error) => consoleErrors.push(error.message))
    workspacePage.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text())
    })

    await waitForWorkspaceReady(workspacePage, consoleErrors)
    const fixtureState = await seedBookmarks(workspacePage)
    await workspacePage.reload({ waitUntil: 'domcontentloaded' })
    await waitForWorkspaceReady(workspacePage, consoleErrors)
    await workspacePage.select('#scopeSelect', 'all')
    await workspacePage.click('[data-organizer-instruction*="specific, reusable topics"]')
    await workspacePage.click('#startButton')
    await workspacePage.waitForFunction(() => {
      const status = document.querySelector('#statusText')?.textContent || ''
      return status.startsWith('Scan complete.') || document.querySelector('#statusDot')?.classList.contains('is-danger')
    }, { timeout: 60_000 })
    const terminalScanStatus = await workspacePage.$eval(
      '#statusText',
      (element) => element.textContent.trim(),
    )
    if (!terminalScanStatus.startsWith('Scan complete.')) {
      fail(`Organizer scan failed: ${terminalScanStatus}`)
    }
    await workspacePage.waitForFunction(
      () => document.querySelectorAll('.preview-row').length === 20,
      { timeout: 30_000 },
    )
    await workspacePage.evaluate(() => {
      const target = document.querySelector('.plan-card')
      globalThis.scrollTo(0, Math.max(0, target.offsetTop - 66))
    })
    await delay(250)
    captures.push(await capturePage(workspacePage, '01-organize-preview.png', {
      surface: 'extension-workspace',
      state: 'scan-complete',
      previewRows: 20,
    }))

    await workspacePage.evaluate(() => {
      globalThis.location.hash = 'ask'
      globalThis.scrollTo(0, 0)
    })
    await workspacePage.waitForSelector('#askView:not([hidden])')
    await workspacePage.click('[data-question="Which bookmarks appear to be duplicates?"]')
    await workspacePage.waitForFunction(() => {
      const messages = [...document.querySelectorAll('.chat-message.assistant .message-body')]
      return messages.some((message) => message.textContent.includes('exact duplicate group'))
    }, { timeout: 30_000 })
    await workspacePage.waitForSelector('.chat-action-card')
    await delay(250)
    captures.push(await capturePage(workspacePage, '02-ask-duplicates.png', {
      surface: 'extension-workspace',
      state: 'duplicate-action-proposed',
      sourcePanels: await workspacePage.$$eval('.source-panel', (items) => items.length),
    }))

    await workspacePage.$eval('#questionInput', (input) => {
      input.value = 'How many bookmarks do I have?'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await workspacePage.click('#askButton')
    await workspacePage.waitForFunction((expectedCount) => {
      const messages = [...document.querySelectorAll('.chat-message.assistant .message-body')]
      return messages.some((message) =>
        message.textContent.includes(`You have ${expectedCount} bookmarks in All bookmarks.`),
      )
    }, { timeout: 15_000 }, fixtureState.bookmarkCount)
    deterministicBookmarkCount = true

    const settingsPage = await openExtensionPage(browser, extensionId, 'settings.html')
    pages.push(settingsPage)
    settingsPage.on('pageerror', (error) => consoleErrors.push(error.message))
    await settingsPage.waitForFunction(() => {
      const state = document.querySelector('#agentState')?.textContent?.trim()
      const connection = document.querySelector('#connectionTitle')?.textContent?.trim()
      return state === 'Off' && connection === 'Not connected'
    }, { timeout: 30_000 })
    await delay(250)
    captures.push(await capturePage(settingsPage, '03-agent-access.png', {
      surface: 'extension-settings',
      agentAccess: 'off',
      externalProvidersSelected: 0,
    }))

    await workspacePage.bringToFront()
    await workspacePage.evaluate(() => {
      globalThis.location.hash = 'organize'
      globalThis.scrollTo(0, 0)
    })
    await workspacePage.waitForSelector('#organizeView:not([hidden])')
    await workspacePage.$$eval('.preview-row', (rows) => {
      const row = rows.find((candidate) => candidate.textContent.includes('Y Combinator Library'))
      const input = row?.querySelector('.category-input')
      if (!input) throw new Error('The Y Combinator fixture is unavailable for nested-path QA.')
      input.value = 'Knowledge › Learning'
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await workspacePage.waitForFunction(
      () => [...document.querySelectorAll('.category-input')].some(
        (input) => input.value === 'Knowledge › Learning',
      ),
    )
    workspacePage.once('dialog', (dialog) => dialog.accept())
    await workspacePage.click('#applyButton')
    await workspacePage.waitForFunction(() => {
      const status = document.querySelector('#statusText')?.textContent || ''
      return /^Moved \d+ bookmarks\./.test(status)
    }, { timeout: 30_000 })
    await workspacePage.evaluate(() => globalThis.scrollTo(0, 0))
    await delay(250)
    const appliedStatus = await workspacePage.$eval('#statusText', (element) => element.textContent.trim())
    captures.push(await capturePage(workspacePage, '04-applied-result.png', {
      surface: 'extension-workspace',
      state: 'applied',
      status: appliedStatus,
    }))

    const organizerFolder = await workspacePage.evaluate(async () => {
      const tree = await BookmarkOrganizer.getBookmarkTree()
      const stack = [...tree]
      while (stack.length > 0) {
        const node = stack.shift()
        if (!node.url && node.title === BookmarkOrganizer.ORGANIZER_FOLDER_NAME) {
          const knowledge = node.children?.find((child) => child.title === 'Knowledge')
          const learning = knowledge?.children?.find((child) => child.title === 'Learning')
          return {
            id: node.id,
            title: node.title,
            childCount: node.children?.length || 0,
            nestedPathCreated: Boolean(learning),
          }
        }
        stack.unshift(...(node.children || []))
      }
      return null
    })
    if (!organizerFolder) fail('The organizer folder was not created after applying the plan.')
    if (!organizerFolder.nestedPathCreated) {
      fail('Apply did not create the expected Knowledge › Learning nested path.')
    }

    const relocationRoots = await workspacePage.evaluate(async () => {
      const tree = await BookmarkOrganizer.getBookmarkTree()
      const roots = tree[0]?.children || []
      return {
        bookmarksBarId: roots.find((node) => /bookmarks?\s*bar/i.test(node.title || ''))?.id,
        otherBookmarksId: roots.find((node) => /other bookmarks/i.test(node.title || ''))?.id,
      }
    })
    if (!relocationRoots.bookmarksBarId || !relocationRoots.otherBookmarksId) {
      fail('Both Bookmarks Bar and Other Bookmarks are required for relocation QA.')
    }

    console.log('Relocation QA: moving the existing library to Other Bookmarks.')
    await within(
      workspacePage.select('#destinationSelect', relocationRoots.otherBookmarksId),
      10_000,
      'Selecting Other Bookmarks',
    )
    await within(workspacePage.waitForFunction(
      () => !document.querySelector('#moveLibraryButton')?.hidden,
      { timeout: 10_000 },
    ), 12_000, 'Waiting for the relocation action')
    workspacePage.once('dialog', (dialog) => dialog.accept())
    await within(
      workspacePage.click('#moveLibraryButton'),
      10_000,
      'Moving the library to Other Bookmarks',
    )
    await within(workspacePage.waitForFunction((expectedParentId) => {
      const hint = document.querySelector('#destinationHint')?.textContent || ''
      const destination = document.querySelector('#destinationSelect')?.value
      return destination === String(expectedParentId) && hint.includes('Uses the existing organized library')
    }, { timeout: 15_000 }, relocationRoots.otherBookmarksId), 17_000, 'Confirming the Other Bookmarks location')

    console.log('Relocation QA: returning the existing library to Bookmarks Bar.')
    await within(
      workspacePage.select('#destinationSelect', relocationRoots.bookmarksBarId),
      10_000,
      'Selecting Bookmarks Bar',
    )
    await within(workspacePage.waitForFunction(
      () => !document.querySelector('#moveLibraryButton')?.hidden,
      { timeout: 10_000 },
    ), 12_000, 'Waiting for the return action')
    workspacePage.once('dialog', (dialog) => dialog.accept())
    await within(
      workspacePage.click('#moveLibraryButton'),
      10_000,
      'Moving the library to Bookmarks Bar',
    )
    await within(workspacePage.waitForFunction((expectedParentId) => {
      const hint = document.querySelector('#destinationHint')?.textContent || ''
      const destination = document.querySelector('#destinationSelect')?.value
      return destination === String(expectedParentId) && hint.includes('Uses the existing organized library')
    }, { timeout: 15_000 }, relocationRoots.bookmarksBarId), 17_000, 'Confirming the Bookmarks Bar location')
    organizerRelocationRoundTrip = await workspacePage.evaluate(async (expectedParentId) => {
      const tree = await BookmarkOrganizer.getBookmarkTree()
      const locations = BookmarkOrganizer.findOrganizerFolders(tree)
      return locations.length === 1 && String(locations[0].parentId) === String(expectedParentId)
    }, relocationRoots.bookmarksBarId)
    if (!organizerRelocationRoundTrip) {
      fail('Organizer relocation created a parallel library or returned to the wrong root.')
    }
    console.log('Relocation QA: passed without creating a parallel library.')

    const bookmarkManagerResult = await captureBookmarkManager(browser, organizerFolder.id)
    if (bookmarkManagerResult.screenshot) {
      pages.push(bookmarkManagerResult.page)
      captures.push(bookmarkManagerResult.screenshot)
    } else {
      bookmarkManagerError = bookmarkManagerResult.error
    }

    if (duplicateUiQa) {
      await workspacePage.bringToFront()
      await workspacePage.evaluate(() => {
        globalThis.location.hash = 'organize'
        globalThis.scrollTo(0, 0)
      })
      await workspacePage.waitForSelector('#organizeView:not([hidden])')
      workspacePage.once('dialog', (dialog) => dialog.accept())
      await workspacePage.click('#duplicateReviewButton')
      await workspacePage.waitForSelector('#organizeView.is-duplicate-review:not([hidden])')
      await workspacePage.waitForSelector('.duplicate-group .duplicate-copy.is-keeper')
      const beforeKeeper = await workspacePage.$eval(
        '.duplicate-copy.is-keeper .duplicate-copy-details strong',
        (element) => element.textContent.trim(),
      )
      await workspacePage.click('[data-role="keep-duplicate"]')
      await workspacePage.waitForFunction((previousKeeper) => {
        const nextKeeper = document.querySelector(
          '.duplicate-copy.is-keeper .duplicate-copy-details strong',
        )?.textContent?.trim()
        return nextKeeper && nextKeeper !== previousKeeper
      }, {}, beforeKeeper)
      const duplicateState = await workspacePage.evaluate(() => ({
        groups: document.querySelectorAll('.duplicate-group').length,
        keepers: document.querySelectorAll('.duplicate-copy.is-keeper').length,
        selectedExtras: document.querySelectorAll('.duplicate-copy:not(.is-keeper) .preview-select:checked').length,
        instructionControlsHidden:
          getComputedStyle(document.querySelector('.instruction-starters')).display === 'none' &&
          getComputedStyle(document.querySelector('.instruction-field')).display === 'none',
        applyLabel: document.querySelector('#applyButton')?.textContent?.trim(),
        exitLabel: document.querySelector('#duplicateReviewButton')?.textContent?.trim(),
      }))
      if (
        duplicateState.groups !== 1 ||
        duplicateState.keepers !== 1 ||
        duplicateState.selectedExtras !== 1 ||
        !duplicateState.instructionControlsHidden ||
        duplicateState.applyLabel !== 'Move 1 to review' ||
        duplicateState.exitLabel !== 'Back to organize'
      ) {
        fail(`Duplicate review UI did not reach the expected state: ${JSON.stringify(duplicateState)}`)
      }
      duplicateKeeperSwap = true
      await workspacePage.evaluate(() => {
        const target = document.querySelector('.preview-card')
        globalThis.scrollTo(0, Math.max(0, target.offsetTop - 66))
      })
      await delay(250)
      duplicateQaScreenshot = join(tmpdir(), 'lucitra-duplicate-review-qa.png')
      await workspacePage.screenshot({
        path: duplicateQaScreenshot,
        type: 'png',
        captureBeyondViewport: false,
      })
      workspacePage.once('dialog', (dialog) => dialog.accept())
      await workspacePage.click('#duplicateReviewButton')
      await workspacePage.waitForFunction(() => {
        const view = document.querySelector('#organizeView')
        const instructionDisplay = getComputedStyle(
          document.querySelector('.instruction-starters'),
        ).display
        return !view.classList.contains('is-duplicate-review') && instructionDisplay !== 'none'
      })
      duplicateModeExit = true
    }

    if (consoleErrors.length > 0) {
      fail(`Extension pages emitted console errors:\n${consoleErrors.join('\n')}`)
    }

    const report = {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      extension: {
        id: extensionId,
        version: JSON.parse(await readFile(join(extensionDir, 'manifest.json'), 'utf8')).version,
      },
      browser: {
        product: 'Chrome for Testing',
        version: await browser.version(),
        headless: !headed,
      },
      fixture: fixtureState,
      qa: {
        deterministicBookmarkCount,
        organizerRelocationRoundTrip,
        duplicateKeeperSwap,
        duplicateModeExit,
      },
      viewport,
      captures,
      optionalCapture: bookmarkManagerError
        ? { filename: '05-bookmark-folders.png', status: 'unavailable', reason: bookmarkManagerError }
        : { filename: '05-bookmark-folders.png', status: 'captured' },
    }
    await writeFile(join(generatedDir, 'capture-report.json'), `${JSON.stringify(report, null, 2)}\n`)

    console.log(`Captured AI Bookmark Organizer ${report.extension.version} with ${report.browser.version}`)
    for (const capture of captures) {
      console.log(`${capture.filename} ${capture.width}x${capture.height} ${capture.bytes} bytes ${capture.sha256}`)
    }
    if (bookmarkManagerError) {
      console.warn(`Optional chrome://bookmarks capture unavailable: ${bookmarkManagerError}`)
    }
    if (duplicateQaScreenshot) {
      console.log(`Duplicate review QA passed after direct entry, keeper swap, and exit: ${duplicateQaScreenshot}`)
    }
    console.log(`Review output: ${generatedDir}`)
  } finally {
    await Promise.race([
      Promise.all(pages.reverse().map(async (page) => {
        try {
          if (!page.isClosed()) await page.close()
        } catch {}
      })),
      delay(5_000),
    ])
    if (browser) await closeBrowserWithin(browser)
    await Promise.race([
      rm(profileDir, { recursive: true, force: true }),
      delay(5_000),
    ])
  }
}

main().catch((error) => {
  console.error(error.stack || error.message)
  process.exitCode = 1
})
