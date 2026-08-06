'use strict'

const Organizer = globalThis.BookmarkOrganizer
const ASSIGNMENT_BATCH_SIZE = 12
const AI_PLANNING_BOOKMARK_LIMIT = 400
const PREVIEW_PAGE_SIZE = 200
const CHAT_HISTORY_LIMIT = 20
const CHAT_THREAD_LIMIT = 12

const elements = {
  aiBadge: document.getElementById('aiBadge'),
  scopeSelect: document.getElementById('scopeSelect'),
  askScopeSelect: document.getElementById('askScopeSelect'),
  askScopeCount: document.getElementById('askScopeCount'),
  destinationSelect: document.getElementById('destinationSelect'),
  destinationHint: document.getElementById('destinationHint'),
  moveLibraryButton: document.getElementById('moveLibraryButton'),
  categoryLimit: document.getElementById('categoryLimit'),
  excludeOrganizer: document.getElementById('excludeOrganizer'),
  instructionInput: document.getElementById('instructionInput'),
  draftInstructionButton: document.getElementById('draftInstructionButton'),
  scopeCount: document.getElementById('scopeCount'),
  startButton: document.getElementById('startButton'),
  pauseButton: document.getElementById('pauseButton'),
  resumeButton: document.getElementById('resumeButton'),
  cancelButton: document.getElementById('cancelButton'),
  undoButton: document.getElementById('undoButton'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
  progressBar: document.getElementById('progressBar'),
  progressLabel: document.getElementById('progressLabel'),
  categoryPlan: document.getElementById('categoryPlan'),
  planCount: document.getElementById('planCount'),
  planVisualization: document.getElementById('planVisualization'),
  sourceTreeSummary: document.getElementById('sourceTreeSummary'),
  sourceTree: document.getElementById('sourceTree'),
  destinationTreeSummary: document.getElementById('destinationTreeSummary'),
  destinationTree: document.getElementById('destinationTree'),
  planSafetyNote: document.getElementById('planSafetyNote'),
  categoryHealth: document.getElementById('categoryHealth'),
  categoryHealthTitle: document.getElementById('categoryHealthTitle'),
  categoryHealthText: document.getElementById('categoryHealthText'),
  categoryHealthNote: document.getElementById('categoryHealthNote'),
  refineLargeButton: document.getElementById('refineLargeButton'),
  mergeTinyButton: document.getElementById('mergeTinyButton'),
  categoryOptions: document.getElementById('categoryOptions'),
  previewCount: document.getElementById('previewCount'),
  previewList: document.getElementById('previewList'),
  previewEmpty: document.getElementById('previewEmpty'),
  previewMore: document.getElementById('previewMore'),
  previewVisibleCount: document.getElementById('previewVisibleCount'),
  loadMoreButton: document.getElementById('loadMoreButton'),
  selectAll: document.getElementById('selectAll'),
  applyButton: document.getElementById('applyButton'),
  questionInput: document.getElementById('questionInput'),
  askButton: document.getElementById('askButton'),
  newChatButton: document.getElementById('newChatButton'),
  clearChatButton: document.getElementById('clearChatButton'),
  chatHistoryList: document.getElementById('chatHistoryList'),
  chatStatus: document.getElementById('chatStatus'),
  chatMessages: document.getElementById('chatMessages'),
}

const workspaceState = {
  tree: [],
  folders: [],
  job: null,
  chat: [],
  chatThreads: [],
  activeThreadId: null,
  askScopeTotal: 0,
  applyHistory: null,
  running: false,
  applying: false,
  relocatingLibrary: false,
  draftingInstruction: false,
  refiningPlan: false,
  asking: false,
  pendingAssistant: false,
  pauseRequested: false,
  cancelRequested: false,
  abortController: null,
  session: null,
  destinationExplicitlySelected: false,
  previewRenderLimit: PREVIEW_PAGE_SIZE,
}

document.addEventListener('DOMContentLoaded', initialize)
globalThis.addEventListener('hashchange', showRequestedView)
document.querySelectorAll('[data-question]').forEach((button) => {
  button.addEventListener('click', () => {
    if (workspaceState.asking) return
    elements.questionInput.value = button.dataset.question
    updateComposerState()
    void askBookmarks()
  })
})
document.querySelectorAll('[data-organizer-instruction]').forEach((button) => {
  button.addEventListener('click', () => {
    if (workspaceState.running || workspaceState.applying || workspaceState.draftingInstruction) {
      return
    }
    elements.instructionInput.value = button.dataset.organizerInstruction
    elements.instructionInput.focus()
    setStatus('Instruction preset loaded. Edit it or select Plan and scan.')
  })
})

elements.scopeSelect.addEventListener('change', updateScopeCount)
elements.destinationSelect.addEventListener('change', handleDestinationChange)
elements.moveLibraryButton.addEventListener('click', moveExistingLibraryToDestination)
elements.askScopeSelect.addEventListener('change', handleAskScopeChange)
elements.excludeOrganizer.addEventListener('change', updateScopeCount)
elements.draftInstructionButton.addEventListener('click', draftInstructionFromScope)
elements.startButton.addEventListener('click', startScan)
elements.pauseButton.addEventListener('click', pauseScan)
elements.resumeButton.addEventListener('click', resumeScan)
elements.cancelButton.addEventListener('click', cancelScan)
elements.refineLargeButton.addEventListener('click', refineLargeCategories)
elements.mergeTinyButton.addEventListener('click', mergeTinyCategories)
elements.applyButton.addEventListener('click', applySelected)
elements.undoButton.addEventListener('click', undoLastApply)
elements.selectAll.addEventListener('change', selectAllSuggestions)
elements.previewList.addEventListener('change', handlePreviewChange)
elements.loadMoreButton.addEventListener('click', showMorePreviewRows)
elements.askButton.addEventListener('click', askBookmarks)
elements.newChatButton.addEventListener('click', newConversation)
elements.clearChatButton.addEventListener('click', clearConversation)
elements.chatHistoryList.addEventListener('click', switchConversation)
elements.chatMessages.addEventListener('click', handleChatAction)
elements.questionInput.addEventListener('input', updateComposerState)
elements.questionInput.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    askBookmarks()
  }
})

async function initialize() {
  showRequestedView()
  setStatus('Loading local bookmark workspace…')

  try {
    const [tree, aiInfo, savedJob, savedChat, savedChatThreads, applyHistory] = await Promise.all([
      Organizer.getBookmarkTree(),
      Organizer.checkAiAvailability(),
      Organizer.readStorage(Organizer.JOB_STORAGE_KEY),
      Organizer.readStorage(Organizer.CHAT_STORAGE_KEY),
      Organizer.readStorage(Organizer.CHAT_THREADS_STORAGE_KEY),
      Organizer.readStorage(Organizer.APPLY_HISTORY_KEY),
    ])

    workspaceState.tree = tree
    workspaceState.folders = Organizer.collectFolderOptions(tree).filter(
      (folder) => !folder.unmodifiable,
    )
    workspaceState.applyHistory = applyHistory || null
    const priorModelCrash = savedJob?.localAiFallback?.message
      ? await Organizer.recordAiRuntimeFailure(
          new Error(savedJob.localAiFallback.message),
        )
      : false
    updateAiBadge(
      priorModelCrash
        ? {
            available: false,
            message: 'Chrome’s local model previously crashed. Local rules remain active while the Chrome model runtime recovers.',
          }
        : aiInfo,
    )
    renderFolderOptions()
    const chatStoreNeedsWrite = restoreChatThreads(savedChatThreads, savedChat)
    restoreActiveThreadScope()
    if (chatStoreNeedsWrite) {
      await persistChatThreads({ touch: false })
    }
    if (Array.isArray(savedChat)) {
      await Organizer.removeStorage(Organizer.CHAT_STORAGE_KEY)
    }

    if (savedJob?.version === 1) {
      workspaceState.job = savedJob
      const defaultDestination = Organizer.getDefaultDestinationRoot(tree)
      if (Organizer.shouldMigrateLegacyDestination(savedJob, tree)) {
        workspaceState.job.destinationRootId = defaultDestination.id
        workspaceState.job.destinationSelectionSource = 'migrated-default'
        workspaceState.job.statusMessage =
          'Destination updated to Bookmarks Bar for the new default. Review the proposed tree before applying.'
        workspaceState.job.updatedAt = new Date().toISOString()
        await persistJob()
      }
      workspaceState.destinationExplicitlySelected =
        workspaceState.job.destinationSelectionSource === 'user'
      if (['planning', 'running', 'pausing'].includes(savedJob.status)) {
        workspaceState.job.status = 'paused'
        workspaceState.job.statusMessage =
          'The workspace closed during processing. Resume from the latest checkpoint.'
        workspaceState.job.updatedAt = new Date().toISOString()
        await persistJob()
      }
      restoreJobControls()
    }

    renderJob()
    renderChat()
    elements.undoButton.hidden = !workspaceState.applyHistory?.entries?.length
    await updateScopeCount()
    await updateAskScopeCount()
    updateComposerState()
  } catch (error) {
    console.error(error)
    setStatus(error.message || 'Unable to load the bookmark workspace.', 'danger')
  }
}

function createThreadId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function createChatThread({ messages = [], scopeId = 'all', createdAt, updatedAt, id, title } = {}) {
  const now = new Date().toISOString()
  const normalizedMessages = Array.isArray(messages)
    ? messages
        .filter(
          (message) =>
            message &&
            ['user', 'assistant'].includes(message.role) &&
            typeof message.text === 'string',
        )
        .slice(-CHAT_HISTORY_LIMIT)
    : []
  const firstUserMessage = normalizedMessages.find((message) => message.role === 'user')
  const normalizedTitle = Organizer.deriveChatThreadTitle(title)

  return {
    id: typeof id === 'string' && id ? id : createThreadId(),
    title:
      normalizedTitle === 'New conversation'
        ? Organizer.deriveChatThreadTitle(firstUserMessage?.text)
        : normalizedTitle,
    scopeId: typeof scopeId === 'string' && scopeId ? scopeId : 'all',
    createdAt: typeof createdAt === 'string' ? createdAt : now,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : now,
    messages: normalizedMessages,
  }
}

function restoreChatThreads(savedStore, legacyMessages) {
  const sourceThreads = Array.isArray(savedStore?.threads) ? savedStore.threads : []
  const storedThreads = sourceThreads.length
    ? sourceThreads
        .filter((thread) => thread && typeof thread === 'object')
        .map((thread) => createChatThread(thread))
        .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
        .slice(0, CHAT_THREAD_LIMIT)
    : []
  let needsWrite =
    savedStore?.version !== 1 ||
    storedThreads.length === 0 ||
    storedThreads.length !== sourceThreads.length

  if (storedThreads.length === 0 && Array.isArray(legacyMessages) && legacyMessages.length > 0) {
    storedThreads.push(createChatThread({ messages: legacyMessages }))
    needsWrite = true
  }
  if (storedThreads.length === 0) storedThreads.push(createChatThread())

  workspaceState.chatThreads = storedThreads
  workspaceState.activeThreadId = storedThreads.some(
    (thread) => thread.id === savedStore?.activeThreadId,
  )
    ? savedStore.activeThreadId
    : storedThreads[0].id
  workspaceState.chat = getActiveThread().messages
  return needsWrite || workspaceState.activeThreadId !== savedStore?.activeThreadId
}

function getActiveThread() {
  return workspaceState.chatThreads.find(
    (thread) => thread.id === workspaceState.activeThreadId,
  )
}

function restoreActiveThreadScope() {
  const thread = getActiveThread()
  const scopeId = [...elements.askScopeSelect.options].some(
    (option) => option.value === thread?.scopeId,
  )
    ? thread.scopeId
    : 'all'
  elements.askScopeSelect.value = scopeId
  if (thread) thread.scopeId = scopeId
}

function syncActiveThread({ touch = true } = {}) {
  const thread = getActiveThread()
  if (!thread) return
  thread.messages = workspaceState.chat.slice(-CHAT_HISTORY_LIMIT)
  workspaceState.chat = thread.messages
  const firstUserMessage = thread.messages.find((message) => message.role === 'user')
  if (!thread.title || thread.title === 'New conversation') {
    thread.title = Organizer.deriveChatThreadTitle(firstUserMessage?.text)
  }
  thread.scopeId = elements.askScopeSelect.value || thread.scopeId || 'all'
  if (touch) thread.updatedAt = new Date().toISOString()
}

async function persistChatThreads({ touch = true } = {}) {
  syncActiveThread({ touch })
  workspaceState.chatThreads.sort(
    (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  )
  workspaceState.chatThreads = workspaceState.chatThreads.slice(0, CHAT_THREAD_LIMIT)
  await Organizer.writeStorage(Organizer.CHAT_THREADS_STORAGE_KEY, {
    version: 1,
    activeThreadId: workspaceState.activeThreadId,
    threads: workspaceState.chatThreads,
  })
}

async function handleAskScopeChange() {
  await persistChatThreads({ touch: false })
  await updateAskScopeCount()
  renderChatHistory()
}

function showRequestedView() {
  showView(globalThis.location.hash === '#ask' ? 'askView' : 'organizeView')
}

function showView(viewId) {
  document.querySelectorAll('.workspace-view').forEach((view) => {
    view.hidden = view.id !== viewId
  })
  document.querySelectorAll('.nav-button').forEach((button) => {
    const active = button.dataset.view === viewId
    button.classList.toggle('is-active', active)
    if (active) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  })
}

function renderFolderOptions() {
  const previousScope = elements.scopeSelect.value
  const previousAskScope = elements.askScopeSelect.value || 'all'
  const previousDestination = elements.destinationSelect.value
  const defaultRoot = Organizer.getDefaultDestinationRoot(workspaceState.tree)
  const organizerRootIds = new Set(
    Organizer.findOrganizerFolders(workspaceState.tree).map((folder) => String(folder.parentId)),
  )
  const hasExistingLibrary = organizerRootIds.size > 0

  elements.scopeSelect.replaceChildren()
  elements.askScopeSelect.replaceChildren()
  elements.destinationSelect.replaceChildren()

  const scopePlaceholder = document.createElement('option')
  scopePlaceholder.value = ''
  scopePlaceholder.textContent = 'Choose a folder or all bookmarks…'
  elements.scopeSelect.append(scopePlaceholder)
  const allScope = document.createElement('option')
  allScope.value = 'all'
  allScope.textContent = 'All bookmarks'
  elements.scopeSelect.append(allScope)
  const allAskScope = document.createElement('option')
  allAskScope.value = 'all'
  allAskScope.textContent = 'All bookmarks'
  elements.askScopeSelect.append(allAskScope)

  for (const folder of workspaceState.folders) {
    let destinationSuffix = ''
    if (organizerRootIds.has(String(folder.id))) {
      destinationSuffix = ' — Existing library'
    } else if (!hasExistingLibrary && String(folder.id) === String(defaultRoot?.id)) {
      destinationSuffix = ' — Recommended'
    } else if (/other bookmarks/i.test(folder.title || '')) {
      destinationSuffix = ' — Keeps the bar minimal'
    }
    const label = `${'— '.repeat(Math.max(0, folder.depth - 1))}${folder.path}`

    const scopeOption = document.createElement('option')
    scopeOption.value = folder.id
    scopeOption.textContent = label
    elements.scopeSelect.append(scopeOption)

    const askOption = document.createElement('option')
    askOption.value = folder.id
    askOption.textContent = label
    elements.askScopeSelect.append(askOption)

    const destinationOption = document.createElement('option')
    destinationOption.value = folder.id
    destinationOption.textContent = `${label}${destinationSuffix}`
    elements.destinationSelect.append(destinationOption)
  }

  const folderIds = new Set(workspaceState.folders.map((folder) => String(folder.id)))
  elements.scopeSelect.value = previousScope === 'all' || folderIds.has(previousScope)
    ? previousScope
    : ''
  elements.askScopeSelect.value = previousAskScope === 'all' || folderIds.has(previousAskScope)
    ? previousAskScope
    : 'all'
  elements.destinationSelect.value = folderIds.has(previousDestination)
    ? previousDestination
    : String(defaultRoot?.id || '')
  renderDestinationGuidance()
}

async function refreshBookmarkTreeAndFolders() {
  workspaceState.tree = await Organizer.getBookmarkTree()
  workspaceState.folders = Organizer.collectFolderOptions(workspaceState.tree).filter(
    (folder) => !folder.unmodifiable,
  )
  renderFolderOptions()
  if (workspaceState.job) restoreJobControls()
}

function organizerLibraryLocations() {
  return Organizer.findOrganizerFolders(workspaceState.tree).map((folder) => ({
    ...folder,
    root: workspaceState.folders.find(
      (candidate) => String(candidate.id) === String(folder.parentId),
    ) || null,
  }))
}

function hasOrganizerDestinationConflict(destinationRootId = elements.destinationSelect.value) {
  const locations = organizerLibraryLocations()
  return locations.length > 0 && !locations.some(
    (location) => String(location.parentId) === String(destinationRootId),
  )
}

function renderDestinationGuidance() {
  const destinationRootId = elements.destinationSelect.value
  const destination = getDestinationFolder(destinationRootId)
  const locations = organizerLibraryLocations()
  const current = locations.find(
    (location) => String(location.parentId) === String(destinationRootId),
  )
  const guidance = elements.destinationHint.closest('.destination-guidance')
  guidance.classList.remove('is-warning')
  elements.moveLibraryButton.hidden = true

  if (locations.length === 0) {
    elements.destinationHint.textContent = `Creates ${Organizer.ORGANIZER_FOLDER_NAME} in ${destination?.path || 'this location'}. Existing folders are kept.`
    return
  }

  if (current) {
    elements.destinationHint.textContent = `Uses the existing organized library here (${current.bookmarkCount.toLocaleString()} bookmark${current.bookmarkCount === 1 ? '' : 's'}).`
    if (locations.length > 1) {
      guidance.classList.add('is-warning')
      elements.destinationHint.textContent += ` ${locations.length} organized libraries currently exist.`
    }
    return
  }

  guidance.classList.add('is-warning')
  if (locations.length === 1) {
    const location = locations[0]
    elements.destinationHint.textContent = `Your existing organized library is in ${location.root?.path || 'another folder'}. Move it here before applying to avoid splitting the library.`
    elements.moveLibraryButton.hidden = false
    elements.moveLibraryButton.disabled = workspaceState.relocatingLibrary
    return
  }

  elements.destinationHint.textContent = `${locations.length} organized libraries already exist. Choose one of their locations before applying.`
}

async function updateScopeCount() {
  const scopeId = elements.scopeSelect.value
  if (!scopeId) {
    elements.scopeCount.textContent = 'Choose a scope'
    elements.startButton.disabled = true
    updateInstructionControls()
    return
  }

  const bookmarks = Organizer.collectBookmarks(workspaceState.tree, {
    scopeId,
    excludeOrganizer: elements.excludeOrganizer.checked,
  })
  elements.scopeCount.textContent = `${bookmarks.length.toLocaleString()} bookmark${
    bookmarks.length === 1 ? '' : 's'
  }`
  const automaticOption = elements.categoryLimit.querySelector('option[value="auto"]')
  if (automaticOption) {
    automaticOption.textContent = `Auto — up to ${Organizer.recommendedCategoryLimit(bookmarks.length)} leaf folders`
  }
  elements.startButton.disabled = workspaceState.running || bookmarks.length === 0
  updateInstructionControls()
}

async function handleDestinationChange() {
  workspaceState.destinationExplicitlySelected = true
  const job = workspaceState.job
  if (!job || workspaceState.running || workspaceState.applying) {
    renderDestinationGuidance()
    return
  }
  if (!['complete', 'paused', 'error'].includes(job.status)) {
    renderDestinationGuidance()
    return
  }
  if (job.destinationRootId === elements.destinationSelect.value) return

  job.destinationRootId = elements.destinationSelect.value
  job.destinationSelectionSource = 'user'
  job.updatedAt = new Date().toISOString()
  const destination = getDestinationFolder(job.destinationRootId)
  if (job.status === 'complete') {
    job.statusMessage = `Destination updated to ${destination?.path || destination?.title || 'the selected folder'}. Review the proposed tree before applying.`
  }
  await persistJob()
  renderJob()
}

async function moveExistingLibraryToDestination() {
  if (workspaceState.relocatingLibrary) return
  const locations = organizerLibraryLocations()
  const destinationRootId = elements.destinationSelect.value
  if (locations.length !== 1 || !hasOrganizerDestinationConflict(destinationRootId)) return

  const location = locations[0]
  const destination = getDestinationFolder(destinationRootId)
  if (!destination) return
  if (
    !globalThis.confirm(
      `Move ${Organizer.ORGANIZER_FOLDER_NAME} and its ${location.bookmarkCount.toLocaleString()} bookmark${location.bookmarkCount === 1 ? '' : 's'} from ${location.root?.path || 'its current location'} to ${destination.path}? This moves the existing folder; it does not copy bookmarks.`,
    )
  ) {
    return
  }

  workspaceState.relocatingLibrary = true
  renderControls()
  setStatus(`Moving the existing organized library to ${destination.path}…`)

  try {
    await Organizer.moveNode(location.id, { parentId: destinationRootId })
    if (workspaceState.job) {
      workspaceState.job.destinationRootId = destinationRootId
      workspaceState.job.destinationSelectionSource = 'user'
      workspaceState.job.statusMessage = workspaceState.job.status === 'applied'
        ? `Existing organized library moved to ${destination.path}. Applied bookmarks remain organized and no copies were created.`
        : `Existing organized library moved to ${destination.path}. Review the proposal before applying.`
      workspaceState.job.updatedAt = new Date().toISOString()
      await persistJob()
    }
    await refreshBookmarkTreeAndFolders()
    setStatus(`Existing organized library moved to ${destination.path}.`, 'success')
  } catch (error) {
    setStatus(error.message || 'Unable to move the existing organized library.', 'danger')
  } finally {
    workspaceState.relocatingLibrary = false
    renderJob()
  }
}

async function draftInstructionFromScope() {
  if (
    workspaceState.running ||
    workspaceState.applying ||
    workspaceState.draftingInstruction ||
    !elements.scopeSelect.value
  ) {
    return
  }

  workspaceState.draftingInstruction = true
  elements.draftInstructionButton.textContent = 'Drafting…'
  renderControls()
  setStatus('Drafting an instruction from local bookmark metadata…')
  let session = null
  let statusMessage = ''
  let statusTone = 'success'

  try {
    const tree = await Organizer.getBookmarkTree()
    workspaceState.tree = tree
    const bookmarks = Organizer.collectBookmarks(tree, {
      scopeId: elements.scopeSelect.value,
      excludeOrganizer: elements.excludeOrganizer.checked,
    })
    if (bookmarks.length === 0) throw new Error('No bookmarks were found in this scope.')

    const sessionResult = await Organizer.createLanguageModelSession()
    session = sessionResult.session
    updateAiBadge(sessionResult)
    let instruction = ''

    if (session) {
      const response = await Organizer.promptSession(
        session,
        Organizer.buildInstructionDraftPrompt(bookmarks, resolveCategoryLimit(bookmarks.length)),
      )
      instruction = Organizer.normalizePromptValue(Organizer.extractResponseText(response), 500)
        .replace(/^["']+|["']+$/g, '')
        .trim()
      statusMessage = 'Local AI drafted an instruction. Review or edit it before scanning.'
    } else {
      const themes = Organizer.buildFallbackCategoryPlan(
        bookmarks,
        resolveCategoryLimit(bookmarks.length),
      )
        .filter((category) => category !== Organizer.FALLBACK_CATEGORY)
        .slice(0, 6)
      instruction = `Group bookmarks into specific, reusable categories${
        themes.length ? ` such as ${themes.join(', ')}` : ''
      } where supported by their metadata. Keep categories distinct and avoid broad catch-all folders.`
      statusMessage = 'Chrome local AI is unavailable, so a deterministic metadata draft was used.'
      statusTone = 'warning'
    }

    if (!instruction) throw new Error('The local model did not return an instruction.')
    elements.instructionInput.value = instruction
    elements.instructionInput.focus()
  } catch (error) {
    const modelCrashed = await Organizer.recordAiRuntimeFailure(error)
    if (!modelCrashed) console.error(error)
    statusMessage = modelCrashed
      ? 'Chrome’s local model stopped. Choose a preset or write an instruction; local organization still works.'
      : error.message || 'Unable to draft an instruction for this scope.'
    statusTone = modelCrashed ? 'warning' : 'danger'
  } finally {
    session?.destroy?.()
    workspaceState.draftingInstruction = false
    elements.draftInstructionButton.textContent = 'Draft from scope'
    renderControls()
    setStatus(statusMessage, statusTone)
  }
}

function updateInstructionControls() {
  const setupLocked =
    workspaceState.running || workspaceState.applying || workspaceState.draftingInstruction
  const scopeCount = Number.parseInt(elements.scopeCount.textContent, 10)
  elements.draftInstructionButton.disabled =
    setupLocked || !elements.scopeSelect.value || !Number.isFinite(scopeCount) || scopeCount === 0
  document.querySelectorAll('[data-organizer-instruction]').forEach((button) => {
    button.disabled = setupLocked
  })
}

function resolveCategoryLimit(bookmarkCount) {
  const requested = Number(elements.categoryLimit.value)
  return Number.isFinite(requested) && requested > 0
    ? requested
    : Organizer.recommendedCategoryLimit(bookmarkCount)
}

async function updateAskScopeCount() {
  try {
    const tree = await Organizer.getBookmarkTree()
    workspaceState.tree = tree
    const bookmarks = Organizer.collectBookmarks(tree, {
      scopeId: elements.askScopeSelect.value || 'all',
      excludeOrganizer: false,
    }).filter((bookmark) => !isDuplicateReviewBookmark(bookmark))
    workspaceState.askScopeTotal = bookmarks.length
    elements.askScopeCount.textContent = `${bookmarks.length.toLocaleString()} bookmark${
      bookmarks.length === 1 ? '' : 's'
    } in scope`
  } catch (error) {
    console.error(error)
    workspaceState.askScopeTotal = 0
    elements.askScopeCount.textContent = 'Unable to read this scope'
  }
  updateComposerState()
}

async function startScan() {
  if (workspaceState.running || workspaceState.draftingInstruction || !elements.scopeSelect.value) {
    return
  }

  const bookmarks = Organizer.collectBookmarks(workspaceState.tree, {
    scopeId: elements.scopeSelect.value,
    excludeOrganizer: elements.excludeOrganizer.checked,
  })
  if (bookmarks.length === 0) {
    setStatus('No bookmarks were found in this scope.', 'warning')
    return
  }

  if (
    bookmarks.length > 250 &&
    !globalThis.confirm(
      `This scope contains ${bookmarks.length.toLocaleString()} bookmarks. The scan will checkpoint every batch and can be paused. Start it now?`,
    )
  ) {
    return
  }

  workspaceState.previewRenderLimit = PREVIEW_PAGE_SIZE
  const scopeOption = elements.scopeSelect.selectedOptions[0]
  workspaceState.job = {
    version: 1,
    id: String(Date.now()),
    status: 'planning',
    statusMessage: 'Preparing a collection-aware category plan…',
    scopeId: elements.scopeSelect.value,
    scopeLabel: scopeOption?.textContent?.trim() || 'Selected bookmarks',
    destinationRootId: elements.destinationSelect.value,
    destinationSelectionSource: workspaceState.destinationExplicitlySelected
      ? 'user'
      : 'default',
    instruction: elements.instructionInput.value.trim(),
    maxCategories: resolveCategoryLimit(bookmarks.length),
    categoryLimitMode: elements.categoryLimit.value,
    excludeOrganizer: elements.excludeOrganizer.checked,
    bookmarkIds: bookmarks.map((bookmark) => bookmark.id),
    processedIds: [],
    suggestions: [],
    categories: [],
    total: bookmarks.length,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  await persistJob()
  renderJob()
  await runJob()
}

async function resumeScan() {
  if (workspaceState.running || !workspaceState.job) return
  if (!['paused', 'error'].includes(workspaceState.job.status)) return

  workspaceState.job.status = workspaceState.job.categories.length > 0 ? 'running' : 'planning'
  workspaceState.job.statusMessage = 'Resuming from the latest completed batch…'
  await persistJob()
  renderJob()
  await runJob()
}

function isJobInterruption(error) {
  return Boolean(
    workspaceState.pauseRequested ||
    workspaceState.cancelRequested ||
    workspaceState.abortController?.signal?.aborted ||
    error?.name === 'AbortError',
  )
}

function recordLocalAiFallback(stage, error) {
  if (!workspaceState.job) return
  void Organizer.recordAiRuntimeFailure(error)
  workspaceState.job.localAiFallback = {
    stage,
    message: String(error?.message || error?.name || 'Chrome local AI was unavailable.').slice(0, 300),
    createdAt: new Date().toISOString(),
  }
}

function buildDeterministicAssignments(bookmarks, categories) {
  return bookmarks.map((bookmark) => ({
    id: bookmark.id,
    title: bookmark.title || bookmark.url,
    url: bookmark.url,
    parentId: bookmark.parentId,
    index: bookmark.index,
    folderPath: bookmark.folderPath,
    category: Organizer.fallbackCategory(bookmark, categories),
    reason: `Matched from ${Organizer.safeHostname(bookmark.url) || 'bookmark metadata'}.`,
    selected: true,
  }))
}

function applyTinyMergeRecommendations(recommendations) {
  if (!workspaceState.job || recommendations.length === 0) return 0
  const merges = new Map(recommendations.map((item) => [item.from, item]))
  let changed = 0

  for (const suggestion of workspaceState.job.suggestions) {
    const merge = merges.get(suggestion.category)
    if (!merge) continue
    suggestion.category = merge.to
    suggestion.reason = `${merge.from} had only ${merge.count} proposed bookmark${merge.count === 1 ? '' : 's'}; merged into ${merge.to}. ${suggestion.reason || ''}`.trim()
    changed += 1
  }

  return changed
}

function automaticallyImproveCompletedPlan() {
  if (!workspaceState.job) return null
  const improvement = Organizer.improveCategorySuggestions(
    workspaceState.job.suggestions,
  )
  workspaceState.job.suggestions = improvement.suggestions
  syncPlanCategories()

  const result = {
    version: 1,
    refinedFolders: improvement.refinedFolders.length,
    refinedBookmarks: improvement.refinedBookmarks,
    mergedFolders: improvement.mergedFolders.length,
    mergedBookmarks: improvement.mergedBookmarks,
    createdAt: new Date().toISOString(),
  }
  workspaceState.job.autoImprovement = result
  return result
}

async function runJob() {
  if (!workspaceState.job || workspaceState.running) return

  workspaceState.running = true
  workspaceState.pauseRequested = false
  workspaceState.cancelRequested = false
  workspaceState.abortController = new AbortController()
  renderJob()

  try {
    let sessionResult
    try {
      sessionResult = await Organizer.createLanguageModelSession({
        signal: workspaceState.abortController.signal,
        onDownload(percent) {
          const suffix = percent == null ? '' : ` ${Math.round(percent)}%`
          setStatus(`Downloading Chrome’s local AI model…${suffix}`)
        },
      })
    } catch (error) {
      if (isJobInterruption(error)) throw error
      recordLocalAiFallback('startup', error)
      sessionResult = {
        available: false,
        session: null,
        message: `Chrome local AI could not start (${error?.message || 'unknown error'}).`,
      }
    }
    workspaceState.session = sessionResult.session
    updateAiBadge(sessionResult)

    const currentTree = await Organizer.getBookmarkTree()
    workspaceState.tree = currentTree
    const currentBookmarks = Organizer.collectBookmarks(currentTree, {
      scopeId: workspaceState.job.scopeId,
      excludeOrganizer: workspaceState.job.excludeOrganizer,
    })
    const bookmarkMap = new Map(currentBookmarks.map((bookmark) => [bookmark.id, bookmark]))
    const orderedBookmarks = workspaceState.job.bookmarkIds
      .map((id) => bookmarkMap.get(id))
      .filter(Boolean)

    if (workspaceState.job.categories.length === 0) {
      workspaceState.job.status = 'planning'
      const useAiPlanning =
        Boolean(workspaceState.session) && orderedBookmarks.length <= AI_PLANNING_BOOKMARK_LIMIT
      workspaceState.job.statusMessage = useAiPlanning
        ? 'Building a category plan from the collection…'
        : workspaceState.session
          ? 'Using the detailed local taxonomy for this large collection…'
          : `${sessionResult.message} Using a deterministic local category plan.`
      renderJob()

      if (useAiPlanning) {
        try {
          const response = await Organizer.promptSession(
            workspaceState.session,
            Organizer.buildPlanningPrompt(
              orderedBookmarks,
              workspaceState.job.instruction,
              workspaceState.job.maxCategories,
            ),
            workspaceState.abortController.signal,
          )
          workspaceState.job.categories = Organizer.parseCategoryPlan(
            response,
            workspaceState.job.maxCategories,
            orderedBookmarks,
          )
        } catch (error) {
          if (isJobInterruption(error)) throw error
          recordLocalAiFallback('planning', error)
          workspaceState.session?.destroy?.()
          workspaceState.session = null
          updateAiBadge({
            available: false,
            message: `Local AI planning failed (${error?.message || 'unknown error'}). Local rules completed the plan.`,
          })
          workspaceState.job.categories = Organizer.buildFallbackCategoryPlan(
            orderedBookmarks,
            workspaceState.job.maxCategories,
          )
        }
      } else {
        workspaceState.job.categories = Organizer.buildFallbackCategoryPlan(
          orderedBookmarks,
          workspaceState.job.maxCategories,
        )
      }

      workspaceState.job.status = 'running'
      workspaceState.job.statusMessage = `Category plan ready. Assigning ${workspaceState.job.total.toLocaleString()} bookmarks in local batches…`
      workspaceState.job.updatedAt = new Date().toISOString()
      await persistJob()
      renderJob()
    }

    const processed = new Set(workspaceState.job.processedIds)
    const pending = orderedBookmarks.filter((bookmark) => !processed.has(bookmark.id))
    const assignmentBatchSize = workspaceState.session ? ASSIGNMENT_BATCH_SIZE : 120

    for (let start = 0; start < pending.length; start += assignmentBatchSize) {
      if (workspaceState.pauseRequested || workspaceState.cancelRequested) break

      const batch = pending.slice(start, start + assignmentBatchSize)
      let assignments

      if (workspaceState.session) {
        try {
          const response = await Organizer.promptSession(
            workspaceState.session,
            Organizer.buildAssignmentPrompt(
              batch,
              workspaceState.job.categories,
              workspaceState.job.instruction,
            ),
            workspaceState.abortController.signal,
          )
          assignments = Organizer.parseAssignments(
            response,
            batch,
            workspaceState.job.categories,
          )

          const unresolvedIds = new Set(
            assignments
              .filter((assignment) => assignment.category === Organizer.FALLBACK_CATEGORY)
              .map((assignment) => assignment.id),
          )
          if (unresolvedIds.size > 0) {
            const unresolvedBookmarks = batch.filter((bookmark) => unresolvedIds.has(bookmark.id))
            workspaceState.job.statusMessage = `Repairing ${unresolvedBookmarks.length.toLocaleString()} uncertain assignment${unresolvedBookmarks.length === 1 ? '' : 's'}…`
            renderControls()
            renderStatus()
            const repairResponse = await Organizer.promptSession(
              workspaceState.session,
              Organizer.buildAssignmentPrompt(
                unresolvedBookmarks,
                workspaceState.job.categories,
                `${workspaceState.job.instruction || ''} Choose the closest available folder for every item; do not leave any item uncategorized.`,
              ),
              workspaceState.abortController.signal,
            )
            const repaired = Organizer.parseAssignments(
              repairResponse,
              unresolvedBookmarks,
              workspaceState.job.categories,
            )
            const repairedById = new Map(repaired.map((assignment) => [assignment.id, assignment]))
            assignments = assignments.map((assignment) => {
              const candidate = repairedById.get(assignment.id)
              return candidate && candidate.category !== Organizer.FALLBACK_CATEGORY
                ? candidate
                : assignment
            })
          }
        } catch (error) {
          if (isJobInterruption(error)) throw error
          recordLocalAiFallback('assignment', error)
          workspaceState.session?.destroy?.()
          workspaceState.session = null
          updateAiBadge({
            available: false,
            message: `Local AI assignment failed (${error?.message || 'unknown error'}). Local rules completed the remaining bookmarks.`,
          })
          assignments = buildDeterministicAssignments(batch, workspaceState.job.categories)
        }
      } else {
        assignments = buildDeterministicAssignments(batch, workspaceState.job.categories)
      }

      workspaceState.job.suggestions.push(...assignments)
      workspaceState.job.processedIds.push(...batch.map((bookmark) => bookmark.id))
      workspaceState.job.statusMessage = `Processed ${workspaceState.job.processedIds.length.toLocaleString()} of ${workspaceState.job.total.toLocaleString()} bookmarks.`
      workspaceState.job.updatedAt = new Date().toISOString()
      const processedCount = workspaceState.job.processedIds.length
      const shouldCheckpoint =
        workspaceState.job.total <= 250 ||
        processedCount === workspaceState.job.total ||
        processedCount % (ASSIGNMENT_BATCH_SIZE * 10) === 0
      if (shouldCheckpoint) await persistJob()
      renderControls()
      renderStatus()
      if (
        shouldCheckpoint
      ) {
        renderCategoryPlan()
        renderPreview()
      }
      await yieldToUi()
    }

    if (workspaceState.cancelRequested) {
      workspaceState.job.status = 'cancelled'
      workspaceState.job.statusMessage =
        'Scan cancelled. Completed suggestions remain available for reference.'
    } else if (workspaceState.pauseRequested) {
      workspaceState.job.status = 'paused'
      workspaceState.job.statusMessage =
        'Paused at the latest completed batch. Resume whenever you are ready.'
    } else {
      const usedCategories = new Set(
        workspaceState.job.suggestions
          .map((suggestion) => suggestion.category)
          .filter((category) => category !== Organizer.FALLBACK_CATEGORY),
      )
      workspaceState.job.categories = workspaceState.job.categories.filter((category) =>
        usedCategories.has(category),
      )
      const improvement = automaticallyImproveCompletedPlan()
      const unresolved = workspaceState.job.suggestions.filter(
        (suggestion) => suggestion.category === Organizer.FALLBACK_CATEGORY,
      ).length
      workspaceState.job.status = 'complete'
      const improvementSummary = [
        improvement?.refinedFolders > 0
          ? `refined ${improvement.refinedFolders} oversized folder${improvement.refinedFolders === 1 ? '' : 's'}`
          : '',
        improvement?.mergedFolders > 0
          ? `merged ${improvement.mergedFolders} tiny folder${improvement.mergedFolders === 1 ? '' : 's'}`
          : '',
      ].filter(Boolean).join(' and ')
      workspaceState.job.statusMessage = unresolved > 0
        ? `Scan complete. ${unresolved.toLocaleString()} bookmark${unresolved === 1 ? '' : 's'} still need a folder before applying.`
        : `Scan complete. All ${workspaceState.job.suggestions.length.toLocaleString()} bookmarks have proposed folders.${improvementSummary ? ` The proposal automatically ${improvementSummary}.` : ''}`
    }
  } catch (error) {
    if (workspaceState.cancelRequested) {
      workspaceState.job.status = 'cancelled'
      workspaceState.job.statusMessage =
        'Scan cancelled. Completed suggestions remain available for reference.'
    } else if (isJobInterruption(error)) {
      workspaceState.job.status = 'paused'
      workspaceState.job.statusMessage =
        'Paused at the latest completed batch. Resume whenever you are ready.'
    } else {
      console.error(error)
      workspaceState.job.status = 'error'
      workspaceState.job.statusMessage =
        error.message || 'The local scan stopped unexpectedly. Resume to try again.'
    }
  } finally {
    workspaceState.session?.destroy?.()
    workspaceState.session = null
    workspaceState.abortController = null
    workspaceState.running = false
    workspaceState.pauseRequested = false
    workspaceState.cancelRequested = false
    workspaceState.job.updatedAt = new Date().toISOString()
    await persistJob()
    renderJob()
  }
}

async function pauseScan() {
  if (!workspaceState.running || !workspaceState.job) return
  workspaceState.pauseRequested = true
  workspaceState.job.status = 'pausing'
  workspaceState.job.statusMessage = 'Pausing after the current local batch…'
  workspaceState.abortController?.abort()
  await persistJob()
  renderJob()
}

async function cancelScan() {
  if (!workspaceState.job) return
  if (
    !globalThis.confirm(
      'Cancel this scan? Completed suggestions will remain visible, but the scan cannot be resumed.',
    )
  ) {
    return
  }

  workspaceState.cancelRequested = true
  workspaceState.pauseRequested = false
  workspaceState.job.status = 'cancelled'
  workspaceState.job.statusMessage =
    'Scan cancelled. Completed suggestions remain available for reference.'
  workspaceState.abortController?.abort()
  await persistJob()
  renderJob()
}

function restoreJobControls() {
  const job = workspaceState.job
  if (!job) return

  elements.scopeSelect.value = job.scopeId
  elements.destinationSelect.value = job.destinationRootId
  elements.instructionInput.value = job.instruction || ''
  const preferredLimit = job.categoryLimitMode || 'auto'
  elements.categoryLimit.value = [...elements.categoryLimit.options].some(
    (option) => option.value === preferredLimit,
  )
    ? preferredLimit
    : 'auto'
  elements.excludeOrganizer.checked = job.excludeOrganizer !== false
}

function renderJob() {
  renderControls()
  renderStatus()
  renderCategoryPlan()
  renderPreview()
}

function renderControls() {
  const status = workspaceState.job?.status
  const hasJob = Boolean(workspaceState.job)
  const canResume = ['paused', 'error'].includes(status)
  const setupLocked =
    workspaceState.running ||
    workspaceState.applying ||
    workspaceState.relocatingLibrary ||
    workspaceState.draftingInstruction ||
    workspaceState.refiningPlan

  elements.scopeSelect.disabled = setupLocked
  elements.destinationSelect.disabled = setupLocked
  elements.categoryLimit.disabled = setupLocked
  elements.excludeOrganizer.disabled = setupLocked
  elements.instructionInput.disabled = setupLocked
  elements.startButton.disabled =
    setupLocked || !elements.scopeSelect.value || Number.parseInt(elements.scopeCount.textContent, 10) === 0
  elements.pauseButton.disabled = !workspaceState.running || status === 'pausing'
  elements.resumeButton.disabled = workspaceState.running || !canResume
  elements.cancelButton.disabled =
    workspaceState.applying || !hasJob || ['complete', 'cancelled', 'applied'].includes(status)
  const selectedSuggestions = workspaceState.job?.suggestions?.filter(
    (suggestion) => suggestion.selected,
  ) || []
  elements.applyButton.disabled =
    workspaceState.applying ||
    status !== 'complete' ||
    selectedSuggestions.length === 0 ||
    selectedSuggestions.some((suggestion) => suggestion.category === Organizer.FALLBACK_CATEGORY) ||
    hasOrganizerDestinationConflict(workspaceState.job?.destinationRootId)
  const health = Organizer.analyzeCategoryHealth(workspaceState.job?.suggestions || [])
  elements.refineLargeButton.disabled =
    setupLocked ||
    status !== 'complete' ||
    !health.broad.some((item) => Organizer.categoryRefinementOptions(item.category).length > 0)
  elements.mergeTinyButton.disabled =
    setupLocked ||
    status !== 'complete' ||
    Organizer.recommendTinyCategoryMerges(workspaceState.job?.suggestions || []).length === 0
  renderDestinationGuidance()
  updateInstructionControls()
}

function renderStatus() {
  const job = workspaceState.job
  if (!job) {
    setStatus(elements.scopeSelect.value ? 'Ready to plan this scope.' : 'Choose a scope to begin.')
    setProgress(0)
    return
  }

  const tone =
    job.status === 'complete' || job.status === 'applied'
      ? 'success'
      : job.status === 'error'
        ? 'danger'
        : ['paused', 'cancelled'].includes(job.status)
          ? 'warning'
          : 'neutral'

  setStatus(job.statusMessage || 'Workspace ready.', tone)

  const processed = job.processedIds?.length || 0
  let progress = job.status === 'planning' ? 2 : job.total ? (processed / job.total) * 100 : 0
  if (['complete', 'applied'].includes(job.status)) progress = 100
  setProgress(progress)
}

function renderCategoryPlan() {
  const categories = workspaceState.job?.categories || []
  elements.categoryPlan.replaceChildren()
  elements.categoryOptions.replaceChildren()

  if (categories.length === 0) {
    elements.categoryPlan.className = 'category-plan empty-copy'
    elements.categoryPlan.textContent =
      'Categories will appear here before bookmark assignment begins.'
    elements.planCount.textContent = 'Not planned'
    elements.planVisualization.hidden = true
    elements.categoryHealth.hidden = true
    return
  }

  elements.categoryPlan.className = 'category-plan'
  const counts = new Map(
    Organizer.categoryCounts(workspaceState.job.suggestions).map((item) => [
      item.category,
      item.count,
    ]),
  )

  for (const category of categories) {
    const chip = document.createElement('span')
    chip.className = 'category-chip'
    chip.append(document.createTextNode(category))
    const count = document.createElement('span')
    count.textContent = String(counts.get(category) || 0)
    chip.append(count)
    elements.categoryPlan.append(chip)

    const option = document.createElement('option')
    option.value = category
    elements.categoryOptions.append(option)
  }
  const unresolved = workspaceState.job?.suggestions?.filter(
    (suggestion) => suggestion.category === Organizer.FALLBACK_CATEGORY,
  ).length || 0
  elements.planCount.textContent = `${categories.length} leaf folder${categories.length === 1 ? '' : 's'}${
    workspaceState.job?.status === 'complete' || workspaceState.job?.status === 'applied'
      ? unresolved > 0
        ? ` · ${unresolved} need review`
        : ' · all assigned'
      : ''
  }`
  renderPlanVisualization()

  const canReviewHealth = workspaceState.job?.status === 'complete'
  elements.categoryHealth.hidden = !canReviewHealth
  if (!canReviewHealth) return

  const health = Organizer.analyzeCategoryHealth(workspaceState.job.suggestions)
  const refinable = health.broad.filter(
    (item) => Organizer.categoryRefinementOptions(item.category).length > 0,
  )
  const merges = Organizer.recommendTinyCategoryMerges(workspaceState.job.suggestions)
  if (refinable.length === 0 && merges.length === 0) {
    elements.categoryHealthTitle.textContent = 'Plan looks balanced'
    if (health.broad.length > 0) {
      elements.categoryHealthTitle.textContent = 'Plan is ready for review'
      elements.categoryHealthText.textContent = `${health.broad.length} broad folder${health.broad.length === 1 ? '' : 's'} remain because the bookmark metadata does not support a reliable automatic split.`
    } else if (health.tiny.length > 0) {
      elements.categoryHealthText.textContent = `${health.tiny.length} small folder${health.tiny.length === 1 ? '' : 's'} remain because no safe merge target was found.`
    } else {
      elements.categoryHealthText.textContent = health.tinyThreshold > 0
        ? `No folder exceeds ${health.broadThreshold.toLocaleString()} bookmarks and no folder has ${health.tinyThreshold.toLocaleString()} or fewer.`
        : 'This collection is small enough that focused folders do not need to be merged.'
    }
  } else {
    elements.categoryHealthTitle.textContent = 'Plan can be tightened'
    const details = []
    if (refinable.length > 0) {
      details.push(`${refinable.length} refinable folder${refinable.length === 1 ? '' : 's'}`)
    }
    if (merges.length > 0) {
      details.push(`${merges.length} safely mergeable folder${merges.length === 1 ? '' : 's'}`)
    }
    elements.categoryHealthText.textContent = `${details.join(' and ')}. Refine or merge them before applying if the proposed changes are useful.`
  }
  elements.refineLargeButton.hidden = refinable.length === 0
  elements.refineLargeButton.textContent = workspaceState.refiningPlan
    ? 'Refining…'
    : `Refine ${refinable.length} large folder${refinable.length === 1 ? '' : 's'}`
  elements.mergeTinyButton.hidden = merges.length === 0
  elements.mergeTinyButton.textContent = `Merge ${merges.length} tiny folder${merges.length === 1 ? '' : 's'}`
  elements.categoryHealthNote.hidden = refinable.length === 0 && merges.length === 0
}

function getDestinationFolder(destinationRootId = workspaceState.job?.destinationRootId) {
  return workspaceState.folders.find((folder) => folder.id === destinationRootId) || null
}

function appendTreeRow(container, { label, count, level = 'leaf', branch = '•' }) {
  const row = document.createElement('div')
  row.className = `move-tree-row${level === 'parent' ? ' is-parent' : ''}${level === 'child' ? ' is-child' : ''}${level === 'grandchild' ? ' is-grandchild' : ''}${level === 'overflow' ? ' is-overflow' : ''}`

  const marker = document.createElement('span')
  marker.className = 'tree-branch'
  marker.textContent = branch
  const copy = document.createElement('span')
  copy.className = 'tree-label'
  copy.textContent = label
  copy.title = label
  row.append(marker, copy)

  if (Number.isFinite(count)) {
    const total = document.createElement('span')
    total.className = 'tree-count'
    total.textContent = count.toLocaleString()
    row.append(total)
  }
  container.append(row)
}

function renderPlanVisualization() {
  const suggestions = workspaceState.job?.suggestions || []
  const selected = suggestions.filter((suggestion) => suggestion.selected)
  elements.sourceTree.replaceChildren()
  elements.destinationTree.replaceChildren()

  if (suggestions.length === 0) {
    elements.planVisualization.hidden = true
    return
  }

  elements.planVisualization.hidden = false
  const sourceCounts = new Map()
  for (const suggestion of selected) {
    const path = suggestion.folderPath || 'Unfiled'
    sourceCounts.set(path, (sourceCounts.get(path) || 0) + 1)
  }
  const sources = [...sourceCounts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort((left, right) => right.count - left.count || left.path.localeCompare(right.path))
  const visibleSources = sources.slice(0, 12)
  elements.sourceTreeSummary.textContent = `${selected.length.toLocaleString()} selected from ${sources.length.toLocaleString()} folder${sources.length === 1 ? '' : 's'}`
  for (const source of visibleSources) {
    appendTreeRow(elements.sourceTree, {
      label: source.path,
      count: source.count,
      branch: '□',
    })
  }
  if (sources.length > visibleSources.length) {
    appendTreeRow(elements.sourceTree, {
      label: `${(sources.length - visibleSources.length).toLocaleString()} more source folders`,
      level: 'overflow',
      branch: '…',
    })
  }

  const destination = getDestinationFolder()
  const destinationPath = [
    destination?.path || destination?.title || 'Selected destination',
    Organizer.ORGANIZER_FOLDER_NAME,
  ].join(' / ')
  elements.destinationTreeSummary.textContent = destinationPath

  const parentGroups = new Map()
  for (const suggestion of selected) {
    const path = Organizer.splitCategoryPath(suggestion.category)
    const parent = path[0]
    const leaf = path[1] || null
    if (!parentGroups.has(parent)) {
      parentGroups.set(parent, { count: 0, leaves: new Map() })
    }
    const group = parentGroups.get(parent)
    group.count += 1
    if (leaf) group.leaves.set(leaf, (group.leaves.get(leaf) || 0) + 1)
  }

  const sortedParents = [...parentGroups.entries()]
    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
  for (const [parent, group] of sortedParents) {
    appendTreeRow(elements.destinationTree, {
      label: parent,
      count: group.count,
      level: 'parent',
      branch: group.leaves.size > 0 ? '▾' : '□',
    })
    for (const [leaf, count] of [...group.leaves.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))) {
      appendTreeRow(elements.destinationTree, {
        label: leaf,
        count,
        level: 'child',
        branch: '└',
      })
    }
  }

  elements.planSafetyNote.textContent = selected.length === suggestions.length
    ? `All ${selected.length.toLocaleString()} proposed bookmarks will move. Existing folders are kept and may become empty.`
    : `${selected.length.toLocaleString()} selected bookmarks will move; ${(suggestions.length - selected.length).toLocaleString()} unselected bookmarks will stay where they are. Existing folders are kept.`
}

function syncPlanCategories() {
  if (!workspaceState.job) return
  workspaceState.job.categories = [...new Set(
    workspaceState.job.suggestions
      .map((suggestion) => Organizer.sanitizeCategoryPath(suggestion.category))
      .filter((category) => category !== Organizer.FALLBACK_CATEGORY),
  )]
  workspaceState.job.maxCategories = Math.max(
    Number(workspaceState.job.maxCategories) || 0,
    workspaceState.job.categories.length,
  )
}

async function refineLargeCategories() {
  if (workspaceState.refiningPlan || workspaceState.job?.status !== 'complete') return
  const health = Organizer.analyzeCategoryHealth(workspaceState.job.suggestions)
  const targets = health.broad.filter(
    (item) => Organizer.categoryRefinementOptions(item.category).length > 0,
  )
  if (targets.length === 0) return

  workspaceState.refiningPlan = true
  workspaceState.job.statusMessage = 'Refining oversized folders in the proposal…'
  renderJob()
  let session = null
  let refinedCount = 0

  try {
    const sessionResult = await Organizer.createLanguageModelSession()
    session = sessionResult.session
    updateAiBadge(sessionResult)

    for (const target of targets) {
      const options = Organizer.categoryRefinementOptions(target.category)
      const suggestions = workspaceState.job.suggestions.filter(
        (suggestion) => suggestion.category === target.category,
      )

      for (let start = 0; start < suggestions.length; start += ASSIGNMENT_BATCH_SIZE) {
        const batch = suggestions.slice(start, start + ASSIGNMENT_BATCH_SIZE)
        const bookmarks = batch.map((suggestion) => ({
          id: suggestion.id,
          title: suggestion.title,
          url: suggestion.url,
          parentId: suggestion.parentId,
          index: suggestion.index,
          folderPath: suggestion.folderPath,
        }))
        let assignments

        if (session) {
          try {
            const response = await Organizer.promptSession(
              session,
              Organizer.buildAssignmentPrompt(
                bookmarks,
                options,
                `Refine the current ${target.category} folder into the most specific supported destination. Use the general option only when bookmark metadata does not support a narrower distinction.`,
              ),
            )
            assignments = Organizer.parseAssignments(response, bookmarks, options)
          } catch (error) {
            recordLocalAiFallback('refinement', error)
          }
        }

        if (!assignments) {
          assignments = bookmarks.map((bookmark) => ({
            id: bookmark.id,
            category:
              Organizer.fallbackCategory(bookmark, options) === Organizer.FALLBACK_CATEGORY
                ? options.at(-1)
                : Organizer.fallbackCategory(bookmark, options),
            reason: `Refined from ${target.category} using local bookmark metadata.`,
          }))
        }

        const byId = new Map(assignments.map((assignment) => [assignment.id, assignment]))
        for (const suggestion of batch) {
          const assignment = byId.get(suggestion.id)
          suggestion.category = assignment?.category === Organizer.FALLBACK_CATEGORY
            ? options.at(-1)
            : assignment?.category || options.at(-1)
          suggestion.reason = assignment?.reason || suggestion.reason
          refinedCount += 1
        }
        workspaceState.job.statusMessage = `Refined ${refinedCount.toLocaleString()} oversized-folder assignment${refinedCount === 1 ? '' : 's'} in the proposal…`
        renderStatus()
        await yieldToUi()
      }
    }

    syncPlanCategories()
    workspaceState.job.statusMessage = `Refined ${refinedCount.toLocaleString()} proposed assignment${refinedCount === 1 ? '' : 's'}. Review the new folders before applying.`
  } catch (error) {
    console.error(error)
    workspaceState.job.statusMessage = error.message || 'The folder refinement could not be completed.'
  } finally {
    session?.destroy?.()
    workspaceState.refiningPlan = false
    workspaceState.job.updatedAt = new Date().toISOString()
    await persistJob()
    renderJob()
  }
}

async function mergeTinyCategories() {
  if (workspaceState.refiningPlan || workspaceState.job?.status !== 'complete') return
  const recommendations = Organizer.recommendTinyCategoryMerges(
    workspaceState.job.suggestions,
  )
  if (recommendations.length === 0) return

  workspaceState.refiningPlan = true
  const changed = applyTinyMergeRecommendations(recommendations)

  syncPlanCategories()
  workspaceState.job.statusMessage = `Merged ${recommendations.length} tiny proposed folder${recommendations.length === 1 ? '' : 's'} across ${changed.toLocaleString()} bookmark${changed === 1 ? '' : 's'}. Review the changes before applying.`
  workspaceState.job.updatedAt = new Date().toISOString()
  workspaceState.refiningPlan = false
  await persistJob()
  renderJob()
}

function renderPreview() {
  const suggestions = workspaceState.job?.suggestions || []
  const visibleSuggestions = suggestions.slice(0, workspaceState.previewRenderLimit)
  elements.previewList.replaceChildren()
  elements.previewEmpty.hidden = suggestions.length > 0
  elements.previewList.hidden = suggestions.length === 0
  elements.previewMore.hidden = true

  const selectedCount = suggestions.filter((suggestion) => suggestion.selected).length
  elements.previewCount.textContent = `${selectedCount.toLocaleString()} of ${suggestions.length.toLocaleString()} selected`
  elements.selectAll.checked = suggestions.length > 0 && selectedCount === suggestions.length
  elements.selectAll.indeterminate = selectedCount > 0 && selectedCount < suggestions.length

  if (suggestions.length === 0) {
    renderControls()
    return
  }

  const fragment = document.createDocumentFragment()
  for (const suggestion of visibleSuggestions) {
    const row = document.createElement('div')
    row.className = `preview-row${suggestion.selected ? '' : ' is-unselected'}`
    row.dataset.bookmarkId = suggestion.id

    const checkbox = document.createElement('input')
    checkbox.className = 'preview-select'
    checkbox.type = 'checkbox'
    checkbox.checked = suggestion.selected
    checkbox.dataset.role = 'select'
    checkbox.setAttribute('aria-label', `Include ${suggestion.title}`)

    const copy = document.createElement('div')
    copy.className = 'bookmark-copy'
    const title = document.createElement('div')
    title.className = 'bookmark-title'
    title.textContent = suggestion.title || suggestion.url
    const url = document.createElement('div')
    url.className = 'bookmark-url'
    url.textContent = suggestion.url
    const path = document.createElement('div')
    path.className = 'bookmark-path'
    path.textContent = suggestion.folderPath || 'Unfiled'
    copy.append(title, url, path)

    const category = document.createElement('input')
    category.className = 'category-input'
    category.value = Organizer.sanitizeCategoryPath(suggestion.category)
    category.dataset.role = 'category'
    category.setAttribute('list', 'categoryOptions')
    category.setAttribute('aria-label', `Category for ${suggestion.title}`)

    const reason = document.createElement('div')
    reason.className = 'reason'
    reason.textContent = suggestion.reason || 'Based on bookmark metadata.'

    row.append(checkbox, copy, category, reason)
    fragment.append(row)
  }

  elements.previewList.append(fragment)
  const hiddenCount = Math.max(0, suggestions.length - visibleSuggestions.length)
  elements.previewMore.hidden = hiddenCount === 0
  elements.previewVisibleCount.textContent = `Showing ${visibleSuggestions.length.toLocaleString()} of ${suggestions.length.toLocaleString()} suggestions`
  elements.loadMoreButton.textContent = `Show ${Math.min(PREVIEW_PAGE_SIZE, hiddenCount).toLocaleString()} more`
  renderControls()
}

function showMorePreviewRows() {
  workspaceState.previewRenderLimit += PREVIEW_PAGE_SIZE
  renderPreview()
}

async function handlePreviewChange(event) {
  const row = event.target.closest('.preview-row')
  if (!row || !workspaceState.job) return
  const suggestion = workspaceState.job.suggestions.find(
    (item) => item.id === row.dataset.bookmarkId,
  )
  if (!suggestion) return

  if (event.target.dataset.role === 'select') {
    suggestion.selected = event.target.checked
  } else if (event.target.dataset.role === 'category') {
    suggestion.category = Organizer.sanitizeCategoryPath(event.target.value)
    event.target.value = suggestion.category
    if (!workspaceState.job.categories.includes(suggestion.category)) {
      workspaceState.job.categories.push(suggestion.category)
    }
    const usedCategories = new Set(
      workspaceState.job.suggestions.map((item) => item.category),
    )
    workspaceState.job.categories = workspaceState.job.categories.filter((category) =>
      usedCategories.has(category),
    )
  }

  workspaceState.job.updatedAt = new Date().toISOString()
  await persistJob()
  renderJob()
}

async function selectAllSuggestions() {
  if (!workspaceState.job) return
  for (const suggestion of workspaceState.job.suggestions) {
    suggestion.selected = elements.selectAll.checked
  }
  await persistJob()
  renderPreview()
}

async function applySelected() {
  if (workspaceState.applying || workspaceState.job?.status !== 'complete') return
  const selected = workspaceState.job.suggestions.filter((suggestion) => suggestion.selected)
  if (selected.length === 0) return
  if (hasOrganizerDestinationConflict(workspaceState.job.destinationRootId)) {
    setStatus('Move the existing organized library to this destination, or choose its current location, before applying.', 'warning')
    renderDestinationGuidance()
    return
  }
  const sourceFolderCount = new Set(selected.map((suggestion) => suggestion.folderPath || 'Unfiled')).size
  const destination = getDestinationFolder(workspaceState.job.destinationRootId)
  const destinationPath = `${destination?.path || destination?.title || 'the selected destination'} / ${Organizer.ORGANIZER_FOLDER_NAME}`

  if (
    !globalThis.confirm(
      `Move ${selected.length.toLocaleString()} selected bookmarks from ${sourceFolderCount.toLocaleString()} existing folder${sourceFolderCount === 1 ? '' : 's'} into ${destinationPath}? Existing folders will be kept and may become empty. You can undo the bookmark moves from this workspace.`,
    )
  ) {
    return
  }

  workspaceState.applying = true
  workspaceState.job.status = 'applying'
  workspaceState.job.statusMessage = 'Creating category folders and moving selected bookmarks…'
  renderJob()

  const history = {
    createdAt: new Date().toISOString(),
    entries: [],
  }
  const failures = []

  try {
    const organizerFolder = await Organizer.findOrCreateFolder(
      workspaceState.job.destinationRootId,
      Organizer.ORGANIZER_FOLDER_NAME,
    )
    const categoryFolders = new Map()

    for (let index = 0; index < selected.length; index += 1) {
      const suggestion = selected[index]
      const category = Organizer.sanitizeCategoryPath(suggestion.category)
      if (!categoryFolders.has(category)) {
        let parentId = organizerFolder.id
        const partialPath = []
        for (const folderName of Organizer.splitCategoryPath(category)) {
          partialPath.push(folderName)
          const pathKey = partialPath.join(Organizer.CATEGORY_SEPARATOR)
          if (!categoryFolders.has(pathKey)) {
            const folder = await Organizer.findOrCreateFolder(parentId, folderName)
            categoryFolders.set(pathKey, folder.id)
          }
          parentId = categoryFolders.get(pathKey)
        }
      }

      try {
        await Organizer.moveBookmark(suggestion.id, {
          parentId: categoryFolders.get(category),
        })
        history.entries.push({
          id: suggestion.id,
          parentId: suggestion.parentId,
          index: suggestion.index,
        })
      } catch (error) {
        failures.push({ id: suggestion.id, message: error.message })
      }

      workspaceState.job.statusMessage = `Moved ${index + 1} of ${selected.length} selected bookmarks…`
      setStatus(workspaceState.job.statusMessage)
      setProgress(((index + 1) / selected.length) * 100)
      await yieldToUi()
    }

    workspaceState.applyHistory = history
    await Organizer.writeStorage(Organizer.APPLY_HISTORY_KEY, history)
    workspaceState.job.status = 'applied'
    workspaceState.job.statusMessage =
      failures.length > 0
        ? `Applied with ${failures.length} skipped bookmark${failures.length === 1 ? '' : 's'}.`
        : `Moved ${history.entries.length.toLocaleString()} bookmarks. Undo remains available in this workspace.`
    workspaceState.job.updatedAt = new Date().toISOString()
    await persistJob()
    elements.undoButton.hidden = history.entries.length === 0
    await refreshBookmarkTreeAndFolders()
  } catch (error) {
    console.error(error)
    workspaceState.job.status = 'complete'
    workspaceState.job.statusMessage = error.message || 'Unable to apply bookmark changes.'
  } finally {
    workspaceState.applying = false
    await persistJob()
    renderJob()
  }
}

async function undoLastApply() {
  const history = workspaceState.applyHistory
  if (!history?.entries?.length) return
  if (
    !globalThis.confirm(
      `Move ${history.entries.length.toLocaleString()} bookmarks back to their previous folders? Empty organizer folders will be left in place.`,
    )
  ) {
    return
  }

  const entries = [...history.entries].sort((left, right) => {
    if (left.parentId === right.parentId) return (left.index || 0) - (right.index || 0)
    return String(left.parentId).localeCompare(String(right.parentId))
  })
  const failures = []

  for (const entry of entries) {
    try {
      await Organizer.moveBookmark(entry.id, {
        parentId: entry.parentId,
        index: entry.index,
      })
    } catch (error) {
      failures.push({ id: entry.id, message: error.message })
    }
  }

  workspaceState.applyHistory = null
  await Organizer.removeStorage(Organizer.APPLY_HISTORY_KEY)
  elements.undoButton.hidden = true

  if (workspaceState.job) {
    workspaceState.job.status = 'complete'
    workspaceState.job.statusMessage =
      failures.length > 0
        ? `Undo completed with ${failures.length} skipped bookmark${failures.length === 1 ? '' : 's'}.`
        : 'Last apply was undone. Empty organizer folders were left in place.'
    for (const suggestion of workspaceState.job.suggestions) suggestion.selected = false
    await persistJob()
  }

  await refreshBookmarkTreeAndFolders()
  renderJob()
}

async function askBookmarks() {
  const question = elements.questionInput.value.trim()
  if (!question || workspaceState.asking) return
  const askScopeId = elements.askScopeSelect.value || 'all'

  workspaceState.asking = true
  workspaceState.pendingAssistant = true
  elements.askButton.disabled = true
  elements.askButton.textContent = 'Working…'
  elements.chatStatus.textContent = 'Reading local bookmark metadata…'
  updateComposerState()

  try {
    const request = Organizer.classifyBookmarkRequest(question)
    const conversation = workspaceState.chat.slice(-6)
    const tree = await Organizer.getBookmarkTree()
    const bookmarks = Organizer.collectBookmarks(tree, {
      scopeId: askScopeId,
      excludeOrganizer: false,
    })
    const savedSuggestions = Array.isArray(workspaceState.job?.suggestions)
      ? workspaceState.job.suggestions
      : []
    const categoriesById = new Map(
      savedSuggestions.map((suggestion) => [
        suggestion.id,
        suggestion.category,
      ]),
    )
    const enriched = bookmarks.map((bookmark) => ({
      ...bookmark,
      category: categoriesById.get(bookmark.id) || bookmark.folderPath,
    }))
    const activeBookmarks = enriched.filter((bookmark) => !isDuplicateReviewBookmark(bookmark))
    workspaceState.askScopeTotal = activeBookmarks.length
    const duplicateGroups = request.type === 'duplicate_review'
      ? Organizer.findDuplicateGroups(activeBookmarks)
      : []
    const contextQuestion = Organizer.contextualizeBookmarkQuestion(question, conversation)
    const context = selectAskContext(activeBookmarks, contextQuestion)

    workspaceState.chat.push({
      role: 'user',
      text: question,
      createdAt: new Date().toISOString(),
    })
    syncActiveThread()
    await persistChatThreads()
    elements.questionInput.value = ''
    updateComposerState()
    renderChat()

    if (request.type === 'bookmark_count') {
      const summary = Organizer.summarizeBookmarkLocations(bookmarks)
      const scopeLabel =
        [...elements.askScopeSelect.options]
          .find((option) => option.value === askScopeId)
          ?.textContent?.trim() || 'the selected scope'
      const locationBreakdown = askScopeId === 'all' && summary.locations.length > 1
        ? ` By location: ${summary.locations
            .map((item) => `${item.location} (${item.count.toLocaleString()})`)
            .join(', ')}.`
        : ''
      workspaceState.chat.push({
        role: 'assistant',
        text: `You have ${summary.total.toLocaleString()} bookmark${summary.total === 1 ? '' : 's'} in ${scopeLabel}.${locationBreakdown}`,
        sources: [],
        createdAt: new Date().toISOString(),
      })
      return
    }

    if (request.type === 'duplicate_review') {
      const duplicateCopies = duplicateGroups.reduce(
        (total, group) => total + group.duplicates.length,
        0,
      )
      workspaceState.chat.push({
        role: 'assistant',
        text:
          duplicateGroups.length === 0
            ? 'I found no exact duplicate URLs in this scope. I ignore fragments and common tracking or login parameters, but I do not treat meaningfully different query URLs as duplicates.'
            : `I found ${duplicateGroups.length.toLocaleString()} exact duplicate group${duplicateGroups.length === 1 ? '' : 's'} containing ${duplicateCopies.toLocaleString()} extra cop${duplicateCopies === 1 ? 'y' : 'ies'}. I can prepare a reversible cleanup that moves only the extra copies into Duplicate Review. Nothing is deleted, and nothing moves until you review the proposal and select Apply selected.`,
        sources: duplicateGroups
          .flatMap((group) => group.bookmarks)
          .slice(0, 80)
          .map((bookmark, index) => ({
            sourceNumber: index + 1,
            title: bookmark.title || bookmark.url,
            url: bookmark.url,
          })),
        ...(duplicateGroups.length > 0
          ? {
              action: {
                type: 'review_duplicate_cleanup',
                scopeId: askScopeId,
                groupCount: duplicateGroups.length,
                duplicateCount: duplicateCopies,
                status: 'proposed',
              },
            }
          : {}),
        createdAt: new Date().toISOString(),
      })
      return
    }

    if (request.type === 'organization_plan') {
      workspaceState.chat.push({
        role: 'assistant',
        text: `I can use that as the organization instruction for the ${activeBookmarks.length.toLocaleString()} bookmarks in this scope. I will take you to the organizer setup first; no scan or bookmark move starts until you explicitly request it.`,
        sources: [],
        action: {
          type: 'prepare_organization',
          scopeId: askScopeId,
          instruction: request.instruction,
          status: 'proposed',
        },
        createdAt: new Date().toISOString(),
      })
      return
    }

    if (context.length === 0) {
      workspaceState.chat.push({
        role: 'assistant',
        text: 'No bookmarks were found in this scope.',
        sources: [],
        createdAt: new Date().toISOString(),
      })
      return
    }

    let session = null
    let answer
    try {
      const sessionResult = await Organizer.createLanguageModelSession()
      session = sessionResult.session
      updateAiBadge(sessionResult)

      if (session) {
        const response = await Organizer.promptSession(
          session,
          Organizer.buildQuestionPrompt(question, context, {
            totalBookmarks: activeBookmarks.length,
            conversation,
          }),
        )
        answer = Organizer.extractResponseText(response).trim()
      } else {
        answer = buildFallbackAnswer(context, sessionResult.message)
      }
    } catch (aiError) {
      await Organizer.recordAiRuntimeFailure(aiError)
      updateAiBadge({
        available: false,
        message: `Built-in AI answer failed: ${aiError?.message || 'unknown error'}`,
      })
      answer = buildFallbackAnswer(
        context,
        'Chrome Built-in AI could not complete this request. Local rules are active.',
      )
    } finally {
      session?.destroy?.()
    }

    workspaceState.chat.push({
      role: 'assistant',
      text: answer || 'The local model returned no answer.',
      sources: selectAnswerSources(answer, context),
      createdAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error(error)
    workspaceState.chat.push({
      role: 'assistant',
      text: error.message || 'Unable to answer from bookmark metadata.',
      sources: [],
      createdAt: new Date().toISOString(),
    })
  } finally {
    workspaceState.chat = workspaceState.chat.slice(-CHAT_HISTORY_LIMIT)
    await persistChatThreads()
    workspaceState.asking = false
    workspaceState.pendingAssistant = false
    elements.askButton.textContent = 'Send'
    updateComposerState()
    renderChat()
  }
}

function selectAnswerSources(answer, context) {
  const citedIndices = [
    ...new Set(
      [...String(answer || '').matchAll(/\[(\d+)\]/g)]
        .map((match) => Number(match[1]) - 1)
        .filter((index) => index >= 0 && index < context.length),
    ),
  ]
  const sourceIndices =
    citedIndices.length > 0
      ? citedIndices
      : context.slice(0, 40).map((_, index) => index)
  return sourceIndices.slice(0, 40).map((index) => ({
    sourceNumber: index + 1,
    title: context[index].title || context[index].url,
    url: context[index].url,
  }))
}

function selectAskContext(bookmarks, question) {
  if (/\b(?:vc|venture capital|venture firm|investor|investors)\b/i.test(question)) {
    const ventureMatches = bookmarks.filter((bookmark) =>
      /\b(?:vc|venture|ventures|venture capital|investor|investment fund)\b/i.test(
        `${bookmark.title || ''} ${bookmark.url || ''} ${bookmark.folderPath || ''}`,
      ),
    )
    if (ventureMatches.length > 0) return ventureMatches.slice(0, 100)
  }
  return Organizer.selectQuestionContext(bookmarks, question, 48)
}

function isDuplicateReviewBookmark(bookmark) {
  return String(bookmark.folderPath || '')
    .toLowerCase()
    .includes(`${Organizer.ORGANIZER_FOLDER_NAME.toLowerCase()} / duplicate review`)
}

async function handleChatAction(event) {
  const button = event.target.closest('[data-chat-action]')
  if (!button) return

  const messageIndex = Number(button.dataset.messageIndex)
  const action = workspaceState.chat[messageIndex]?.action
  if (!action || action.type !== button.dataset.chatAction || action.status === 'prepared') return

  button.disabled = true
  button.textContent = 'Preparing…'
  try {
    const prepared =
      action.type === 'review_duplicate_cleanup'
        ? await prepareDuplicateReview(action)
        : action.type === 'prepare_organization'
          ? await prepareOrganizationSetup(action)
          : false

    if (!prepared) {
      button.disabled = false
      renderChat()
      return
    }

    action.status = 'prepared'
    action.preparedAt = new Date().toISOString()
    await persistChatThreads()
    renderChat()
  } catch (error) {
    console.error(error)
    workspaceState.chat.push({
      role: 'assistant',
      text: error.message || 'Unable to prepare the duplicate review.',
      sources: [],
      createdAt: new Date().toISOString(),
    })
    workspaceState.chat = workspaceState.chat.slice(-CHAT_HISTORY_LIMIT)
    await persistChatThreads()
    renderChat()
  }
}

async function prepareOrganizationSetup(action) {
  if (workspaceState.running || workspaceState.applying) {
    throw new Error('Pause or finish the current organizer job before preparing another plan.')
  }

  const hasScope = [...elements.scopeSelect.options].some(
    (option) => option.value === action.scopeId,
  )
  elements.scopeSelect.value = hasScope ? action.scopeId : 'all'
  elements.instructionInput.value = action.instruction || ''
  await updateScopeCount()
  setStatus('Organization setup prepared. Review the scope and instruction, then select Plan and scan.')
  globalThis.location.hash = 'organize'
  showView('organizeView')
  globalThis.scrollTo({ top: 0, behavior: 'smooth' })
  elements.startButton.focus()
  return true
}

async function prepareDuplicateReview(action) {
  if (workspaceState.running || workspaceState.applying) {
    throw new Error('Pause or finish the current organizer job before preparing another review.')
  }

  if (
    workspaceState.job?.suggestions?.length > 0 &&
    !globalThis.confirm(
      'Replace the current organizer preview with a duplicate-cleanup review? No bookmarks will move yet.',
    )
  ) {
    return false
  }

  const tree = await Organizer.getBookmarkTree()
  const bookmarks = Organizer.collectBookmarks(tree, {
    scopeId: action.scopeId || 'all',
    excludeOrganizer: false,
  }).filter((bookmark) => !isDuplicateReviewBookmark(bookmark))
  const groups = Organizer.findDuplicateGroups(bookmarks)
  const suggestions = groups.flatMap((group) =>
    group.duplicates.map((bookmark) => ({
      id: bookmark.id,
      title: bookmark.title || bookmark.url,
      url: bookmark.url,
      parentId: bookmark.parentId,
      index: bookmark.index,
      folderPath: bookmark.folderPath,
      category: 'Duplicate Review',
      reason: `Exact duplicate of “${group.keeper.title || group.keeper.url}” after ignoring tracking-only URL details.`,
      selected: true,
    })),
  )

  if (suggestions.length === 0) {
    throw new Error('No actionable duplicate copies remain in this scope.')
  }

  const defaultRoot = Organizer.getDefaultDestinationRoot(tree)
  if (!defaultRoot?.id) throw new Error('No writable bookmark destination is available.')
  const scopeLabel =
    [...elements.askScopeSelect.options]
      .find((option) => option.value === (action.scopeId || 'all'))
      ?.textContent?.trim() || 'Selected bookmarks'
  const now = new Date().toISOString()

  workspaceState.tree = tree
  workspaceState.previewRenderLimit = PREVIEW_PAGE_SIZE
  workspaceState.job = {
    version: 1,
    id: String(Date.now()),
    status: 'complete',
    statusMessage: `Prepared ${suggestions.length.toLocaleString()} duplicate cop${suggestions.length === 1 ? 'y' : 'ies'} for review. Nothing has moved yet.`,
    scopeId: action.scopeId || 'all',
    scopeLabel,
    destinationRootId: elements.destinationSelect.value || defaultRoot.id,
    instruction: 'Quarantine exact duplicate copies for review without deleting bookmarks.',
    maxCategories: 1,
    excludeOrganizer: false,
    bookmarkIds: suggestions.map((suggestion) => suggestion.id),
    processedIds: suggestions.map((suggestion) => suggestion.id),
    suggestions,
    categories: ['Duplicate Review'],
    total: suggestions.length,
    startedAt: now,
    updatedAt: now,
  }

  elements.scopeSelect.value = workspaceState.job.scopeId
  elements.destinationSelect.value = workspaceState.job.destinationRootId
  elements.instructionInput.value = workspaceState.job.instruction
  elements.excludeOrganizer.checked = false
  await persistJob()
  renderJob()
  globalThis.location.hash = 'organize'
  showView('organizeView')
  globalThis.scrollTo({ top: 0, behavior: 'smooth' })
  return true
}

function buildFallbackAnswer(context, message) {
  const counts = Organizer.categoryCounts(context)
  const summary = counts
    .slice(0, 6)
    .map((item) => `${item.category} (${item.count})`)
    .join(', ')
  return `${message} The strongest metadata matches are listed below.${
    summary ? ` Their leading categories are ${summary}.` : ''
  }`
}

function renderChat() {
  renderChatHistory()
  elements.chatMessages.replaceChildren()
  elements.chatMessages.setAttribute('aria-busy', String(workspaceState.pendingAssistant))

  if (workspaceState.chat.length === 0 && !workspaceState.pendingAssistant) {
    const empty = document.createElement('div')
    empty.className = 'chat-empty'
    const mark = document.createElement('span')
    mark.className = 'chat-empty-mark'
    mark.setAttribute('aria-hidden', 'true')
    mark.textContent = '?'
    const title = document.createElement('strong')
    title.textContent = 'Ask, investigate, then act'
    const copy = document.createElement('span')
    copy.textContent =
      'Answers stay grounded in bookmark metadata. Actions become reviewable proposals; they never run silently. Choose a preset below to begin without typing.'
    empty.append(mark, title, copy)
    elements.chatMessages.append(empty)
    updateComposerState()
    return
  }

  workspaceState.chat.forEach((message, messageIndex) => {
    const article = document.createElement('article')
    article.className = `chat-message ${message.role}`
    const label = document.createElement('span')
    label.className = 'message-label'
    label.textContent = message.role === 'assistant' ? 'Bookmark assistant' : 'You'
    const body = document.createElement('div')
    body.className = 'message-body'
    const text = document.createElement('p')
    appendCitedText(text, message.text, message.sources)
    body.append(text)

    if (message.role === 'assistant' && message.sources?.length) {
      const panel = document.createElement('details')
      panel.className = 'source-panel'
      const summary = document.createElement('summary')
      summary.textContent = `${message.sources.length.toLocaleString()} bookmark source${
        message.sources.length === 1 ? '' : 's'
      }`
      const sources = document.createElement('ol')
      sources.className = 'source-list'
      message.sources.forEach((source, sourceIndex) => {
        const item = document.createElement('li')
        item.value = Number(source.sourceNumber) || sourceIndex + 1
        if (isSafeSourceUrl(source.url)) {
          const link = document.createElement('a')
          link.href = source.url
          link.target = '_blank'
          link.rel = 'noopener noreferrer'
          link.textContent = source.title
          item.append(link)
        } else {
          item.textContent = source.title
        }
        sources.append(item)
      })
      panel.append(summary, sources)
      body.append(panel)
    }

    if (message.role === 'assistant' && message.action) {
      body.append(createChatActionCard(message.action, messageIndex))
    }

    article.append(label, body)
    elements.chatMessages.append(article)
  })

  if (workspaceState.pendingAssistant) {
    const pending = document.createElement('article')
    pending.className = 'chat-message assistant chat-pending'
    const label = document.createElement('span')
    label.className = 'message-label'
    label.textContent = 'Bookmark assistant'
    const body = document.createElement('div')
    body.className = 'message-body'
    const indicator = document.createElement('span')
    indicator.className = 'thinking-indicator'
    indicator.setAttribute('aria-hidden', 'true')
    const copy = document.createElement('span')
    copy.textContent = 'Working from local bookmark metadata…'
    body.append(indicator, copy)
    pending.append(label, body)
    elements.chatMessages.append(pending)
  }

  updateComposerState()
  elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight
}

function renderChatHistory() {
  elements.chatHistoryList.replaceChildren()

  for (const thread of workspaceState.chatThreads) {
    const button = document.createElement('button')
    button.className = `history-item${
      thread.id === workspaceState.activeThreadId ? ' is-active' : ''
    }`
    button.type = 'button'
    button.dataset.threadId = thread.id
    button.disabled = workspaceState.asking
    button.setAttribute(
      'aria-current',
      thread.id === workspaceState.activeThreadId ? 'true' : 'false',
    )

    const title = document.createElement('span')
    title.className = 'history-title'
    title.textContent = thread.title || 'New conversation'
    const meta = document.createElement('span')
    meta.className = 'history-meta'
    const turns = thread.messages.filter((message) => message.role === 'user').length
    meta.textContent = `${turns.toLocaleString()} turn${turns === 1 ? '' : 's'} · ${formatThreadTime(
      thread.updatedAt,
    )}`
    button.append(title, meta)
    elements.chatHistoryList.append(button)
  }
}

function formatThreadTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'local'
  const today = new Date()
  if (date.toDateString() === today.toDateString()) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

async function newConversation() {
  if (workspaceState.asking) return
  const activeThread = getActiveThread()
  if (activeThread && activeThread.messages.length === 0) {
    elements.questionInput.focus()
    return
  }

  const thread = createChatThread({ scopeId: elements.askScopeSelect.value || 'all' })
  workspaceState.chatThreads.unshift(thread)
  workspaceState.chatThreads = workspaceState.chatThreads.slice(0, CHAT_THREAD_LIMIT)
  workspaceState.activeThreadId = thread.id
  workspaceState.chat = thread.messages
  restoreActiveThreadScope()
  await persistChatThreads({ touch: false })
  await updateAskScopeCount()
  renderChat()
  elements.questionInput.focus()
}

async function switchConversation(event) {
  const button = event.target.closest('[data-thread-id]')
  if (!button || workspaceState.asking || button.dataset.threadId === workspaceState.activeThreadId) {
    return
  }
  const thread = workspaceState.chatThreads.find(
    (candidate) => candidate.id === button.dataset.threadId,
  )
  if (!thread) return

  workspaceState.activeThreadId = thread.id
  workspaceState.chat = thread.messages
  restoreActiveThreadScope()
  await persistChatThreads({ touch: false })
  await updateAskScopeCount()
  renderChat()
  elements.questionInput.focus()
}

function appendCitedText(container, value, sources = []) {
  const sourceMap = new Map(
    sources.map((source, index) => [Number(source.sourceNumber) || index + 1, source]),
  )
  const parts = String(value || '').split(/(\[\d+\])/g)

  for (const part of parts) {
    const match = part.match(/^\[(\d+)\]$/)
    const source = match ? sourceMap.get(Number(match[1])) : null
    if (!source || !isSafeSourceUrl(source.url)) {
      container.append(document.createTextNode(part))
      continue
    }

    const link = document.createElement('a')
    link.className = 'citation-link'
    link.href = source.url
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.title = source.title
    link.textContent = match[1]
    container.append(link)
  }
}

function createChatActionCard(action, messageIndex) {
  const prepared = action.status === 'prepared'
  const card = document.createElement('div')
  card.className = `chat-action-card${prepared ? ' is-complete' : ''}`

  const icon = document.createElement('span')
  icon.className = 'chat-action-icon'
  icon.setAttribute('aria-hidden', 'true')
  icon.textContent = prepared ? '✓' : '→'

  const copy = document.createElement('div')
  copy.className = 'chat-action-copy'
  const eyebrow = document.createElement('span')
  eyebrow.textContent = prepared ? 'Prepared for review' : 'Proposed bookmark action'
  const title = document.createElement('strong')
  title.textContent =
    action.type === 'review_duplicate_cleanup'
      ? `${Number(action.duplicateCount || 0).toLocaleString()} duplicate copies`
      : 'Organization setup'
  copy.append(eyebrow, title)

  const button = document.createElement('button')
  button.className = 'chat-action-button'
  button.type = 'button'
  button.dataset.chatAction = action.type
  button.dataset.messageIndex = String(messageIndex)
  button.disabled = prepared
  button.textContent = prepared
    ? 'Ready in Organizer'
    : action.type === 'review_duplicate_cleanup'
      ? 'Review cleanup'
      : 'Review setup'

  card.append(icon, copy, button)
  return card
}

async function clearConversation() {
  if (workspaceState.asking) return
  const activeThread = getActiveThread()
  if (!activeThread) return
  if (!globalThis.confirm(`Delete “${activeThread.title}” from local chat history?`)) return

  workspaceState.chatThreads = workspaceState.chatThreads.filter(
    (thread) => thread.id !== activeThread.id,
  )
  if (workspaceState.chatThreads.length === 0) {
    workspaceState.chatThreads.push(
      createChatThread({ scopeId: elements.askScopeSelect.value || 'all' }),
    )
  }
  workspaceState.activeThreadId = workspaceState.chatThreads[0].id
  workspaceState.chat = workspaceState.chatThreads[0].messages
  restoreActiveThreadScope()
  await persistChatThreads({ touch: false })
  await updateAskScopeCount()
  renderChat()
  elements.questionInput.focus()
}

function updateComposerState() {
  const hasQuestion = elements.questionInput.value.trim().length > 0
  elements.askButton.disabled = workspaceState.asking || !hasQuestion
  elements.newChatButton.disabled = workspaceState.asking
  elements.clearChatButton.disabled = workspaceState.asking
  elements.askScopeSelect.disabled = workspaceState.asking
  elements.chatHistoryList.querySelectorAll('[data-thread-id]').forEach((button) => {
    button.disabled = workspaceState.asking
  })
  document.querySelectorAll('[data-question]').forEach((button) => {
    button.disabled = workspaceState.asking
  })
  if (!workspaceState.asking) {
    elements.chatStatus.textContent = workspaceState.askScopeTotal
      ? `${workspaceState.askScopeTotal.toLocaleString()} bookmarks available as local metadata`
      : 'Local metadata context'
  }
}

function isSafeSourceUrl(url) {
  return /^(?:https?|file):/i.test(url)
}

async function persistJob() {
  if (!workspaceState.job) {
    await Organizer.removeStorage(Organizer.JOB_STORAGE_KEY)
    return
  }
  await Organizer.writeStorage(Organizer.JOB_STORAGE_KEY, workspaceState.job)
}

function updateAiBadge(info) {
  elements.aiBadge.textContent = info.available ? 'AI Ready' : 'Local rules'
  elements.aiBadge.className = `badge ${info.available ? 'badge-success' : 'badge-warning'}`
  elements.aiBadge.title = info.message || ''
}

function setStatus(message, tone = 'neutral') {
  elements.statusText.textContent = message
  elements.statusDot.className = `status-dot ${
    tone === 'success'
      ? 'is-success'
      : tone === 'warning'
        ? 'is-warning'
        : tone === 'danger'
          ? 'is-danger'
          : ''
  }`
}

function setProgress(value) {
  const normalized = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  elements.progressBar.style.width = `${normalized}%`
  elements.progressLabel.textContent = `${Math.round(normalized)}%`
}

function yieldToUi() {
  return new Promise((resolve) => setTimeout(resolve, 0))
}
