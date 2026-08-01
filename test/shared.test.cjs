'use strict'

const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')

const Organizer = require('../shared.js')
const AgentCore = require('../agent-core.js')
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'bookmarks-small.json'), 'utf8'),
)

test('sanitizes category names into safe three-word folder names', () => {
  assert.equal(Organizer.sanitizeCategory('  ai_tools / research!!!  '), 'AI Tools Research')
  assert.equal(Organizer.sanitizeCategory('<script>delete all</script>'), 'Script Delete All')
  assert.equal(Organizer.sanitizeCategory(''), Organizer.FALLBACK_CATEGORY)
})

test('keeps the complete category plan within the requested maximum', () => {
  assert.deepEqual(
    Organizer.uniqueCategories(
      ['Research', 'Design', 'Finance', 'Learning', 'Research', 'Uncategorized'],
      4,
    ),
    ['Research', 'Design', 'Finance', 'Uncategorized'],
  )
})

test('parses fenced and embedded JSON responses', () => {
  assert.deepEqual(Organizer.parseJsonResponse('```json\n["Design","Research"]\n```'), [
    'Design',
    'Research',
  ])
  assert.deepEqual(Organizer.parseJsonResponse('Result: {"categories":["Finance"]} done'), {
    categories: ['Finance'],
  })
})

test('collects an explicit scope and excludes the organizer folder by default', () => {
  const all = Organizer.collectBookmarks(fixture)
  assert.deepEqual(
    all.map((bookmark) => bookmark.id),
    ['101', '102', '201'],
  )

  const research = Organizer.collectBookmarks(fixture, { scopeId: '10' })
  assert.equal(research.length, 2)
  assert.equal(research[0].folderPath, 'Research')

  const includingOrganizer = Organizer.collectBookmarks(fixture, {
    scopeId: 'all',
    excludeOrganizer: false,
  })
  assert.equal(includingOrganizer.length, 4)
})

test('uses deterministic fallback categories and preserves assignment order', () => {
  const bookmarks = Organizer.collectBookmarks(fixture, { scopeId: '10' })
  const categories = ['AI & Technology', 'Research', 'Uncategorized']
  assert.equal(Organizer.fallbackCategory(bookmarks[0], categories), 'Research')

  const assignments = Organizer.parseAssignments(
    '[{"index":2,"category":"AI & Technology","reason":"Developer metadata"}]',
    bookmarks,
    categories,
  )
  assert.equal(assignments.length, 2)
  assert.equal(assignments[0].id, '101')
  assert.equal(assignments[0].category, 'Research')
  assert.equal(assignments[1].id, '102')
  assert.equal(assignments[1].category, 'AI & Technology')
  assert.equal(assignments[1].selected, true)
})

test('ranks deterministic fallback categories from the selected collection', () => {
  const bookmarks = Organizer.collectBookmarks(fixture, {
    scopeId: 'all',
    excludeOrganizer: false,
  })
  const plan = Organizer.buildFallbackCategoryPlan(bookmarks, 4)
  assert.equal(plan.length, 4)
  assert.equal(plan.at(-1), Organizer.FALLBACK_CATEGORY)
  assert.ok(plan.includes('Research'))
  assert.ok(plan.includes('Design'))
})

test('selects relevant metadata context and counts categories', () => {
  const bookmarks = Organizer.collectBookmarks(fixture, {
    scopeId: 'all',
    excludeOrganizer: false,
  }).map((bookmark) => ({
    ...bookmark,
    category: bookmark.id === '201' ? 'Design' : 'Research',
  }))

  const context = Organizer.selectQuestionContext(bookmarks, 'Which design resources use Figma?', 2)
  assert.equal(context[0].id, '201')
  assert.deepEqual(Organizer.categoryCounts(bookmarks), [
    { category: 'Research', count: 3 },
    { category: 'Design', count: 1 },
  ])
})

test('finds only safe canonical URL duplicates', () => {
  const bookmarks = [
    { id: '1', title: 'Perplexity', url: 'https://www.perplexity.ai/' },
    {
      id: '2',
      title: 'Perplexity login link',
      url: 'https://perplexity.ai/?login-source=oneTapHome&login-new=false',
    },
    {
      id: '3',
      title: 'Perplexity campaign link',
      url: 'https://perplexity.ai/?utm_source=newsletter',
    },
    {
      id: '4',
      title: 'NVIDIA catalog',
      url: 'https://catalog.ngc.nvidia.com/?orderBy=weightPopularDESC',
    },
    {
      id: '5',
      title: 'NVIDIA pose results',
      url: 'https://catalog.ngc.nvidia.com/?orderBy=scoreDESC&query=pose',
    },
  ]

  assert.equal(
    Organizer.normalizeDuplicateUrl(bookmarks[0].url),
    Organizer.normalizeDuplicateUrl(bookmarks[1].url),
  )
  assert.notEqual(
    Organizer.normalizeDuplicateUrl(bookmarks[3].url),
    Organizer.normalizeDuplicateUrl(bookmarks[4].url),
  )

  const groups = Organizer.findDuplicateGroups(bookmarks)
  assert.equal(groups.length, 1)
  assert.equal(groups[0].keeper.id, '1')
  assert.deepEqual(groups[0].duplicates.map((bookmark) => bookmark.id), ['3', '2'])
})

test('question prompts disclose truncated scope and include follow-up context', () => {
  const bookmark = Organizer.collectBookmarks(fixture, { scopeId: '10' })[0]
  const prompt = Organizer.buildQuestionPrompt('Is that all of them?', [bookmark], {
    totalBookmarks: 42,
    conversation: [{ role: 'user', text: 'Which VC firms do I have bookmarked?' }],
  })

  assert.match(prompt, /42 bookmarks; 1 candidate record/)
  assert.match(prompt, /Do not describe it as an exhaustive list/)
  assert.match(prompt, /Which VC firms do I have bookmarked/)
})

test('classifies bookmark chat requests without giving the model mutation authority', () => {
  assert.deepEqual(
    Organizer.classifyBookmarkRequest('Please organize my bookmarks by company function'),
    {
      type: 'organization_plan',
      instruction: 'Please organize my bookmarks by company function',
    },
  )
  assert.equal(
    Organizer.classifyBookmarkRequest('Can you clean up duplicate links?').type,
    'duplicate_review',
  )
  assert.equal(
    Organizer.classifyBookmarkRequest('Which categories are represented?').type,
    'question',
  )
  assert.equal(
    Organizer.classifyBookmarkRequest('Should I reorganize my bookmarks?').type,
    'question',
  )
})

test('uses the previous user turn to retrieve context for genuine follow-up questions', () => {
  const conversation = [
    { role: 'user', text: 'Which VC firms do I have bookmarked?' },
    { role: 'assistant', text: 'I found several venture firms.' },
  ]

  assert.equal(
    Organizer.contextualizeBookmarkQuestion('Is this all of them?', conversation),
    'Which VC firms do I have bookmarked?\nFollow-up: Is this all of them?',
  )
  assert.equal(
    Organizer.contextualizeBookmarkQuestion('What NVIDIA tools did I save?', conversation),
    'What NVIDIA tools did I save?',
  )
})

test('derives short, stable conversation titles from the first user message', () => {
  assert.equal(
    Organizer.deriveChatThreadTitle('  Which   VC firms did I save?  '),
    'Which VC firms did I save?',
  )
  assert.equal(Organizer.deriveChatThreadTitle(''), 'New conversation')
  assert.equal(Organizer.deriveChatThreadTitle('A'.repeat(70)).length, 48)
  assert.match(Organizer.deriveChatThreadTitle('A'.repeat(70)), /…$/)
})

test('ships bounded, local multi-conversation chat history controls', () => {
  const workspaceHtml = readFileSync(join(__dirname, '..', 'workspace.html'), 'utf8')
  const workspaceScript = readFileSync(join(__dirname, '..', 'workspace.js'), 'utf8')

  assert.match(workspaceHtml, /id="newChatButton"/)
  assert.match(workspaceHtml, /id="chatHistoryList"/)
  assert.match(workspaceScript, /const CHAT_THREAD_LIMIT = 12/)
  assert.match(workspaceScript, /restoreChatThreads\(savedChatThreads, savedChat\)/)
  assert.match(workspaceScript, /Organizer\.CHAT_THREADS_STORAGE_KEY/)
  assert.equal(Organizer.CHAT_THREADS_STORAGE_KEY, 'organizerWorkspaceChatThreadsV1')
})

test('keeps the toolbar popup compact and guards against horizontal overflow', () => {
  const popupStyles = readFileSync(join(__dirname, '..', 'popup.css'), 'utf8')

  assert.match(popupStyles, /html,\s*body\s*{[^}]*width:\s*380px;/s)
  assert.match(popupStyles, /html,\s*body\s*{[^}]*min-height:\s*580px;/s)
  assert.match(popupStyles, /html,\s*body\s*{[^}]*overflow-x:\s*hidden;/s)
  assert.match(popupStyles, /html,\s*body\s*{[^}]*scrollbar-width:\s*none;/s)
  assert.match(popupStyles, /body::\-webkit-scrollbar\s*{[^}]*display:\s*none;/s)
  assert.match(popupStyles, /\.app-shell\s*{[^}]*width:\s*100%;/s)
  assert.match(popupStyles, /\.app-shell\s*>\s*\*\s*{[^}]*width:\s*100%;/s)
})

test('presents current-page capture as the primary popup workflow', () => {
  const popupHtml = readFileSync(join(__dirname, '..', 'popup.html'), 'utf8')

  assert.match(popupHtml, /Save this page/)
  assert.match(popupHtml, /id="activePageUrl"/)
  assert.match(popupHtml, /id="filingSummary"/)
  assert.match(popupHtml, />\s*Save bookmark\s*</)
  assert.match(popupHtml, /aria-current="page">Save/)
  assert.match(popupHtml, />Organize</)
  assert.match(popupHtml, />Ask</)
  assert.doesNotMatch(popupHtml, /company-word|product-crumb|workspace-link-primary/)
})

test('ships one-click FTUE presets for discovery, cleanup, and organization', () => {
  const workspaceHtml = readFileSync(join(__dirname, '..', 'workspace.html'), 'utf8')
  const workspaceScript = readFileSync(join(__dirname, '..', 'workspace.js'), 'utf8')
  const presetQuestions = [
    ...workspaceHtml.matchAll(/<button\b[^>]*data-question="([^"]+)"/g),
  ].map((match) => match[1])

  assert.ok(presetQuestions.length >= 8)
  assert.ok(
    presetQuestions.some(
      (question) => Organizer.classifyBookmarkRequest(question).type === 'duplicate_review',
    ),
  )
  assert.ok(
    presetQuestions.some(
      (question) => Organizer.classifyBookmarkRequest(question).type === 'organization_plan',
    ),
  )
  assert.ok(
    presetQuestions.some(
      (question) => Organizer.classifyBookmarkRequest(question).type === 'question',
    ),
  )
  assert.match(workspaceScript, /void askBookmarks\(\)/)
})

test('marks bookmark metadata as untrusted in every AI prompt', () => {
  const bookmark = Organizer.collectBookmarks(fixture, { scopeId: '10' })[1]
  assert.match(Organizer.buildInstructionDraftPrompt([bookmark], 8), /untrusted data/i)
  assert.match(Organizer.buildPlanningPrompt([bookmark], '', 6), /untrusted data/i)
  assert.match(
    Organizer.buildAssignmentPrompt([bookmark], ['Research', 'Uncategorized'], ''),
    /untrusted data/i,
  )
  assert.match(Organizer.buildQuestionPrompt('What did I save?', [bookmark]), /untrusted data/i)
})

test('ships organizer instruction presets and a scope-grounded draft control', () => {
  const workspaceHtml = readFileSync(join(__dirname, '..', 'workspace.html'), 'utf8')
  const workspaceStyles = readFileSync(join(__dirname, '..', 'workspace.css'), 'utf8')
  const presets = workspaceHtml.match(/data-organizer-instruction=/g) || []

  assert.ok(presets.length >= 4)
  assert.match(workspaceHtml, /id="draftInstructionButton"/)
  assert.match(workspaceStyles, /#organizeView\s*{[^}]*max-width:\s*820px;/s)
})

test('uses a compact task-first workspace shell for organize and ask', () => {
  const workspaceHtml = readFileSync(join(__dirname, '..', 'workspace.html'), 'utf8')
  const workspaceStyles = readFileSync(join(__dirname, '..', 'workspace.css'), 'utf8')

  assert.match(workspaceHtml, /class="workspace-tabs"/)
  assert.match(workspaceHtml, />\s*Organize\s*</)
  assert.match(workspaceHtml, />\s*Ask\s*</)
  assert.doesNotMatch(workspaceHtml, /class="sidebar"|Your bookmarks, made legible/)
  assert.match(workspaceStyles, /#organizeView\s*{[^}]*max-width:\s*820px;/s)
  assert.match(workspaceStyles, /#askView\s*{[^}]*max-width:\s*980px;/s)
})

test('keeps bookmark agent access local, scoped, and read-only by default', () => {
  assert.deepEqual(AgentCore.normalizePolicy(null), {
    enabled: false,
    accessMode: 'read-only',
    scopeId: 'all',
    externalProviders: [],
    externalConsentVersion: 0,
    updatedAt: null,
  })

  assert.equal(
    AgentCore.authorizeRequest(null, {
      method: 'bookmarks.summary',
      client: { provider: 'local', processing: 'local' },
    }).code,
    'AGENT_ACCESS_DISABLED',
  )

  const enabled = { enabled: true, accessMode: 'read-only', scopeId: '20' }
  assert.equal(
    AgentCore.authorizeRequest(enabled, {
      method: 'bookmarks.summary',
      client: { provider: 'local', processing: 'local' },
    }).ok,
    true,
  )
  assert.equal(
    AgentCore.authorizeRequest(enabled, {
      method: 'bookmarks.apply_plan',
      client: { provider: 'local', processing: 'local' },
    }).code,
    'WRITE_ACCESS_DISABLED',
  )
})

test('requires current provider-specific consent before external bookmark processing', () => {
  const basePolicy = { enabled: true, accessMode: 'reviewed' }
  const codexRequest = {
    method: 'bookmarks.summary',
    client: { name: 'Codex', provider: 'codex', processing: 'external' },
  }

  assert.equal(
    AgentCore.authorizeRequest(basePolicy, codexRequest).code,
    'EXTERNAL_PROVIDER_NOT_ALLOWED',
  )
  assert.equal(
    AgentCore.authorizeRequest(
      {
        ...basePolicy,
        externalProviders: ['codex'],
        externalConsentVersion: AgentCore.EXTERNAL_CONSENT_VERSION,
      },
      codexRequest,
    ).ok,
    true,
  )
  assert.equal(
    AgentCore.authorizeRequest(
      {
        ...basePolicy,
        externalProviders: ['claude'],
        externalConsentVersion: AgentCore.EXTERNAL_CONSENT_VERSION,
      },
      codexRequest,
    ).code,
    'EXTERNAL_PROVIDER_NOT_ALLOWED',
  )
})

test('binds prepared agent plans to the approved client and current folder scope', () => {
  const policy = {
    enabled: true,
    accessMode: 'reviewed',
    scopeId: 'folder-7',
  }
  const client = { name: 'Codex', provider: 'codex', processing: 'external' }
  const plan = {
    client,
    scopeId: 'folder-7',
    destinationRootId: 'folder-7',
  }

  assert.equal(AgentCore.authorizePreparedArtifact(policy, client, plan).ok, true)
  assert.equal(
    AgentCore.authorizePreparedArtifact(policy, { ...client, name: 'Claude' }, plan).code,
    'PLAN_CLIENT_MISMATCH',
  )
  assert.equal(
    AgentCore.authorizePreparedArtifact({ ...policy, scopeId: 'folder-8' }, client, plan).code,
    'PLAN_SCOPE_CHANGED',
  )
})

test('ships explicit in-product external data disclosure and optional native access', () => {
  const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'manifest.json'), 'utf8'))
  const settingsHtml = readFileSync(join(__dirname, '..', 'settings.html'), 'utf8')

  assert.deepEqual(manifest.optional_permissions, ['nativeMessaging'])
  assert.equal(manifest.background.service_worker, 'service-worker.js')
  assert.match(settingsHtml, /External AI processing/)
  assert.match(settingsHtml, /bookmark titles, URLs, folder paths/)
  assert.match(settingsHtml, /I understand what data may be shared/)
  assert.match(settingsHtml, /Enable Agent Access/)
})

test('uses the expected Chrome callback API contracts', async () => {
  const storage = {}
  const children = [{ id: 'existing', title: 'Research' }]
  const calls = []

  global.chrome = {
    runtime: { lastError: null },
    storage: {
      local: {
        get(key, callback) {
          calls.push(['storage.get', key])
          callback({ [key]: storage[key] })
        },
        set(value, callback) {
          calls.push(['storage.set', value])
          Object.assign(storage, value)
          callback()
        },
        remove(key, callback) {
          calls.push(['storage.remove', key])
          delete storage[key]
          callback()
        },
      },
    },
    bookmarks: {
      getChildren(parentId, callback) {
        calls.push(['bookmarks.getChildren', parentId])
        callback(children)
      },
      create(details, callback) {
        calls.push(['bookmarks.create', details])
        callback({ id: 'created', ...details })
      },
      move(id, destination, callback) {
        calls.push(['bookmarks.move', id, destination])
        callback({ id, ...destination })
      },
      search(query, callback) {
        calls.push(['bookmarks.search', query])
        callback([])
      },
    },
    tabs: {
      query(query, callback) {
        calls.push(['tabs.query', query])
        callback([{ id: 4, title: 'QA page', url: 'https://example.com/' }])
      },
    },
  }

  await Organizer.writeStorage('job', { status: 'paused' })
  assert.deepEqual(await Organizer.readStorage('job'), { status: 'paused' })
  await Organizer.removeStorage('job')
  assert.equal(await Organizer.readStorage('job'), undefined)

  assert.equal((await Organizer.findOrCreateFolder('2', 'Research')).id, 'existing')
  assert.equal((await Organizer.findOrCreateFolder('2', 'Design')).id, 'created')
  assert.equal(
    (await Organizer.createBookmark({
      parentId: '2',
      title: 'QA page',
      url: 'https://example.com/',
    })).id,
    'created',
  )
  assert.equal((await Organizer.moveBookmark('101', { parentId: '2' })).parentId, '2')
  assert.deepEqual(await Organizer.searchBookmarks({ url: 'https://example.com/' }), [])
  assert.equal((await Organizer.queryTabs({ active: true, currentWindow: true }))[0].id, 4)

  assert.ok(calls.some(([name]) => name === 'bookmarks.create'))
  assert.ok(calls.some(([name]) => name === 'bookmarks.move'))
  delete global.chrome
})
