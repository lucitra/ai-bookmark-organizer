import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Organizer = require('../../../shared.js')

const groups = [
  ['AI Tools', 220, 'AI model platform', 'ai-tools'],
  ['Developer Resources', 150, 'Developer API documentation', 'developer'],
  ['Companies & Investors', 160, 'Venture capital investor', 'venture'],
  ['Design', 100, 'Design UI inspiration', 'design'],
  ['Learning', 100, 'Learning course tutorial', 'learning'],
  ['Research', 80, 'Research paper report', 'research'],
  ['Health', 60, 'Healthcare biotech research', 'health'],
  ['News & Media', 60, 'Technology news article', 'news'],
  ['Productivity', 40, 'Productivity workflow tool', 'productivity'],
  ['Reference', 30, 'General reference resource', 'reference'],
]

const bookmarks = groups.flatMap(([folder, count, title, slug]) =>
  Array.from({ length: count }, (_, index) => ({
    id: `${slug}-${index + 1}`,
    title: `${title} ${index + 1}`,
    url: `https://${slug}-${index + 1}.example/`,
    parentId: folder,
    index,
    folderPath: `Other Bookmarks / ${folder}`,
  })),
)

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const limit = Organizer.recommendedCategoryLimit(bookmarks.length)
const plan = Organizer.buildFallbackCategoryPlan(bookmarks, limit)
const assignments = Organizer.parseAssignments('[]', bookmarks, plan)
const supplementedPlan = Organizer.parseCategoryPlan(
  '["AI Tools","Venture Capital","Research","Learning"]',
  limit,
  bookmarks,
)
const unresolved = assignments.filter(
  (assignment) => assignment.category === Organizer.FALLBACK_CATEGORY,
)
const planningPrompt = Organizer.buildPlanningPrompt(bookmarks, '', limit)
const userShapedPlan = [
  ...bookmarks.slice(0, 230).map((bookmark) => ({ ...bookmark, category: 'Technology › Developer Resources' })),
  ...bookmarks.slice(230, 459).map((bookmark) => ({ ...bookmark, category: 'Finance › Venture Firms' })),
  ...bookmarks.slice(459, 559).map((bookmark) => ({ ...bookmark, category: 'Business › Companies' })),
  ...bookmarks.slice(559, 589).map((bookmark) => ({ ...bookmark, category: 'Technology › AI Infrastructure' })),
  ...bookmarks.slice(589, 609).map((bookmark) => ({ ...bookmark, category: 'Health › Healthcare' })),
  ...bookmarks.slice(609, 617).map((bookmark) => ({ ...bookmark, category: 'Business › Operations' })),
  ...bookmarks.slice(617, 621).map((bookmark) => ({ ...bookmark, category: 'Technology › Hardware Systems' })),
  ...bookmarks.slice(621, 624).map((bookmark) => ({ ...bookmark, category: 'Productivity › Workflows' })),
  { ...bookmarks[624], category: 'Health › Biotech' },
]
const health = Organizer.analyzeCategoryHealth(userShapedPlan)
const merges = Organizer.recommendTinyCategoryMerges(userShapedPlan)
const automaticImprovement = Organizer.improveCategorySuggestions(userShapedPlan)

assert(bookmarks.length === 1000, `expected 1,000 bookmarks, got ${bookmarks.length}`)
assert(limit === 32, `expected a 32-folder automatic limit, got ${limit}`)
assert(plan.length <= limit, `plan exceeds ${limit} leaf folders`)
assert(plan.length >= 24, `large fallback plan is too coarse (${plan.length} leaf folders)`)
assert(supplementedPlan.length >= 24, `undersized AI plan was not supplemented (${supplementedPlan.length} leaf folders)`)
assert(!plan.includes(Organizer.FALLBACK_CATEGORY), 'plan includes Uncategorized')
assert(plan.some((category) => category.includes(Organizer.CATEGORY_SEPARATOR)), 'fallback plan is flat')
assert(unresolved.length === 0, `${unresolved.length} assignments remain Uncategorized`)
assert(/Parent › Child/.test(planningPrompt), 'large planning prompt does not request hierarchy')
assert(
  Organizer.sanitizeCategoryPath('Technology > AI Tools') === 'Technology › AI Tools',
  'nested folder paths are not normalized safely',
)
assert(
  health.broad.map((item) => item.category).includes('Technology › Developer Resources'),
  'plan health did not flag the oversized developer folder',
)
assert(
  health.broad.map((item) => item.category).includes('Finance › Venture Firms'),
  'plan health did not flag the oversized venture folder',
)
assert(
  Organizer.categoryRefinementOptions('Technology › Developer Resources').length === 6,
  'developer folder refinement options are missing',
)
assert(
  merges.some((item) => item.from === 'Technology › Hardware Systems' && item.to === 'Technology › AI Infrastructure'),
  'tiny hardware folder did not receive the expected merge recommendation',
)
assert(
  automaticImprovement.refinedFolders.length === 2,
  `expected 2 automatic refinements, got ${automaticImprovement.refinedFolders.length}`,
)
assert(
  automaticImprovement.mergedFolders.length === 3,
  `expected 3 automatic merges, got ${automaticImprovement.mergedFolders.length}`,
)
assert(
  !automaticImprovement.suggestions.some((item) =>
    ['Technology › Developer Resources', 'Finance › Venture Firms'].includes(item.category),
  ),
  'automatic plan improvement left a supported oversized folder unchanged',
)
assert(
  automaticImprovement.suggestions.length === userShapedPlan.length,
  'automatic plan improvement added or removed bookmarks',
)

console.log(
  `Large-collection QA passed: ${bookmarks.length.toLocaleString()} bookmarks, ${limit} automatic leaf-folder limit, ${plan.length} deterministic folders, ${unresolved.length} unresolved, ${automaticImprovement.refinedFolders.length} oversized folders automatically refined, ${automaticImprovement.mergedFolders.length} tiny folders automatically merged.`,
)
