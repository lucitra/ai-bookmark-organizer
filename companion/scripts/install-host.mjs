#!/usr/bin/env node

import { randomBytes } from 'node:crypto'
import { chmod, copyFile, mkdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { companionHome, NATIVE_HOST_NAME } from '../src/config.mjs'

if (process.platform !== 'darwin') {
  throw new Error('The current companion installer supports macOS only. Windows packaging is planned next.')
}

const args = process.argv.slice(2)
const extensionIds = []
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--extension-id' && args[index + 1]) extensionIds.push(args[++index])
}

if (extensionIds.length === 0) {
  throw new Error('Provide at least one Chrome extension ID with --extension-id <id>.')
}
for (const id of extensionIds) {
  if (!/^[a-p]{32}$/.test(id)) throw new Error(`Invalid Chrome extension ID: ${id}`)
}

const companionRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const userHome = companionHome()
const configDir = join(userHome, '.lucitra-bookmarks')
const binDir = join(configDir, 'bin')
const appDir = join(configDir, 'app')
const commandPath = join(appDir, 'bin', 'lucitra-bookmarks.mjs')
const configPath = join(configDir, 'bridge.json')
const socketPath = join(configDir, 'bridge.sock')
const launcherPath = join(binDir, 'lucitra-bookmarks-native')
const hostDir = join(
  userHome,
  'Library',
  'Application Support',
  'Google',
  'Chrome',
  'NativeMessagingHosts',
)
const hostManifestPath = join(hostDir, `${NATIVE_HOST_NAME}.json`)

const shellQuote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`
const launcher = `#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(commandPath)} native "$@"\n`
const config = {
  version: 1,
  token: randomBytes(32).toString('hex'),
  socketPath,
  extensionIds: [...new Set(extensionIds)],
  installedAt: new Date().toISOString(),
}
const manifest = {
  name: NATIVE_HOST_NAME,
  description: 'Lucitra local bookmark bridge',
  path: launcherPath,
  type: 'stdio',
  allowed_origins: config.extensionIds.map((id) => `chrome-extension://${id}/`),
}

const runtimeFiles = [
  'bin/lucitra-bookmarks.mjs',
  'scripts/install-host.mjs',
  'scripts/uninstall-host.mjs',
  'src/bridge-client.mjs',
  'src/config.mjs',
  'src/doctor.mjs',
  'src/mcp-server.mjs',
  'src/native-host.mjs',
  'src/native-protocol.mjs',
]

await mkdir(binDir, { recursive: true, mode: 0o700 })
await chmod(configDir, 0o700)
await chmod(binDir, 0o700)
for (const relativePath of runtimeFiles) {
  const source = join(companionRoot, relativePath)
  const destination = join(appDir, relativePath)
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
  if (resolve(source) !== resolve(destination)) await copyFile(source, destination)
  await chmod(
    destination,
    relativePath.startsWith('bin/') || relativePath.startsWith('scripts/') ? 0o700 : 0o600,
  )
}
await mkdir(hostDir, { recursive: true })
await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
await chmod(configPath, 0o600)
await writeFile(launcherPath, launcher, { mode: 0o700 })
await chmod(launcherPath, 0o700)
await writeFile(hostManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 })
await chmod(hostManifestPath, 0o600)

process.stdout.write([
  'Installed Lucitra Bookmark Companion.',
  `Native host: ${hostManifestPath}`,
  `Configuration: ${configPath}`,
  `MCP command: ${process.execPath} ${commandPath} mcp --client local`,
  `Extension IDs: ${config.extensionIds.join(', ')}`,
  'Next: restart Chrome, enable Agent Access in extension settings, then run doctor.',
  '',
].join('\n'))
