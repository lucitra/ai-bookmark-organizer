importScripts('shared.js', 'agent-core.js')

'use strict'

const Organizer = globalThis.BookmarkOrganizer
const AgentCore = globalThis.BookmarkAgentCore
const NATIVE_HOST_NAME = 'ai.lucitra.bookmarks'
const BRIDGE_PROTOCOL_VERSION = 1

let nativePort = null
let reconnectTimer = null
let mutationQueue = Promise.resolve()
let connectionState = {
  connected: false,
  message: 'Agent Access is not connected.',
  updatedAt: null,
}

function chromeCall(target, method, ...args) {
  return new Promise((resolve, reject) => {
    target[method](...args, (result) => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message))
      else resolve(result)
    })
  })
}

async function readPolicy() {
  const stored = await Organizer.readStorage(AgentCore.POLICY_STORAGE_KEY)
  return AgentCore.normalizePolicy(stored)
}

function setConnectionState(connected, message) {
  connectionState = {
    connected,
    message,
    updatedAt: new Date().toISOString(),
  }
}

function clearReconnectTimer() {
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectTimer = null
}

function disconnectNative() {
  clearReconnectTimer()
  if (nativePort) nativePort.disconnect()
  nativePort = null
  setConnectionState(false, 'Agent Access is disconnected.')
}

async function hasNativePermission() {
  return chromeCall(chrome.permissions, 'contains', { permissions: ['nativeMessaging'] })
}

async function connectNative({ retry = false } = {}) {
  if (nativePort) return

  const policy = await readPolicy()
  if (!policy.enabled || !(await hasNativePermission())) {
    setConnectionState(false, 'Agent Access is disabled or permission has not been granted.')
    return
  }

  clearReconnectTimer()

  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME)
    nativePort = port
    setConnectionState(true, 'Local companion connected.')

    port.onMessage.addListener((request) => {
      void processNativeRequest(request).then((response) => {
        if (nativePort === port) port.postMessage(response)
      })
    })

    port.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError
      if (nativePort !== port) return
      nativePort = null
      setConnectionState(false, error?.message || 'Local companion disconnected.')
      if (retry) reconnectTimer = setTimeout(() => void connectNative({ retry: true }), 10_000)
    })
  } catch (error) {
    nativePort = null
    setConnectionState(false, error.message || 'Unable to connect to the local companion.')
  }
}

function successResponse(request, result) {
  return { id: request?.id || null, ok: true, result }
}

function errorResponse(request, error) {
  return {
    id: request?.id || null,
    ok: false,
    error: {
      code: error?.code || 'BOOKMARK_AGENT_ERROR',
      message: error?.message || 'The bookmark agent request failed.',
    },
  }
}

function requestError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(maximum, Math.max(minimum, parsed))
}

function recordForAgent(bookmark) {
  return {
    id: bookmark.id,
    title: String(bookmark.title || '').slice(0, 300),
    url: String(bookmark.url || '').slice(0, 2_048),
    host: Organizer.safeHostname(bookmark.url),
    folderPath: String(bookmark.folderPath || '').slice(0, 500),
    parentId: bookmark.parentId || null,
  }
}

function resolveEffectiveScope(policy, requestedScopeId) {
  const requested = String(requestedScopeId || '').trim()
  if (policy.scopeId !== 'all') {
    if (requested && requested !== policy.scopeId) {
      throw requestError('SCOPE_NOT_ALLOWED', 'The requested scope is outside the scope approved in settings.')
    }
    return policy.scopeId
  }
  return requested || 'all'
}

async function loadScope(policy, requestedScopeId) {
  const tree = await Organizer.getBookmarkTree()
  const scopeId = resolveEffectiveScope(policy, requestedScopeId)
  if (scopeId !== 'all') {
    const scopeNode = Organizer.findNodeById(tree, scopeId)
    if (!scopeNode || scopeNode.url) {
      throw requestError('SCOPE_NOT_FOUND', 'The approved bookmark scope no longer exists.')
    }
  }

  return {
    tree,
    scopeId,
    bookmarks: Organizer.collectBookmarks(tree, { scopeId, excludeOrganizer: false }),
  }
}

function summarizeBookmarks(bookmarks) {
  const folderCounts = new Map()
  const hostCounts = new Map()

  for (const bookmark of bookmarks) {
    const folder = bookmark.folderPath || 'Unfiled'
    const host = Organizer.safeHostname(bookmark.url) || 'Unknown host'
    folderCounts.set(folder, (folderCounts.get(folder) || 0) + 1)
    hostCounts.set(host, (hostCounts.get(host) || 0) + 1)
  }

  const rank = (entries) => [...entries]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([name, count]) => ({ name, count }))

  return {
    totalBookmarks: bookmarks.length,
    topFolders: rank(folderCounts.entries()),
    topHosts: rank(hostCounts.entries()),
  }
}

async function handleSummary(params, policy) {
  const scope = await loadScope(policy, params?.scopeId)
  return { scopeId: scope.scopeId, ...summarizeBookmarks(scope.bookmarks) }
}

async function handleFolderList(params, policy) {
  const scope = await loadScope(policy, params?.scopeId)
  const options = Organizer.collectFolderOptions(scope.tree)
  const folders = policy.scopeId === 'all'
    ? options
    : options.filter((folder) => folder.id === policy.scopeId || folder.path.startsWith(`${options.find((item) => item.id === policy.scopeId)?.path || ''} / `))

  return {
    scopeId: scope.scopeId,
    folders: folders.slice(0, 500).map((folder) => ({
      id: folder.id,
      title: folder.title,
      path: folder.path,
    })),
    truncated: folders.length > 500,
  }
}

async function handleSearch(params, policy) {
  const scope = await loadScope(policy, params?.scopeId)
  const query = String(params?.query || '').trim().slice(0, 300)
  const limit = boundedInteger(params?.limit, 50, 1, 100)
  const offset = boundedInteger(params?.offset, 0, 0, 100_000)
  const ranked = query
    ? Organizer.selectQuestionContext(scope.bookmarks, query, scope.bookmarks.length)
    : scope.bookmarks
  const records = ranked.slice(offset, offset + limit).map(recordForAgent)

  return {
    scopeId: scope.scopeId,
    query,
    offset,
    limit,
    totalMatches: ranked.length,
    nextOffset: offset + records.length < ranked.length ? offset + records.length : null,
    bookmarks: records,
  }
}

async function handleDuplicates(params, policy) {
  const scope = await loadScope(policy, params?.scopeId)
  const limit = boundedInteger(params?.limit, 50, 1, 100)
  const groups = Organizer.findDuplicateGroups(scope.bookmarks)

  return {
    scopeId: scope.scopeId,
    totalGroups: groups.length,
    groups: groups.slice(0, limit).map((group) => ({
      canonicalUrl: group.normalizedUrl,
      keeper: recordForAgent(group.keeper),
      duplicates: group.duplicates.map(recordForAgent),
    })),
    truncated: groups.length > limit,
  }
}

async function handlePrepareOrganization(params, policy, client) {
  const assignments = Array.isArray(params?.assignments) ? params.assignments : []
  if (assignments.length === 0) {
    throw requestError('EMPTY_PLAN', 'At least one bookmark assignment is required.')
  }
  if (assignments.length > AgentCore.MAX_PLAN_ASSIGNMENTS) {
    throw requestError('PLAN_TOO_LARGE', `A plan can contain at most ${AgentCore.MAX_PLAN_ASSIGNMENTS} assignments.`)
  }

  const scope = await loadScope(policy, params?.scopeId)
  const destinationRootId = String(params?.destinationRootId || scope.scopeId)
  if (!destinationRootId || destinationRootId === 'all') {
    throw requestError('DESTINATION_REQUIRED', 'Choose an existing destination folder.')
  }
  if (policy.scopeId !== 'all' && destinationRootId !== policy.scopeId) {
    throw requestError('DESTINATION_NOT_ALLOWED', 'Restricted agent access can only organize inside its approved folder.')
  }

  const destination = Organizer.findNodeById(scope.tree, destinationRootId)
  if (!destination || destination.url) {
    throw requestError('DESTINATION_NOT_FOUND', 'The destination folder no longer exists.')
  }

  const bookmarkMap = new Map(scope.bookmarks.map((bookmark) => [bookmark.id, bookmark]))
  const uniqueAssignments = []
  const seen = new Set()

  for (const assignment of assignments) {
    const bookmarkId = String(assignment?.bookmarkId || '')
    if (!bookmarkId || seen.has(bookmarkId)) continue
    const bookmark = bookmarkMap.get(bookmarkId)
    if (!bookmark) {
      throw requestError('BOOKMARK_NOT_ALLOWED', `Bookmark ${bookmarkId} is outside the approved scope or no longer exists.`)
    }
    seen.add(bookmarkId)
    uniqueAssignments.push({
      bookmarkId,
      title: bookmark.title || bookmark.url,
      fromParentId: bookmark.parentId,
      category: Organizer.sanitizeCategory(assignment?.category),
    })
  }

  const categories = [...new Set(uniqueAssignments.map((assignment) => assignment.category))]
  if (categories.length > AgentCore.MAX_PLAN_CATEGORIES) {
    throw requestError('TOO_MANY_CATEGORIES', `A plan can contain at most ${AgentCore.MAX_PLAN_CATEGORIES} categories.`)
  }

  const createdAt = new Date()
  const plan = {
    version: BRIDGE_PROTOCOL_VERSION,
    id: crypto.randomUUID(),
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(createdAt.getTime() + AgentCore.PLAN_TTL_MS).toISOString(),
    client,
    scopeId: scope.scopeId,
    destinationRootId,
    destinationTitle: destination.title,
    assignments: uniqueAssignments,
  }
  await Organizer.writeStorage(AgentCore.PLAN_STORAGE_KEY, plan)

  return {
    planId: plan.id,
    expiresAt: plan.expiresAt,
    destination: { id: destinationRootId, title: destination.title },
    assignmentCount: uniqueAssignments.length,
    categories: categories.map((category) => ({
      name: category,
      count: uniqueAssignments.filter((assignment) => assignment.category === category).length,
    })),
    preview: uniqueAssignments.slice(0, 50),
    previewTruncated: uniqueAssignments.length > 50,
    message: 'Plan prepared. No bookmarks have moved.',
  }
}

async function getBookmarkById(id) {
  const bookmarks = await chromeCall(chrome.bookmarks, 'get', id)
  return bookmarks?.[0] || null
}

function assertPreparedPlanAccess(plan, policy, client) {
  const authorization = AgentCore.authorizePreparedArtifact(policy, client, plan)
  if (!authorization.ok) throw requestError(authorization.code, authorization.message)
}

async function handleApplyPlan(params, policy, client) {
  const plan = await Organizer.readStorage(AgentCore.PLAN_STORAGE_KEY)
  const planId = String(params?.planId || '')
  if (!plan || plan.id !== planId) {
    throw requestError('PLAN_NOT_FOUND', 'The requested organization plan is no longer available.')
  }
  if (Date.parse(plan.expiresAt) <= Date.now()) {
    await Organizer.removeStorage(AgentCore.PLAN_STORAGE_KEY)
    throw requestError('PLAN_EXPIRED', 'The organization plan expired. Prepare a fresh plan before applying it.')
  }
  assertPreparedPlanAccess(plan, policy, client)

  const folders = new Map()
  const entries = []
  const skipped = []

  for (const assignment of plan.assignments) {
    const current = await getBookmarkById(assignment.bookmarkId)
    if (!current || current.parentId !== assignment.fromParentId) {
      skipped.push({ bookmarkId: assignment.bookmarkId, reason: 'Bookmark changed after the plan was prepared.' })
      continue
    }

    let folder = folders.get(assignment.category)
    if (!folder) {
      folder = await Organizer.findOrCreateFolder(plan.destinationRootId, assignment.category)
      folders.set(assignment.category, folder)
    }
    await Organizer.moveBookmark(assignment.bookmarkId, { parentId: folder.id })
    entries.push({
      bookmarkId: assignment.bookmarkId,
      title: assignment.title,
      fromParentId: assignment.fromParentId,
      toParentId: folder.id,
      category: assignment.category,
    })
  }

  const history = {
    id: crypto.randomUUID(),
    planId: plan.id,
    appliedAt: new Date().toISOString(),
    client: plan.client,
    scopeId: plan.scopeId,
    destinationRootId: plan.destinationRootId,
    entries,
  }
  await Organizer.writeStorage(AgentCore.APPLY_HISTORY_STORAGE_KEY, history)
  await Organizer.removeStorage(AgentCore.PLAN_STORAGE_KEY)

  return {
    transactionId: history.id,
    moved: entries.length,
    skipped,
    undoAvailable: entries.length > 0,
  }
}

async function handleUndo(policy, client) {
  const history = await Organizer.readStorage(AgentCore.APPLY_HISTORY_STORAGE_KEY)
  if (!history?.entries?.length) {
    throw requestError('UNDO_NOT_AVAILABLE', 'There is no agent-applied bookmark transaction to undo.')
  }
  assertPreparedPlanAccess(history, policy, client)

  const restored = []
  const skipped = []
  for (const entry of history.entries) {
    const current = await getBookmarkById(entry.bookmarkId)
    if (!current || current.parentId !== entry.toParentId) {
      skipped.push({ bookmarkId: entry.bookmarkId, reason: 'Bookmark changed after the agent transaction.' })
      continue
    }
    await Organizer.moveBookmark(entry.bookmarkId, { parentId: entry.fromParentId })
    restored.push(entry.bookmarkId)
  }

  await Organizer.removeStorage(AgentCore.APPLY_HISTORY_STORAGE_KEY)
  return { transactionId: history.id, restored: restored.length, skipped }
}

async function dispatchRequest(request, authorization) {
  const params = request?.params && typeof request.params === 'object' ? request.params : {}
  switch (request.method) {
    case 'system.status':
      return {
        protocolVersion: BRIDGE_PROTOCOL_VERSION,
        policy: authorization.policy,
        connection: connectionState,
        supportedMethods: AgentCore.SUPPORTED_METHODS,
      }
    case 'bookmarks.summary':
      return handleSummary(params, authorization.policy)
    case 'bookmarks.list_folders':
      return handleFolderList(params, authorization.policy)
    case 'bookmarks.search':
      return handleSearch(params, authorization.policy)
    case 'bookmarks.find_duplicates':
      return handleDuplicates(params, authorization.policy)
    case 'bookmarks.prepare_organization':
      return handlePrepareOrganization(params, authorization.policy, authorization.client)
    case 'bookmarks.apply_plan':
      return handleApplyPlan(params, authorization.policy, authorization.client)
    case 'bookmarks.undo':
      return handleUndo(authorization.policy, authorization.client)
    default:
      throw requestError('METHOD_NOT_ALLOWED', 'Unsupported bookmark agent method.')
  }
}

async function handleNativeRequest(request) {
  try {
    const policy = await readPolicy()
    const authorization = AgentCore.authorizeRequest(policy, request)
    if (!authorization.ok) throw requestError(authorization.code, authorization.message)
    const result = await dispatchRequest(request, authorization)
    return successResponse(request, result)
  } catch (error) {
    return errorResponse(request, error)
  }
}

function processNativeRequest(request) {
  const serialized = [
    'bookmarks.prepare_organization',
    ...AgentCore.MUTATION_METHODS,
  ].includes(request?.method)
  if (!serialized) return handleNativeRequest(request)

  const work = mutationQueue.then(() => handleNativeRequest(request))
  mutationQueue = work.catch(() => undefined)
  return work
}

chrome.runtime.onInstalled.addListener(() => {
  void readPolicy().then((policy) => Organizer.writeStorage(AgentCore.POLICY_STORAGE_KEY, policy))
})

chrome.runtime.onStartup.addListener(() => {
  void connectNative({ retry: true })
})

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local' || !changes[AgentCore.POLICY_STORAGE_KEY]) return
  const policy = AgentCore.normalizePolicy(changes[AgentCore.POLICY_STORAGE_KEY].newValue)
  if (policy.enabled) void connectNative({ retry: true })
  else disconnectNative()
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'agent-access:status') {
    void Promise.all([readPolicy(), hasNativePermission()]).then(([policy, permissionGranted]) => {
      sendResponse({ policy, permissionGranted, connection: connectionState })
    })
    return true
  }

  if (message?.type === 'agent-access:connect') {
    void connectNative({ retry: false }).then(() => sendResponse({ connection: connectionState }))
    return true
  }

  if (message?.type === 'agent-access:disconnect') {
    disconnectNative()
    sendResponse({ connection: connectionState })
  }

  return false
})

void connectNative({ retry: false })
