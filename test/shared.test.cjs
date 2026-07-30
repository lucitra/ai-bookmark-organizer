'use strict'

const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { join } = require('node:path')
const test = require('node:test')

const Organizer = require('../shared.js')
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

test('marks bookmark metadata as untrusted in every AI prompt', () => {
  const bookmark = Organizer.collectBookmarks(fixture, { scopeId: '10' })[1]
  assert.match(Organizer.buildPlanningPrompt([bookmark], '', 6), /untrusted data/i)
  assert.match(
    Organizer.buildAssignmentPrompt([bookmark], ['Research', 'Uncategorized'], ''),
    /untrusted data/i,
  )
  assert.match(Organizer.buildQuestionPrompt('What did I save?', [bookmark]), /untrusted data/i)
})
