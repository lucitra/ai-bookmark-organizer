#!/usr/bin/env node

import { lstat, rm, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { companionHome, NATIVE_HOST_NAME } from '../src/config.mjs'

if (process.platform !== 'darwin') {
  throw new Error('The current companion uninstaller supports macOS only.')
}

const userHome = companionHome()
const configDir = join(userHome, '.lucitra-bookmarks')
const hostManifestPath = join(
  userHome,
  'Library',
  'Application Support',
  'Google',
  'Chrome',
  'NativeMessagingHosts',
  `${NATIVE_HOST_NAME}.json`,
)

try {
  const stats = await lstat(hostManifestPath)
  if (!stats.isFile()) throw new Error(`Refusing to remove non-file path: ${hostManifestPath}`)
  await unlink(hostManifestPath)
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}

await rm(configDir, { recursive: true, force: true })
process.stdout.write('Removed the Lucitra native host registration and local companion configuration.\n')
