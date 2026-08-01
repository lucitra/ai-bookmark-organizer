'use strict'

const Organizer = globalThis.BookmarkOrganizer
const ASSIGNMENT_BATCH_SIZE = 12
const CHAT_HISTORY_LIMIT = 20
const CHAT_THREAD_LIMIT = 12

const elements = {
  aiBadge: document.getElementById('aiBadge'),
  scopeSelect: document.getElementById('scopeSelect'),
  askScopeSelect: document.getElementById('askScopeSelect'),
  askScopeCount: document.getElementById('askScopeCount'),
  destinationSelect: document.getElementById('destinationSelect'),
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
  categoryOptions: document.getElementById('categoryOptions'),
  previewCount: document.getElementById('previewCount'),
  previewList: document.getElementById('previewList'),
  previewEmpty: document.getElementById('previewEmpty'),
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
  draftingInstruction: false,
  asking: false,
  pendingAssistant: false,
  pauseRequested: false,
  cancelRequested: false,
  abortController: null,
  session: null,
}

document.addEventListener('DOMContentLoaded', initialize)
globalThis.addEventListener('hashchange', showRequestedView)
document.querySelectorAll('.nav-button').forEach((button) => {
  button.addEventListener('click', () => {
    globalThis.location.hash = button.dataset.view === 'askView' ? 'ask' : 'organize'
    showView(button.dataset.view)
  })
})
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
elements.askScopeSelect.addEventListener('change', handleAskScopeChange)
elements.excludeOrganizer.addEventListener('change', updateScopeCount)
elements.draftInstructionButton.addEventListener('click', draftInstructionFromScope)
elements.startButton.addEventListener('click', startScan)
elements.pauseButton.addEventListener('click', pauseScan)
elements.resumeButton.addEventListener('click', resumeScan)
elements.cancelButton.addEventListener('click', cancelScan)
elements.applyButton.addEventListener('click', applySelected)
elements.undoButton.addEventListener('click', undoLastApply)
elements.selectAll.addEventListener('change', selectAllSuggestions)
elements.previewList.addEventListener('change', handlePreviewChange)
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
    updateAiBadge(aiInfo)
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
    button.classList.toggle('is-active', button.dataset.view === viewId)
  })
}

function renderFolderOptions() {
  const defaultRoot = Organizer.getDefaultDestinationRoot(workspaceState.tree)

  for (const folder of workspaceState.folders) {
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
    destinationOption.textContent = label
    destinationOption.selected = folder.id === defaultRoot?.id
    elements.destinationSelect.append(destinationOption)
  }
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
  elements.startButton.disabled = workspaceState.running || bookmarks.length === 0
  updateInstructionControls()
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
        Organizer.buildInstructionDraftPrompt(bookmarks, Number(elements.categoryLimit.value)),
      )
      instruction = Organizer.normalizePromptValue(Organizer.extractResponseText(response), 500)
        .replace(/^["']+|["']+$/g, '')
        .trim()
      statusMessage = 'Local AI drafted an instruction. Review or edit it before scanning.'
    } else {
      const themes = Organizer.buildFallbackCategoryPlan(
        bookmarks,
        Number(elements.categoryLimit.value),
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
    console.error(error)
    statusMessage = error.message || 'Unable to draft an instruction for this scope.'
    statusTone = 'danger'
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

  const scopeOption = elements.scopeSelect.selectedOptions[0]
  workspaceState.job = {
    version: 1,
    id: String(Date.now()),
    status: 'planning',
    statusMessage: 'Preparing a collection-aware category plan…',
    scopeId: elements.scopeSelect.value,
    scopeLabel: scopeOption?.textContent?.trim() || 'Selected bookmarks',
    destinationRootId: elements.destinationSelect.value,
    instruction: elements.instructionInput.value.trim(),
    maxCategories: Number(elements.categoryLimit.value),
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

async function runJob() {
  if (!workspaceState.job || workspaceState.running) return

  workspaceState.running = true
  workspaceState.pauseRequested = false
  workspaceState.cancelRequested = false
  workspaceState.abortController = new AbortController()
  renderJob()

  try {
    const sessionResult = await Organizer.createLanguageModelSession({
      signal: workspaceState.abortController.signal,
      onDownload(percent) {
        const suffix = percent == null ? '' : ` ${Math.round(percent)}%`
        setStatus(`Downloading Chrome’s local AI model…${suffix}`)
      },
    })
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
      workspaceState.job.statusMessage = workspaceState.session
        ? 'Building a category plan from the collection…'
        : `${sessionResult.message} Using a deterministic local category plan.`
      renderJob()

      if (workspaceState.session) {
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
        )
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

    for (let start = 0; start < pending.length; start += ASSIGNMENT_BATCH_SIZE) {
      if (workspaceState.pauseRequested || workspaceState.cancelRequested) break

      const batch = pending.slice(start, start + ASSIGNMENT_BATCH_SIZE)
      let assignments

      if (workspaceState.session) {
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
      } else {
        assignments = batch.map((bookmark) => ({
          id: bookmark.id,
          title: bookmark.title || bookmark.url,
          url: bookmark.url,
          parentId: bookmark.parentId,
          index: bookmark.index,
          folderPath: bookmark.folderPath,
          category: Organizer.fallbackCategory(
            bookmark,
            workspaceState.job.categories,
          ),
          reason: `Matched from ${Organizer.safeHostname(bookmark.url) || 'bookmark metadata'}.`,
          selected: true,
        }))
      }

      workspaceState.job.suggestions.push(...assignments)
      workspaceState.job.processedIds.push(...batch.map((bookmark) => bookmark.id))
      workspaceState.job.statusMessage = `Processed ${workspaceState.job.processedIds.length.toLocaleString()} of ${workspaceState.job.total.toLocaleString()} bookmarks.`
      workspaceState.job.updatedAt = new Date().toISOString()
      await persistJob()
      renderJob()
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
      workspaceState.job.status = 'complete'
      workspaceState.job.statusMessage = `Scan complete. Review ${workspaceState.job.suggestions.length.toLocaleString()} proposed moves before applying.`
    }
  } catch (error) {
    if (workspaceState.cancelRequested) {
      workspaceState.job.status = 'cancelled'
      workspaceState.job.statusMessage =
        'Scan cancelled. Completed suggestions remain available for reference.'
    } else if (
      workspaceState.pauseRequested ||
      workspaceState.abortController?.signal.aborted ||
      error?.name === 'AbortError'
    ) {
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
  elements.categoryLimit.value = String(job.maxCategories || 8)
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
    workspaceState.running || workspaceState.applying || workspaceState.draftingInstruction

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
  elements.applyButton.disabled =
    workspaceState.applying ||
    status !== 'complete' ||
    !workspaceState.job?.suggestions?.some((suggestion) => suggestion.selected)
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
  elements.planCount.textContent = `${categories.length} categories`
}

function renderPreview() {
  const suggestions = workspaceState.job?.suggestions || []
  elements.previewList.replaceChildren()
  elements.previewEmpty.hidden = suggestions.length > 0
  elements.previewList.hidden = suggestions.length === 0

  const selectedCount = suggestions.filter((suggestion) => suggestion.selected).length
  elements.previewCount.textContent = `${selectedCount.toLocaleString()} of ${suggestions.length.toLocaleString()} selected`
  elements.selectAll.checked = suggestions.length > 0 && selectedCount === suggestions.length
  elements.selectAll.indeterminate = selectedCount > 0 && selectedCount < suggestions.length

  if (suggestions.length === 0) {
    renderControls()
    return
  }

  const fragment = document.createDocumentFragment()
  for (const suggestion of suggestions) {
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
    category.value = Organizer.sanitizeCategory(suggestion.category)
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
  renderControls()
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
    suggestion.category = Organizer.sanitizeCategory(event.target.value)
    event.target.value = suggestion.category
    if (!workspaceState.job.categories.includes(suggestion.category)) {
      workspaceState.job.categories.splice(
        Math.max(0, workspaceState.job.categories.length - 1),
        0,
        suggestion.category,
      )
    }
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

  if (
    !globalThis.confirm(
      `Move ${selected.length.toLocaleString()} selected bookmarks into ${Organizer.ORGANIZER_FOLDER_NAME}? You can undo the bookmark moves from this workspace.`,
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
      const category = Organizer.sanitizeCategory(suggestion.category)
      if (!categoryFolders.has(category)) {
        const folder = await Organizer.findOrCreateFolder(organizerFolder.id, category)
        categoryFolders.set(category, folder.id)
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
    workspaceState.tree = await Organizer.getBookmarkTree()
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

  workspaceState.tree = await Organizer.getBookmarkTree()
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
    const categoriesById = new Map(
      (workspaceState.job?.suggestions || []).map((suggestion) => [
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
  elements.aiBadge.textContent = info.available ? 'AI Ready' : 'Fallback'
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
