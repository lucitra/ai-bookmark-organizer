const FALLBACK_CATEGORY = 'Uncategorized'
const ORGANIZER_FOLDER_NAME = 'AI Organized Bookmarks'
const BATCH_SIZE = 5

const scanButton = document.getElementById('scanButton')
const applyButton = document.getElementById('applyButton')
const statusText = document.getElementById('statusText')
const statusDot = document.getElementById('statusDot')
const aiBadge = document.getElementById('aiBadge')
const progressBar = document.getElementById('progressBar')
const previewList = document.getElementById('previewList')
const previewCount = document.getElementById('previewCount')
const emptyState = document.getElementById('emptyState')

const state = {
  suggestions: [],
  scanning: false,
  applying: false,
}

document.addEventListener('DOMContentLoaded', initialize)
scanButton.addEventListener('click', scanAndOrganizeBookmarks)
applyButton.addEventListener('click', applyChanges)

async function initialize() {
  setStatus('Checking if Chrome Built-in AI is available...', 'neutral')
  setProgress(0)

  const aiInfo = await checkAiAvailability()
  updateAiBadge(aiInfo)

  const cached = await readStorage('lastSuggestions')
  if (Array.isArray(cached) && cached.length > 0) {
    state.suggestions = cached
    renderPreview(cached)
    applyButton.disabled = false
    setStatus('Previous scan loaded. Scan again or apply the saved suggestions.', 'success')
    setProgress(100)
  } else {
    setStatus(aiInfo.available ? 'Built-in AI is available. Ready to scan.' : aiInfo.message, aiInfo.available ? 'success' : 'warning')
  }
}

async function scanAndOrganizeBookmarks() {
  if (state.scanning) return

  state.scanning = true
  state.suggestions = []
  scanButton.disabled = true
  applyButton.disabled = true
  renderPreview([])
  setProgress(0)

  let session = null

  try {
    setStatus('Preparing local AI session...', 'neutral')

    // Create the session from the click handler path so Chrome can prompt/download
    // the on-device model if the current browser requires user activation.
    const sessionResult = await createLanguageModelSession()
    session = sessionResult.session
    updateAiBadge(sessionResult)

    if (!session) {
      setStatus(`${sessionResult.message} Using "${FALLBACK_CATEGORY}" for this scan.`, 'warning')
    }

    const bookmarks = await getAllBookmarks()
    if (bookmarks.length === 0) {
      setStatus('No bookmarks found to organize.', 'warning')
      setProgress(100)
      return
    }

    const suggestions = []
    for (let start = 0; start < bookmarks.length; start += BATCH_SIZE) {
      const batch = bookmarks.slice(start, start + BATCH_SIZE)

      for (const bookmark of batch) {
        const category = session
          ? await categorizeBookmark(session, bookmark)
          : FALLBACK_CATEGORY

        suggestions.push({
          id: bookmark.id,
          title: bookmark.title || bookmark.url,
          url: bookmark.url,
          category,
        })

        setStatus(`Processing ${suggestions.length}/${bookmarks.length} bookmarks...`, 'neutral')
        setProgress((suggestions.length / bookmarks.length) * 100)
        renderPreview(suggestions)
      }

      // Yield between batches so the popup remains responsive on large bookmark sets.
      await waitForUi()
    }

    state.suggestions = suggestions
    await writeStorage('lastSuggestions', suggestions)

    applyButton.disabled = suggestions.length === 0
    setStatus(`Scan complete. Review ${suggestions.length} suggested changes before applying.`, 'success')
    setProgress(100)
  } catch (error) {
    console.error(error)
    setStatus(error.message || 'Something went wrong while scanning bookmarks.', 'danger')
  } finally {
    session?.destroy?.()
    state.scanning = false
    scanButton.disabled = false
  }
}

async function applyChanges() {
  if (state.applying || state.suggestions.length === 0) return

  state.applying = true
  scanButton.disabled = true
  applyButton.disabled = true
  setProgress(0)

  const suggestions = state.suggestions
  const failures = []

  try {
    const destinationRoot = await getDestinationRootFolder()
    const organizerFolder = await findOrCreateFolder(destinationRoot.id, ORGANIZER_FOLDER_NAME)
    const categoryFolders = new Map()

    for (let index = 0; index < suggestions.length; index += 1) {
      const suggestion = suggestions[index]
      const category = sanitizeCategory(suggestion.category)

      if (!categoryFolders.has(category)) {
        const folder = await findOrCreateFolder(organizerFolder.id, category)
        categoryFolders.set(category, folder.id)
      }

      try {
        await moveBookmark(suggestion.id, categoryFolders.get(category))
      } catch (error) {
        failures.push({ suggestion, error })
      }

      setStatus(`Applying ${index + 1}/${suggestions.length} bookmark changes...`, 'neutral')
      setProgress(((index + 1) / suggestions.length) * 100)
      await waitForUi()
    }

    if (failures.length > 0) {
      setStatus(`Applied with ${failures.length} bookmark${failures.length === 1 ? '' : 's'} skipped. Some bookmarks may be managed or already removed.`, 'warning')
    } else {
      setStatus(`Applied ${suggestions.length} changes into "${ORGANIZER_FOLDER_NAME}".`, 'success')
    }

    await writeStorage('lastSuggestions', [])
    state.suggestions = []
    renderPreview([])
    setProgress(100)
  } catch (error) {
    console.error(error)
    setStatus(error.message || 'Unable to apply bookmark changes.', 'danger')
    applyButton.disabled = false
  } finally {
    state.applying = false
    scanButton.disabled = false
  }
}

async function createLanguageModelSession() {
  const provider = getLanguageModelProvider()
  if (!provider) {
    return {
      available: false,
      session: null,
      message: 'Chrome Built-in AI was not found in this browser.',
    }
  }

  const availability = await getProviderAvailability(provider)
  if (isUnavailable(availability)) {
    return {
      available: false,
      session: null,
      message: `Chrome Built-in AI is unavailable (${stringifyAvailability(availability)}).`,
    }
  }

  const createOptions = buildSessionOptions(provider)
  const session = await tryCreateSession(provider.api, createOptions)

  return {
    available: true,
    session,
    message: `Using ${provider.label}.`,
  }
}

async function checkAiAvailability() {
  const provider = getLanguageModelProvider()
  if (!provider) {
    return {
      available: false,
      message: 'Chrome Built-in AI is not enabled. The extension can still scan with fallback categories.',
    }
  }

  try {
    const availability = await getProviderAvailability(provider)
    return {
      available: !isUnavailable(availability),
      message: `${provider.label}: ${stringifyAvailability(availability)}`,
    }
  } catch (error) {
    return {
      available: false,
      message: `Built-in AI check failed: ${error.message}`,
    }
  }
}

function getLanguageModelProvider() {
  if (typeof LanguageModel !== 'undefined') {
    return { label: 'LanguageModel', api: LanguageModel, kind: 'modern' }
  }

  if (globalThis.ai?.languageModel) {
    return { label: 'window.ai.languageModel', api: globalThis.ai.languageModel, kind: 'legacy' }
  }

  if (typeof chrome !== 'undefined' && chrome.aiOriginTrial?.languageModel) {
    return {
      label: 'chrome.aiOriginTrial.languageModel',
      api: chrome.aiOriginTrial.languageModel,
      kind: 'originTrial',
    }
  }

  return null
}

async function getProviderAvailability(provider) {
  const options = provider.kind === 'modern' ? getLanguageModelOptions() : undefined

  if (typeof provider.api.availability === 'function') {
    try {
      return options
        ? await provider.api.availability(options)
        : await provider.api.availability()
    } catch (error) {
      if (options) return provider.api.availability()
      throw error
    }
  }

  if (typeof provider.api.capabilities === 'function') {
    return provider.api.capabilities()
  }

  return 'unknown'
}

function buildSessionOptions(provider) {
  const options = {
    temperature: 0,
    topK: 1,
    monitor(monitor) {
      monitor.addEventListener?.('downloadprogress', (event) => {
        if (typeof event.loaded === 'number') {
          const percent = event.total ? (event.loaded / event.total) * 100 : event.loaded * 100
          setStatus(`Downloading Chrome local AI model... ${Math.round(percent)}%`, 'neutral')
          setProgress(percent)
        } else {
          setStatus('Downloading Chrome local AI model...', 'neutral')
        }
      })
    },
  }

  if (provider.kind === 'modern') {
    return { ...options, ...getLanguageModelOptions() }
  }

  return options
}

function getLanguageModelOptions() {
  return {
    expectedInputs: [{ type: 'text', languages: ['en'] }],
    expectedOutputs: [{ type: 'text', languages: ['en'] }],
  }
}

async function tryCreateSession(api, options) {
  if (typeof api.create !== 'function') {
    throw new Error('This Built-in AI provider does not expose a create() method.')
  }

  try {
    return await api.create(options)
  } catch (firstError) {
    try {
      return await api.create({ monitor: options.monitor })
    } catch (secondError) {
      try {
        return await api.create()
      } catch {
        throw firstError
      }
    }
  }
}

async function categorizeBookmark(session, bookmark) {
  const title = normalizePromptValue(bookmark.title || 'Untitled')
  const url = normalizePromptValue(bookmark.url || '')
  const prompt = `Given the bookmark title '${title}' and URL '${url}', respond with ONLY a 1 to 2 word general category folder name (e.g., Technology, Recipes, Finance, Productivity, Design, News). Do not add punctuation or extra words.`

  try {
    const response = await session.prompt(prompt)
    return sanitizeCategory(extractResponseText(response))
  } catch (error) {
    console.warn('AI categorization failed for bookmark:', bookmark, error)
    return FALLBACK_CATEGORY
  }
}

function extractResponseText(response) {
  if (typeof response === 'string') return response
  if (typeof response?.text === 'string') return response.text
  if (typeof response?.content === 'string') return response.content
  if (typeof response?.output === 'string') return response.output
  return ''
}

function sanitizeCategory(value) {
  if (typeof value !== 'string') return FALLBACK_CATEGORY

  const cleaned = value
    .replace(/[`"'.,:;!?()[\]{}<>/\\|]+/g, ' ')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const words = cleaned
    .split(' ')
    .map((word) => word.replace(/[^a-z0-9&]/gi, ''))
    .filter(Boolean)
    .slice(0, 2)

  if (words.length === 0) return FALLBACK_CATEGORY

  return words.map(toTitleCase).join(' ')
}

function toTitleCase(word) {
  const upper = word.toUpperCase()
  if (['AI', 'ML', 'API', 'UX', 'UI', 'SEO'].includes(upper)) return upper
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

function normalizePromptValue(value) {
  return String(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220)
}

function isUnavailable(availability) {
  const value = stringifyAvailability(availability).toLowerCase()
  return value.includes('unavailable') || value === 'no' || value === 'false' || value.includes('unsupported')
}

function stringifyAvailability(availability) {
  if (availability == null) return 'unknown'
  if (typeof availability === 'string') return availability
  if (typeof availability === 'boolean') return availability ? 'available' : 'unavailable'
  if (availability.available) return String(availability.available)
  if (availability.availability) return String(availability.availability)
  return JSON.stringify(availability)
}

async function getAllBookmarks() {
  const tree = await chromeBookmarks('getTree')
  const bookmarks = []

  function walk(node) {
    if (node.url) {
      bookmarks.push({
        id: node.id,
        title: node.title,
        url: node.url,
        parentId: node.parentId,
      })
      return
    }

    for (const child of node.children || []) {
      walk(child)
    }
  }

  for (const root of tree) walk(root)
  return bookmarks
}

async function getDestinationRootFolder() {
  const tree = await chromeBookmarks('getTree')
  const root = tree[0]
  const rootFolders = root.children || []

  return (
    rootFolders.find((node) => node.title?.toLowerCase() === 'other bookmarks') ||
    rootFolders.find((node) => node.children && !node.unmodifiable) ||
    rootFolders[0]
  )
}

async function findOrCreateFolder(parentId, title) {
  const children = await chromeBookmarks('getChildren', parentId)
  const existing = children.find((node) => !node.url && node.title === title)
  if (existing) return existing

  return chromeBookmarks('create', { parentId, title })
}

async function moveBookmark(id, parentId) {
  return chromeBookmarks('move', id, { parentId })
}

function chromeBookmarks(method, ...args) {
  return new Promise((resolve, reject) => {
    chrome.bookmarks[method](...args, (result) => {
      const error = chrome.runtime.lastError
      if (error) {
        reject(new Error(error.message))
      } else {
        resolve(result)
      }
    })
  })
}

async function readStorage(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (result) => resolve(result[key]))
  })
}

async function writeStorage(key, value) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [key]: value }, resolve)
  })
}

function renderPreview(suggestions) {
  previewList.replaceChildren()
  emptyState.hidden = suggestions.length > 0
  previewCount.textContent = `${suggestions.length} bookmark${suggestions.length === 1 ? '' : 's'}`

  const fragment = document.createDocumentFragment()
  for (const suggestion of suggestions) {
    const item = document.createElement('li')
    item.className = 'preview-item'

    const textWrap = document.createElement('div')
    const title = document.createElement('div')
    title.className = 'bookmark-title'
    title.textContent = suggestion.title || suggestion.url

    const url = document.createElement('div')
    url.className = 'bookmark-url'
    url.textContent = suggestion.url

    const category = document.createElement('span')
    category.className = 'category-pill'
    category.textContent = sanitizeCategory(suggestion.category)

    textWrap.append(title, url)
    item.append(textWrap, category)
    fragment.append(item)
  }

  previewList.append(fragment)
}

function updateAiBadge(info) {
  aiBadge.textContent = info.available ? 'AI Ready' : 'Fallback'
  aiBadge.className = `badge ${info.available ? 'badge-success' : 'badge-warning'}`
}

function setStatus(message, tone = 'neutral') {
  statusText.textContent = message
  statusDot.className = `status-dot ${tone === 'success' ? 'is-success' : tone === 'warning' ? 'is-warning' : tone === 'danger' ? 'is-danger' : ''}`
}

function setProgress(value) {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  progressBar.style.width = `${normalized}%`
}

function waitForUi() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
