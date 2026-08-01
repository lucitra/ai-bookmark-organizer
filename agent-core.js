(function initializeBookmarkAgentCore(globalScope) {
  'use strict'

  const POLICY_STORAGE_KEY = 'bookmarkAgentPolicyV1'
  const PLAN_STORAGE_KEY = 'bookmarkAgentPlanV1'
  const APPLY_HISTORY_STORAGE_KEY = 'bookmarkAgentApplyHistoryV1'
  const EXTERNAL_CONSENT_VERSION = 1
  const PLAN_TTL_MS = 15 * 60 * 1000
  const MAX_PLAN_ASSIGNMENTS = 500
  const MAX_PLAN_CATEGORIES = 12

  const READ_METHODS = Object.freeze([
    'bookmarks.summary',
    'bookmarks.list_folders',
    'bookmarks.search',
    'bookmarks.find_duplicates',
    'bookmarks.prepare_organization',
  ])
  const MUTATION_METHODS = Object.freeze([
    'bookmarks.apply_plan',
    'bookmarks.undo',
  ])
  const SUPPORTED_METHODS = Object.freeze([
    'system.status',
    ...READ_METHODS,
    ...MUTATION_METHODS,
  ])
  const EXTERNAL_PROVIDERS = Object.freeze(['codex', 'claude'])

  const DEFAULT_POLICY = Object.freeze({
    enabled: false,
    accessMode: 'read-only',
    scopeId: 'all',
    externalProviders: Object.freeze([]),
    externalConsentVersion: 0,
    updatedAt: null,
  })

  function normalizeProvider(value) {
    const provider = String(value || '').trim().toLowerCase()
    if (provider === 'claude-code' || provider === 'anthropic') return 'claude'
    if (provider === 'openai') return 'codex'
    if (EXTERNAL_PROVIDERS.includes(provider)) return provider
    return 'local'
  }

  function normalizeClient(value) {
    const client = value && typeof value === 'object' ? value : {}
    const processing = client.processing === 'external' ? 'external' : 'local'
    return {
      name: String(client.name || 'local-client').trim().slice(0, 80) || 'local-client',
      provider: normalizeProvider(client.provider || client.name),
      processing,
    }
  }

  function normalizePolicy(value) {
    const policy = value && typeof value === 'object' ? value : {}
    const externalProviders = [...new Set(
      (Array.isArray(policy.externalProviders) ? policy.externalProviders : [])
        .map(normalizeProvider)
        .filter((provider) => EXTERNAL_PROVIDERS.includes(provider)),
    )]

    return {
      enabled: policy.enabled === true,
      accessMode: policy.accessMode === 'reviewed' ? 'reviewed' : 'read-only',
      scopeId: String(policy.scopeId || 'all'),
      externalProviders,
      externalConsentVersion:
        Number(policy.externalConsentVersion) === EXTERNAL_CONSENT_VERSION
          ? EXTERNAL_CONSENT_VERSION
          : 0,
      updatedAt: typeof policy.updatedAt === 'string' ? policy.updatedAt : null,
    }
  }

  function authorizeRequest(policyValue, requestValue) {
    const policy = normalizePolicy(policyValue)
    const request = requestValue && typeof requestValue === 'object' ? requestValue : {}
    const method = String(request.method || '')
    const client = normalizeClient(request.client)

    if (!SUPPORTED_METHODS.includes(method)) {
      return { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Unsupported bookmark agent method.' }
    }

    if (method === 'system.status') return { ok: true, policy, client }

    if (!policy.enabled) {
      return {
        ok: false,
        code: 'AGENT_ACCESS_DISABLED',
        message: 'Agent Access is disabled in the extension settings.',
      }
    }

    if (client.processing === 'external') {
      const hasCurrentConsent = policy.externalConsentVersion === EXTERNAL_CONSENT_VERSION
      if (!hasCurrentConsent || !policy.externalProviders.includes(client.provider)) {
        return {
          ok: false,
          code: 'EXTERNAL_PROVIDER_NOT_ALLOWED',
          message: `${client.provider === 'claude' ? 'Claude' : 'Codex'} access has not been approved in the extension settings.`,
        }
      }
    }

    if (MUTATION_METHODS.includes(method) && policy.accessMode !== 'reviewed') {
      return {
        ok: false,
        code: 'WRITE_ACCESS_DISABLED',
        message: 'Agent writes are disabled. Enable reviewed changes in the extension settings.',
      }
    }

    return { ok: true, policy, client }
  }

  function authorizePreparedArtifact(policyValue, clientValue, artifactValue) {
    const policy = normalizePolicy(policyValue)
    const client = normalizeClient(clientValue)
    const artifact = artifactValue && typeof artifactValue === 'object' ? artifactValue : {}
    const preparedClient = normalizeClient(artifact.client)

    if (
      preparedClient.name !== client.name ||
      preparedClient.provider !== client.provider ||
      preparedClient.processing !== client.processing
    ) {
      return {
        ok: false,
        code: 'PLAN_CLIENT_MISMATCH',
        message: 'Only the client that prepared this plan can apply or undo it.',
      }
    }

    if (
      policy.scopeId !== 'all' &&
      (String(artifact.scopeId || '') !== policy.scopeId ||
        String(artifact.destinationRootId || '') !== policy.scopeId)
    ) {
      return {
        ok: false,
        code: 'PLAN_SCOPE_CHANGED',
        message: 'The approved bookmark scope changed after this plan was prepared.',
      }
    }

    return { ok: true, policy, client }
  }

  const api = Object.freeze({
    APPLY_HISTORY_STORAGE_KEY,
    DEFAULT_POLICY,
    EXTERNAL_CONSENT_VERSION,
    EXTERNAL_PROVIDERS,
    MAX_PLAN_ASSIGNMENTS,
    MAX_PLAN_CATEGORIES,
    MUTATION_METHODS,
    PLAN_STORAGE_KEY,
    PLAN_TTL_MS,
    POLICY_STORAGE_KEY,
    READ_METHODS,
    SUPPORTED_METHODS,
    authorizePreparedArtifact,
    authorizeRequest,
    normalizeClient,
    normalizePolicy,
    normalizeProvider,
  })

  globalScope.BookmarkAgentCore = api
  if (typeof module !== 'undefined' && module.exports) module.exports = api
})(typeof globalThis !== 'undefined' ? globalThis : this)
