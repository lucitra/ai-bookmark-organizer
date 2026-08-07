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

test('sanitizes two-level category paths without flattening their hierarchy', () => {
  assert.equal(
    Organizer.sanitizeCategoryPath('Technology > AI infrastructure / ignored'),
    'Technology › AI Infrastructure',
  )
  assert.deepEqual(Organizer.splitCategoryPath('Business › Venture Capital'), [
    'Business',
    'Venture Capital',
  ])
})

test('keeps the complete category plan within the requested maximum', () => {
  assert.deepEqual(
    Organizer.uniqueCategories(
      ['Research', 'Design', 'Finance', 'Learning', 'Research', 'Uncategorized'],
      4,
    ),
    ['Research', 'Design', 'Finance', 'Learning'],
  )
})

test('recommends more leaf folders as collection size grows', () => {
  assert.equal(Organizer.recommendedCategoryLimit(20), 6)
  assert.equal(Organizer.recommendedCategoryLimit(1104), 32)
  assert.equal(Organizer.recommendedCategoryLimit(3000), 40)
})

test('uses a two-level deterministic plan for large collections', () => {
  const bookmark = Organizer.collectBookmarks(fixture, { scopeId: '10' })[0]
  const plan = Organizer.buildFallbackCategoryPlan(Array(500).fill(bookmark), 24)

  assert.ok(plan.length >= 18)
  assert.ok(plan.length <= 24)
  assert.ok(plan.some((category) => category.includes(Organizer.CATEGORY_SEPARATOR)))
  assert.ok(!plan.includes(Organizer.FALLBACK_CATEGORY))
})

test('counts hierarchical category paths without flattening their display keys', () => {
  assert.deepEqual(
    Organizer.categoryCounts([
      { category: 'Technology › AI Tools' },
      { category: 'Technology > AI Tools' },
      { category: 'Knowledge › Research' },
    ]),
    [
      { category: 'Technology › AI Tools', count: 2 },
      { category: 'Knowledge › Research', count: 1 },
    ],
  )
})

test('flags oversized and tiny folders in a completed organization plan', () => {
  const suggestions = [
    ...Array.from({ length: 230 }, (_, id) => ({ id: `dev-${id}`, category: 'Technology › Developer Resources' })),
    ...Array.from({ length: 140 }, (_, id) => ({ id: `company-${id}`, category: 'Business › Companies' })),
    ...Array.from({ length: 4 }, (_, id) => ({ id: `hardware-${id}`, category: 'Technology › Hardware Systems' })),
    { id: 'biotech-1', category: 'Health › Biotech' },
  ]
  const health = Organizer.analyzeCategoryHealth(suggestions)

  assert.equal(health.total, 375)
  assert.equal(health.broadThreshold, 120)
  assert.deepEqual(health.broad.map((item) => item.category), [
    'Technology › Developer Resources',
    'Business › Companies',
  ])
  assert.deepEqual(health.tiny.map((item) => item.category), [
    'Technology › Hardware Systems',
    'Health › Biotech',
  ])
})

test('provides bounded refinements and useful tiny-folder merge targets', () => {
  assert.deepEqual(
    Organizer.categoryRefinementOptions('Technology › Developer Resources'),
    [
      'Technology › Developer Docs',
      'Technology › APIs SDKs',
      'Technology › Web Development',
      'Technology › Cloud DevOps',
      'Technology › Open Source',
      'Technology › General Development',
    ],
  )
  assert.ok(
    [
      ...Organizer.categoryRefinementOptions('Technology › Developer Resources'),
      ...Organizer.categoryRefinementOptions('Finance › Venture Firms'),
    ]
      .every((category) => Organizer.sanitizeCategoryPath(category) === category),
  )

  const suggestions = [
    ...Array.from({ length: 30 }, (_, id) => ({ id: `infra-${id}`, category: 'Technology › AI Infrastructure' })),
    ...Array.from({ length: 20 }, (_, id) => ({ id: `health-${id}`, category: 'Health › Healthcare' })),
    ...Array.from({ length: 8 }, (_, id) => ({ id: `ops-${id}`, category: 'Business › Operations' })),
    ...Array.from({ length: 4 }, (_, id) => ({ id: `hardware-${id}`, category: 'Technology › Hardware Systems' })),
    ...Array.from({ length: 3 }, (_, id) => ({ id: `flow-${id}`, category: 'Productivity › Workflows' })),
    { id: 'biotech-1', category: 'Health › Biotech' },
  ]

  assert.deepEqual(Organizer.recommendTinyCategoryMerges(suggestions, { tinyThreshold: 4 }), [
    { from: 'Technology › Hardware Systems', to: 'Technology › AI Infrastructure', count: 4 },
    { from: 'Productivity › Workflows', to: 'Business › Operations', count: 3 },
    { from: 'Health › Biotech', to: 'Health › Healthcare', count: 1 },
  ])
})

test('supplements undersized AI plans for large collections without duplicate leaves', () => {
  const bookmark = Organizer.collectBookmarks(fixture, { scopeId: '10' })[0]
  const plan = Organizer.parseCategoryPlan(
    '["AI Tools","Venture Capital","Research","Learning"]',
    24,
    Array(500).fill(bookmark),
  )

  assert.ok(plan.length >= 18)
  assert.ok(plan.length <= 24)
  assert.equal(
    new Set(plan.map((category) => Organizer.splitCategoryPath(category).at(-1))).size,
    plan.length,
  )
  assert.ok(!plan.includes(Organizer.FALLBACK_CATEGORY))
})

test('prefers specific metadata over a broad existing folder path', () => {
  const categories = Organizer.buildFallbackCategoryPlan([], 24)

  assert.equal(
    Organizer.fallbackCategory(
      {
        title: 'ROCm software developer documentation',
        url: 'https://amd.com/rocm/docs',
        folderPath: 'Bookmarks Bar / Tools / AI',
      },
      categories,
    ),
    'Technology › Developer Resources',
  )
  assert.equal(
    Organizer.fallbackCategory(
      {
        title: 'Fenwick startup law firm',
        url: 'https://fenwick.com/',
        folderPath: 'Bookmarks Bar / Companies / VC',
      },
      categories,
    ),
    'Business › Professional Services',
  )
  assert.equal(
    Organizer.fallbackCategory(
      {
        title: 'Optical Interconnect for Generative AI Infrastructure',
        url: 'https://ayarlabs.com/',
        folderPath: 'Bookmarks Bar / Tools / AI',
      },
      categories,
    ),
    'Technology › Hardware Systems',
  )
  assert.equal(
    Organizer.fallbackCategory(
      {
        title: 'Hugging Face – The AI community building the future',
        url: 'https://huggingface.co/',
        folderPath: 'Bookmarks Bar / Tools / AI',
      },
      categories,
    ),
    'Technology › Model Platforms',
  )
  assert.equal(
    Organizer.fallbackCategory(
      {
        title: 'Pear VC – pre-seed and seed investors',
        url: 'https://pear.vc/',
        folderPath: 'Bookmarks Bar / Companies / VC',
      },
      categories,
    ),
    'Finance › Seed Investors',
  )
  assert.equal(
    Organizer.fallbackCategory(
      {
        title: 'Visible investor relationship hub',
        url: 'https://visible.vc/',
        folderPath: 'Bookmarks Bar / Companies / VC',
      },
      categories,
    ),
    'Finance › Investor Tools',
  )
})

test('expands broad AI and venture leaves before assigning a large collection', () => {
  const bookmark = Organizer.collectBookmarks(fixture, { scopeId: '10' })[0]
  const plan = Organizer.parseCategoryPlan(
    '["Technology › AI Tools","Finance › Venture Capital","Knowledge › Research","Knowledge › Learning"]',
    32,
    Array(1000).fill(bookmark),
  )

  assert.ok(!plan.includes('Technology › AI Tools'))
  assert.ok(!plan.includes('Finance › Venture Capital'))
  assert.ok(plan.includes('Technology › Model Platforms'))
  assert.ok(plan.includes('Technology › AI Assistants'))
  assert.ok(plan.includes('Finance › Venture Firms'))
  assert.ok(plan.includes('Finance › Investor Tools'))
  assert.ok(plan.includes('General Reference'))
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

test('defaults new organization plans to the Bookmarks Bar', () => {
  const withoutOrganizer = JSON.parse(JSON.stringify(fixture))
  withoutOrganizer[0].children[1].children = withoutOrganizer[0].children[1].children.filter(
    (node) => node.title !== Organizer.ORGANIZER_FOLDER_NAME,
  )
  const destination = Organizer.getDefaultDestinationRoot(withoutOrganizer)
  assert.equal(destination.id, '1')
  assert.match(destination.title, /bookmarks? bar/i)
})

test('reuses the root containing an existing organized library', () => {
  const locations = Organizer.findOrganizerFolders(fixture)
  const destination = Organizer.getDefaultDestinationRoot(fixture)

  assert.equal(locations.length, 1)
  assert.equal(locations[0].parentId, '2')
  assert.equal(locations[0].bookmarkCount, 1)
  assert.equal(destination.id, '2')
})

test('uses deterministic fallback categories and preserves assignment order', () => {
  const bookmarks = Organizer.collectBookmarks(fixture, { scopeId: '10' })
  const categories = ['AI & Technology', 'Research', 'General Reference']
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
  assert.equal(plan.at(-1), 'General Reference')
  assert.ok(!plan.includes(Organizer.FALLBACK_CATEGORY))
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
    Organizer.classifyBookmarkRequest('How many bookmarks do I have?').type,
    'bookmark_count',
  )
  assert.equal(
    Organizer.classifyBookmarkRequest('What is my bookmark count?').type,
    'bookmark_count',
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

test('counts every bookmark in scope and summarizes its top-level locations', () => {
  const bookmarks = Organizer.collectBookmarks(fixture, {
    scopeId: 'all',
    excludeOrganizer: false,
  })
  const summary = Organizer.summarizeBookmarkLocations(bookmarks)

  assert.equal(summary.total, 4)
  assert.deepEqual(summary.locations, [
    { location: 'Bookmarks bar', count: 2 },
    { location: 'Other bookmarks', count: 2 },
  ])
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

test('presents duplicate cleanup as grouped keeper review instead of organization', () => {
  const workspaceHtml = readFileSync(join(__dirname, '..', 'workspace.html'), 'utf8')
  const workspaceScript = readFileSync(join(__dirname, '..', 'workspace.js'), 'utf8')
  const workspaceStyles = readFileSync(join(__dirname, '..', 'workspace.css'), 'utf8')

  assert.match(workspaceHtml, /id="duplicateReviewButton"/)
  assert.match(workspaceHtml, /id="selectAllLabel"/)
  assert.match(workspaceScript, /mode: 'duplicate_review'/)
  assert.match(workspaceScript, /group\.bookmarks\.map/)
  assert.match(workspaceScript, /duplicateKeeperId: group\.keeper\.id/)
  assert.match(workspaceScript, /Keep this copy instead/)
  assert.match(workspaceScript, /async function startDuplicateReview\(\)/)
  assert.match(workspaceScript, /async function exitDuplicateReview\(\)/)
  assert.match(workspaceScript, /Back to organize/)
  assert.match(workspaceScript, /The keeper in each matching group stays in its current folder/)
  assert.match(workspaceScript, /Nothing is deleted/)
  assert.match(workspaceStyles, /\.workspace-view\.is-duplicate-review \.instruction-starters/)
  assert.match(workspaceStyles, /\.duplicate-group/)
  assert.match(workspaceStyles, /\.duplicate-copy\.is-keeper/)
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

test('never offers Uncategorized to the assignment model', () => {
  const bookmark = Organizer.collectBookmarks(fixture, { scopeId: '10' })[0]
  const prompt = Organizer.buildAssignmentPrompt(
    [bookmark],
    ['Research › AI Papers', 'General Reference'],
    '',
  )

  assert.match(prompt, /Never return Uncategorized/)
  assert.doesNotMatch(prompt, /Allowed categories:.*Uncategorized/)
})

test('requests two-level leaf folders for large collections', () => {
  const bookmark = Organizer.collectBookmarks(fixture, { scopeId: '10' })[0]
  const prompt = Organizer.buildPlanningPrompt(Array(500).fill(bookmark), '', 24)

  assert.match(prompt, /between 18 and 24 reusable leaf folder paths/)
  assert.match(prompt, /Parent › Child/)
  assert.ok((prompt.match(/^\d+\./gm) || []).length <= 72)
})

test('ships organizer instruction presets and a scope-grounded draft control', () => {
  const workspaceHtml = readFileSync(join(__dirname, '..', 'workspace.html'), 'utf8')
  const workspaceStyles = readFileSync(join(__dirname, '..', 'workspace.css'), 'utf8')
  const presets = workspaceHtml.match(/data-organizer-instruction=/g) || []

  assert.ok(presets.length >= 4)
  assert.match(workspaceHtml, /id="draftInstructionButton"/)
  assert.match(workspaceHtml, /value="auto" selected>Auto — based on collection/)
  assert.match(workspaceHtml, /Up to 24 leaf folders/)
  assert.match(workspaceStyles, /#organizeView\s*{[^}]*max-width:\s*820px;/s)
})

test('uses a compact task-first workspace shell for organize and ask', () => {
  const workspaceHtml = readFileSync(join(__dirname, '..', 'workspace.html'), 'utf8')
  const workspaceStyles = readFileSync(join(__dirname, '..', 'workspace.css'), 'utf8')

  assert.match(workspaceHtml, /class="workspace-tabs"/)
  assert.match(workspaceHtml, /class="nav-button is-active" href="#organize"/)
  assert.match(workspaceHtml, /class="nav-button" href="#ask"/)
  assert.doesNotMatch(workspaceHtml, /<button class="nav-button"/)
  assert.match(workspaceHtml, />\s*Organize\s*</)
  assert.match(workspaceHtml, />\s*Ask\s*</)
  assert.doesNotMatch(workspaceHtml, /class="sidebar"|Your bookmarks, made legible/)
  assert.match(workspaceStyles, /#organizeView\s*{[^}]*max-width:\s*820px;/s)
  assert.match(workspaceStyles, /#askView\s*{[^}]*max-width:\s*980px;/s)
})

test('falls back to deterministic Ask results when Chrome Built-in AI fails', () => {
  const workspaceScript = readFileSync(join(__dirname, '..', 'workspace.js'), 'utf8')

  assert.match(workspaceScript, /message: `Built-in AI answer failed:/)
  assert.match(workspaceScript, /Chrome Built-in AI could not complete this request\. Local rules are active\./)
  assert.match(workspaceScript, /Array\.isArray\(workspaceState\.job\?\.suggestions\)/)
})

test('continues organizer scans with local rules when Chrome Built-in AI fails', () => {
  const workspaceScript = readFileSync(join(__dirname, '..', 'workspace.js'), 'utf8')

  assert.match(workspaceScript, /function isJobInterruption\(error\)/)
  assert.match(workspaceScript, /const AI_PLANNING_BOOKMARK_LIMIT = 400/)
  assert.match(workspaceScript, /orderedBookmarks\.length <= AI_PLANNING_BOOKMARK_LIMIT/)
  assert.match(workspaceScript, /function recordLocalAiFallback\(stage, error\)/)
  assert.match(workspaceScript, /recordLocalAiFallback\('startup', error\)/)
  assert.match(workspaceScript, /recordLocalAiFallback\('planning', error\)/)
  assert.match(workspaceScript, /recordLocalAiFallback\('assignment', error\)/)
  assert.match(workspaceScript, /assignments = buildDeterministicAssignments\(batch/)
})

test('bounds large preview rendering while retaining full-collection controls', () => {
  const workspaceHtml = readFileSync(join(__dirname, '..', 'workspace.html'), 'utf8')
  const workspaceScript = readFileSync(join(__dirname, '..', 'workspace.js'), 'utf8')

  assert.match(workspaceHtml, /id="loadMoreButton"/)
  assert.match(workspaceHtml, /id="previewVisibleCount"/)
  assert.match(workspaceScript, /const PREVIEW_PAGE_SIZE = 200/)
  assert.match(workspaceScript, /suggestions\.slice\(0, workspaceState\.previewRenderLimit\)/)
  assert.match(workspaceScript, /workspaceState\.job\.suggestions\.filter/)
})

test('keeps category refinement review-only until the user applies the plan', () => {
  const workspaceHtml = readFileSync(join(__dirname, '..', 'workspace.html'), 'utf8')
  const workspaceScript = readFileSync(join(__dirname, '..', 'workspace.js'), 'utf8')

  assert.match(workspaceHtml, /id="refineLargeButton"/)
  assert.match(workspaceHtml, /id="mergeTinyButton"/)
  assert.match(workspaceHtml, /These actions update the proposal only/)
  assert.match(workspaceScript, /async function refineLargeCategories\(\)/)
  assert.match(workspaceScript, /async function mergeTinyCategories\(\)/)
  assert.doesNotMatch(
    workspaceScript.match(/async function refineLargeCategories\(\)[\s\S]*?\n}\n\nasync function mergeTinyCategories/)?.[0] || '',
    /Organizer\.moveBookmark/,
  )
  assert.match(workspaceScript, /function automaticallyImproveCompletedPlan\(\)/)
  assert.match(workspaceScript, /const improvement = automaticallyImproveCompletedPlan\(\)/)
  assert.doesNotMatch(
    workspaceScript.match(/function automaticallyImproveCompletedPlan\(\)[\s\S]*?\n}\n\nasync function runJob/)?.[0] || '',
    /Organizer\.moveBookmark/,
  )
})

test('visualizes source impact and the proposed destination before apply', () => {
  const workspaceHtml = readFileSync(join(__dirname, '..', 'workspace.html'), 'utf8')
  const workspaceScript = readFileSync(join(__dirname, '..', 'workspace.js'), 'utf8')

  assert.match(workspaceHtml, /id="planVisualization"/)
  assert.match(workspaceHtml, /id="sourceTree"/)
  assert.match(workspaceHtml, /id="destinationTree"/)
  assert.match(workspaceHtml, /Existing folders are kept/)
  assert.match(workspaceHtml, /id="moveLibraryButton"/)
  assert.match(workspaceScript, /function renderPlanVisualization\(\)/)
  assert.match(workspaceScript, /function hasOrganizerDestinationConflict\(/)
  assert.match(workspaceScript, /async function moveExistingLibraryToDestination\(\)/)
  assert.match(workspaceScript, /This moves the existing folder; it does not copy bookmarks/)
  assert.match(workspaceScript, /elements\.destinationSelect\.addEventListener\('change', handleDestinationChange\)/)
  assert.match(workspaceScript, /Existing folders will be kept and may become empty/)
})

test('keeps bookmark agent access local, scoped, and read-only by default', () => {
  const serviceWorker = readFileSync(join(__dirname, '..', 'service-worker.js'), 'utf8')
  assert.equal(AgentCore.MAX_PLAN_ASSIGNMENTS, 2000)
  assert.equal(AgentCore.MAX_PLAN_CATEGORIES, 40)
  assert.ok(AgentCore.READ_METHODS.includes('bookmarks.analyze_plan'))
  assert.match(serviceWorker, /Organizer\.sanitizeCategoryPath\(assignment\?\.category\)/)
  assert.match(serviceWorker, /Organizer\.splitCategoryPath\(assignment\.category\)/)
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
  assert.equal((await Organizer.moveNode('20', { parentId: '1' })).parentId, '1')
  assert.deepEqual(await Organizer.searchBookmarks({ url: 'https://example.com/' }), [])
  assert.equal((await Organizer.queryTabs({ active: true, currentWindow: true }))[0].id, 4)

  assert.ok(calls.some(([name]) => name === 'bookmarks.create'))
  assert.ok(calls.some(([name]) => name === 'bookmarks.move'))
  delete global.chrome
})

test('stops retrying a crashed Chrome model across extension patch updates', async () => {
  const storage = {}
  let createCalls = 0
  let extensionVersion = '1.3.4'

  global.chrome = {
    runtime: {
      lastError: null,
      getManifest() {
        return { version: extensionVersion }
      },
    },
    storage: {
      local: {
        get(key, callback) {
          callback({ [key]: storage[key] })
        },
        set(value, callback) {
          Object.assign(storage, value)
          callback()
        },
      },
    },
  }
  global.LanguageModel = {
    async availability() {
      return 'available'
    },
    async create() {
      createCalls += 1
      throw new Error('The model process crashed too many times for this version.')
    },
  }

  try {
    const first = await Organizer.createLanguageModelSession()
    extensionVersion = '1.3.6'
    const second = await Organizer.createLanguageModelSession()

    assert.equal(first.available, false)
    assert.equal(first.session, null)
    assert.equal(second.available, false)
    assert.equal(createCalls, 1)
    assert.equal(storage[Organizer.AI_RUNTIME_FAILURE_KEY].version, '1.3.4')
    assert.match(second.message, /Local rules are active/)
  } finally {
    delete global.LanguageModel
    delete global.chrome
  }
})

test('retries Chrome local AI after the persisted crash cooldown', async () => {
  const storage = {
    [Organizer.AI_RUNTIME_FAILURE_KEY]: {
      version: '1.3.5',
      browserVersion: 'unknown',
      message: 'The model process crashed too many times for this version.',
      createdAt: new Date(Date.now() - 61 * 60 * 1000).toISOString(),
    },
  }
  let createCalls = 0

  global.chrome = {
    runtime: {
      lastError: null,
      getManifest() {
        return { version: '1.3.6' }
      },
    },
    storage: {
      local: {
        get(key, callback) {
          callback({ [key]: storage[key] })
        },
        set(value, callback) {
          Object.assign(storage, value)
          callback()
        },
      },
    },
  }
  global.LanguageModel = {
    async availability() {
      return 'available'
    },
    async create() {
      createCalls += 1
      return { prompt() {}, destroy() {} }
    },
  }

  try {
    const result = await Organizer.createLanguageModelSession()
    assert.equal(result.available, true)
    assert.ok(result.session)
    assert.equal(createCalls, 1)
  } finally {
    delete global.LanguageModel
    delete global.chrome
  }
})

test('migrates legacy Other Bookmarks plans to the new Bookmarks Bar default', () => {
  const workspaceScript = readFileSync(join(__dirname, '..', 'workspace.js'), 'utf8')
  const withoutOrganizer = JSON.parse(JSON.stringify(fixture))
  withoutOrganizer[0].children[1].children = withoutOrganizer[0].children[1].children.filter(
    (node) => node.title !== Organizer.ORGANIZER_FOLDER_NAME,
  )
  const legacyJob = {
    status: 'complete',
    destinationRootId: '2',
  }

  assert.equal(Organizer.shouldMigrateLegacyDestination(legacyJob, withoutOrganizer), true)
  assert.equal(Organizer.shouldMigrateLegacyDestination(legacyJob, fixture), false)
  assert.equal(
    Organizer.shouldMigrateLegacyDestination(
      { ...legacyJob, destinationSelectionSource: 'user' },
      withoutOrganizer,
    ),
    false,
  )
  assert.equal(
    Organizer.shouldMigrateLegacyDestination(
      { ...legacyJob, status: 'applied' },
      withoutOrganizer,
    ),
    false,
  )
  assert.match(workspaceScript, /Organizer\.shouldMigrateLegacyDestination\(savedJob, tree\)/)
  assert.match(workspaceScript, /destinationSelectionSource = 'migrated-default'/)
  assert.match(workspaceScript, /destinationSelectionSource = 'user'/)
})
