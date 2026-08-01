import { access, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { companionHome, defaultConfigPath, loadBridgeConfig, NATIVE_HOST_NAME } from './config.mjs'

function checkResult(label, ok, detail) {
  return { label, ok, detail }
}

async function fileExists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export async function inspectInstallation() {
  const checks = []
  let config
  try {
    config = await loadBridgeConfig()
    checks.push(checkResult('Configuration', true, defaultConfigPath()))
    const configMode = (await stat(defaultConfigPath())).mode & 0o777
    checks.push(checkResult(
      'Configuration permissions',
      configMode === 0o600,
      configMode === 0o600 ? 'Owner read/write only' : `Expected 600, found ${configMode.toString(8)}`,
    ))
  } catch (error) {
    checks.push(checkResult('Configuration', false, error.message))
    return checks
  }

  const commandPath = join(companionHome(), '.lucitra-bookmarks', 'app', 'bin', 'lucitra-bookmarks.mjs')
  const commandPresent = await fileExists(commandPath)
  checks.push(checkResult(
    'Installed runtime',
    commandPresent,
    commandPresent ? commandPath : `Missing ${commandPath}`,
  ))

  if (commandPresent) {
    const mode = (await stat(commandPath)).mode & 0o777
    checks.push(checkResult(
      'Runtime permissions',
      mode === 0o700,
      mode === 0o700 ? 'Owner executable only' : `Expected 700, found ${mode.toString(8)}`,
    ))
  }

  const hostManifestPath = join(
    companionHome(),
    'Library',
    'Application Support',
    'Google',
    'Chrome',
    'NativeMessagingHosts',
    `${NATIVE_HOST_NAME}.json`,
  )
  try {
    const manifest = JSON.parse(await readFile(hostManifestPath, 'utf8'))
    const expectedOrigins = config.extensionIds.map((id) => `chrome-extension://${id}/`)
    const originsMatch =
      Array.isArray(manifest.allowed_origins) &&
      manifest.allowed_origins.length === expectedOrigins.length &&
      expectedOrigins.every((origin) => manifest.allowed_origins.includes(origin))
    checks.push(checkResult(
      'Chrome native host',
      manifest.name === NATIVE_HOST_NAME && Boolean(manifest.path) && originsMatch,
      hostManifestPath,
    ))
  } catch (error) {
    checks.push(checkResult('Chrome native host', false, `${hostManifestPath}: ${error.message}`))
  }

  return checks
}

export async function runDoctor({ output = process.stdout } = {}) {
  if (process.platform !== 'darwin') {
    output.write('Lucitra Bookmark Companion setup currently supports macOS only.\n')
    return false
  }

  const checks = await inspectInstallation()
  for (const check of checks) {
    output.write(`${check.ok ? 'PASS' : 'FAIL'}  ${check.label}: ${check.detail}\n`)
  }
  const ready = checks.length > 0 && checks.every((check) => check.ok)
  output.write(ready
    ? 'READY Restart Chrome and enable Agent Access in extension settings.\n'
    : 'NOT READY Run setup again with the extension ID shown in chrome://extensions.\n')
  return ready
}
