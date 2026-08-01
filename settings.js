'use strict'

const Organizer = globalThis.BookmarkOrganizer
const AgentCore = globalThis.BookmarkAgentCore

const elements = {
  form: document.getElementById('policyForm'),
  agentState: document.getElementById('agentState'),
  connectionTitle: document.getElementById('connectionTitle'),
  connectionMessage: document.getElementById('connectionMessage'),
  enableAgentButton: document.getElementById('enableAgentButton'),
  disableAgentButton: document.getElementById('disableAgentButton'),
  agentScope: document.getElementById('agentScope'),
  accessMode: document.getElementById('accessMode'),
  allowCodex: document.getElementById('allowCodex'),
  allowClaude: document.getElementById('allowClaude'),
  externalDisclosure: document.getElementById('externalDisclosure'),
  externalConsent: document.getElementById('externalConsent'),
  settingsStatus: document.getElementById('settingsStatus'),
  savePolicyButton: document.getElementById('savePolicyButton'),
}

let currentPolicy = AgentCore.normalizePolicy(null)

function chromeCall(target, method, ...args) {
  return new Promise((resolve, reject) => {
    target[method](...args, (result) => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message))
      else resolve(result)
    })
  })
}

function sendMessage(message) {
  return chromeCall(chrome.runtime, 'sendMessage', message)
}

function setStatus(message, isError = false) {
  elements.settingsStatus.textContent = message
  elements.settingsStatus.classList.toggle('is-error', isError)
}

function selectedExternalProviders() {
  return [
    ...(elements.allowCodex.checked ? ['codex'] : []),
    ...(elements.allowClaude.checked ? ['claude'] : []),
  ]
}

function hasCurrentConsent(providers) {
  const current = [...currentPolicy.externalProviders].sort()
  const selected = [...providers].sort()
  return (
    currentPolicy.externalConsentVersion === AgentCore.EXTERNAL_CONSENT_VERSION &&
    current.length === selected.length &&
    current.every((provider, index) => provider === selected[index])
  )
}

function updateDisclosure() {
  const providers = selectedExternalProviders()
  elements.externalDisclosure.hidden = providers.length === 0
  if (providers.length === 0) elements.externalConsent.checked = false
}

function renderPolicy(policy, permissionGranted, connection) {
  currentPolicy = AgentCore.normalizePolicy(policy)
  if (
    currentPolicy.scopeId !== 'all' &&
    ![...elements.agentScope.options].some((option) => option.value === currentPolicy.scopeId)
  ) {
    const missing = document.createElement('option')
    missing.value = currentPolicy.scopeId
    missing.textContent = `Unavailable approved folder (${currentPolicy.scopeId})`
    missing.disabled = true
    elements.agentScope.append(missing)
  }
  elements.agentScope.value = currentPolicy.scopeId
  elements.accessMode.value = currentPolicy.accessMode
  elements.allowCodex.checked = currentPolicy.externalProviders.includes('codex')
  elements.allowClaude.checked = currentPolicy.externalProviders.includes('claude')
  elements.externalConsent.checked = false
  updateDisclosure()

  const enabled = currentPolicy.enabled && permissionGranted
  elements.agentState.textContent = enabled ? 'On' : 'Off'
  elements.agentState.classList.toggle('is-off', !enabled)
  elements.enableAgentButton.hidden = enabled
  elements.disableAgentButton.hidden = !enabled

  if (connection?.connected) {
    elements.connectionTitle.textContent = 'Local companion connected'
  } else if (enabled) {
    elements.connectionTitle.textContent = 'Waiting for local companion'
  } else {
    elements.connectionTitle.textContent = 'Not connected'
  }
  elements.connectionMessage.textContent = connection?.message || 'Agent Access has not been enabled.'

  const externalCount = currentPolicy.externalProviders.length
  setStatus(
    externalCount > 0
      ? `${externalCount} external provider${externalCount === 1 ? '' : 's'} approved.`
      : 'Local-only processing is active.',
  )
}

async function loadFolders() {
  const tree = await Organizer.getBookmarkTree()
  const folders = Organizer.collectFolderOptions(tree)
  const fragment = document.createDocumentFragment()
  for (const folder of folders) {
    const option = document.createElement('option')
    option.value = folder.id
    option.textContent = folder.path
    fragment.append(option)
  }
  elements.agentScope.append(fragment)
}

async function refreshStatus() {
  const status = await sendMessage({ type: 'agent-access:status' })
  renderPolicy(status.policy, status.permissionGranted, status.connection)
}

async function enableAgentAccess() {
  elements.enableAgentButton.disabled = true
  try {
    const granted = await chromeCall(chrome.permissions, 'request', {
      permissions: ['nativeMessaging'],
    })
    if (!granted) {
      setStatus('Chrome permission was not granted. The local organizer remains available.', true)
      return
    }

    const policy = {
      ...currentPolicy,
      enabled: true,
      updatedAt: new Date().toISOString(),
    }
    await Organizer.writeStorage(AgentCore.POLICY_STORAGE_KEY, policy)
    await sendMessage({ type: 'agent-access:connect' })
    await refreshStatus()
  } catch (error) {
    setStatus(error.message || 'Unable to enable Agent Access.', true)
  } finally {
    elements.enableAgentButton.disabled = false
  }
}

async function disableAgentAccess() {
  elements.disableAgentButton.disabled = true
  try {
    const policy = {
      ...currentPolicy,
      enabled: false,
      externalProviders: [],
      externalConsentVersion: 0,
      updatedAt: new Date().toISOString(),
    }
    await Organizer.writeStorage(AgentCore.POLICY_STORAGE_KEY, policy)
    await sendMessage({ type: 'agent-access:disconnect' })
    await chromeCall(chrome.permissions, 'remove', { permissions: ['nativeMessaging'] })
    await refreshStatus()
  } catch (error) {
    setStatus(error.message || 'Unable to revoke Agent Access.', true)
  } finally {
    elements.disableAgentButton.disabled = false
  }
}

async function savePolicy(event) {
  event.preventDefault()
  const externalProviders = selectedExternalProviders()
  if (
    externalProviders.length > 0 &&
    !hasCurrentConsent(externalProviders) &&
    !elements.externalConsent.checked
  ) {
    setStatus('Confirm the external-processing disclosure before enabling a provider.', true)
    elements.externalConsent.focus()
    return
  }

  elements.savePolicyButton.disabled = true
  try {
    const policy = {
      ...currentPolicy,
      scopeId: elements.agentScope.value || 'all',
      accessMode: elements.accessMode.value === 'reviewed' ? 'reviewed' : 'read-only',
      externalProviders,
      externalConsentVersion:
        externalProviders.length > 0 ? AgentCore.EXTERNAL_CONSENT_VERSION : 0,
      updatedAt: new Date().toISOString(),
    }
    await Organizer.writeStorage(AgentCore.POLICY_STORAGE_KEY, policy)
    await refreshStatus()
    setStatus('Access policy saved.')
  } catch (error) {
    setStatus(error.message || 'Unable to save the access policy.', true)
  } finally {
    elements.savePolicyButton.disabled = false
  }
}

elements.enableAgentButton.addEventListener('click', () => void enableAgentAccess())
elements.disableAgentButton.addEventListener('click', () => void disableAgentAccess())
elements.allowCodex.addEventListener('change', updateDisclosure)
elements.allowClaude.addEventListener('change', updateDisclosure)
elements.form.addEventListener('submit', (event) => void savePolicy(event))

void loadFolders().then(refreshStatus).catch((error) => {
  setStatus(error.message || 'Unable to load Agent Access settings.', true)
})
