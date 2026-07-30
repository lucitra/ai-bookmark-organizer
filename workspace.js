'use strict'

const Organizer = globalThis.BookmarkOrganizer
const ASSIGNMENT_BATCH_SIZE = 12
const CHAT_HISTORY_LIMIT = 20

const elements = {
  aiBadge: document.getElementById('aiBadge'),
  scopeSelect: document.getElementById('scopeSelect'),
  askScopeSelect: document.getElementById('askScopeSelect'),
  destinationSelect: document.getElementById('destinationSelect'),
  categoryLimit: document.getElementById('categoryLimit'),
  excludeOrganizer: document.getElementById('excludeOrganizer'),
  instructionInput: document.getElementById('instructionInput'),
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
  chatMessages: document.getElementById('chatMessages'),
}

const workspaceState = {
  tree: [],
  folders: [],
  job: null,
  chat: [],
  applyHistory: null,
  running: false,
  applying: false,
  asking: false,
  pauseRequested: false,
  cancelRequested: false,
  abortController: null,
  session: null,
}

document.addEventListener('DOMContentLoaded', initialize)
document.querySelectorAll('.nav-button').forEach((button) => {
  button.addEventListener('click', () => showView(button.dataset.view))
})
document.querySelectorAll('[data-question]').forEach((button) => {
  button.addEventListener('click', () => {
    elements.questionInput.value = button.dataset.question
    elements.questionInput.focus()
  })
})

elements.scopeSelect.addEventListener('change', updateScopeCount)
elements.excludeOrganizer.addEventListener('change', updateScopeCount)
elements.startButton.addEventListener('click', startScan)
elements.pauseButton.addEventListener('click', pauseScan)
elements.resumeButton.addEventListener('click', resumeScan)
elements.cancelButton.addEventListener('click', cancelScan)
elements.applyButton.addEventListener('click', applySelected)
elements.undoButton.addEventListener('click', undoLastApply)
elements.selectAll.addEventListener('change', selectAllSuggestions)
elements.previewList.addEventListener('change', handlePreviewChange)
elements.askButton.addEventListener('click', askBookmarks)
elements.questionInput.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') askBookmarks()
})

async function initialize() {
  setStatus('Loading local bookmark workspace…')

  try {
    const [tree, aiInfo, savedJob, savedChat, applyHistory] = await Promise.all([
      Organizer.getBookmarkTree(),
      Organizer.checkAiAvailability(),
      Organizer.readStorage(Organizer.JOB_STORAGE_KEY),
      Organizer.readStorage(Organizer.CHAT_STORAGE_KEY),
      Organizer.readStorage(Organizer.APPLY_HISTORY_KEY),
    ])

    workspaceState.tree = tree
    workspaceState.folders = Organizer.collectFolderOptions(tree).filter(
      (folder) => !folder.unmodifiable,
    )
    workspaceState.chat = Array.isArray(savedChat) ? savedChat.slice(-CHAT_HISTORY_LIMIT) : []
    workspaceState.applyHistory = applyHistory || null
    updateAiBadge(aiInfo)
    renderFolderOptions()

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
  } catch (error) {
    console.error(error)
    setStatus(error.message || 'Unable to load the bookmark workspace.', 'danger')
  }
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
}

async function startScan() {
  if (workspaceState.running || !elements.scopeSelect.value) return

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
  const setupLocked = workspaceState.running || workspaceState.applying

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

  workspaceState.asking = true
  elements.askButton.disabled = true
  elements.askButton.textContent = 'Thinking locally…'

  try {
    const tree = await Organizer.getBookmarkTree()
    const bookmarks = Organizer.collectBookmarks(tree, {
      scopeId: elements.askScopeSelect.value || 'all',
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
    const context = selectAskContext(enriched, question)

    workspaceState.chat.push({
      role: 'user',
      text: question,
      createdAt: new Date().toISOString(),
    })
    renderChat()
    elements.questionInput.value = ''

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
          Organizer.buildQuestionPrompt(question, context),
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
      sources: selectAnswerSources(answer, context).map((bookmark) => ({
        title: bookmark.title || bookmark.url,
        url: bookmark.url,
      })),
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
    await Organizer.writeStorage(Organizer.CHAT_STORAGE_KEY, workspaceState.chat)
    workspaceState.asking = false
    elements.askButton.disabled = false
    elements.askButton.textContent = 'Ask locally'
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
  const sources =
    citedIndices.length > 0 ? citedIndices.map((index) => context[index]) : context.slice(0, 10)
  return sources.slice(0, 12)
}

function selectAskContext(bookmarks, question) {
  if (/duplicate|same link|same url/i.test(question)) {
    const byUrl = new Map()
    for (const bookmark of bookmarks) {
      const key = bookmark.url.replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase()
      const group = byUrl.get(key) || []
      group.push(bookmark)
      byUrl.set(key, group)
    }
    const duplicates = [...byUrl.values()].filter((group) => group.length > 1).flat()
    if (duplicates.length > 0) return duplicates.slice(0, 36)
  }
  return Organizer.selectQuestionContext(bookmarks, question, 36)
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
  elements.chatMessages.replaceChildren()
  if (workspaceState.chat.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'chat-empty'
    empty.textContent =
      'Ask a question to receive an answer with links back to relevant bookmarks.'
    elements.chatMessages.append(empty)
    return
  }

  for (const message of workspaceState.chat) {
    const article = document.createElement('article')
    article.className = `chat-message ${message.role}`
    const text = document.createElement('p')
    text.textContent = message.text
    article.append(text)

    if (message.role === 'assistant' && message.sources?.length) {
      const sources = document.createElement('ol')
      sources.className = 'source-list'
      for (const source of message.sources) {
        const item = document.createElement('li')
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
      }
      article.append(sources)
    }

    elements.chatMessages.append(article)
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
