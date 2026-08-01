import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export const NATIVE_HOST_NAME = 'ai.lucitra.bookmarks'

export function companionHome() {
  return process.env.LUCITRA_BOOKMARKS_HOME || homedir()
}

export function defaultConfigPath() {
  return process.env.LUCITRA_BOOKMARKS_CONFIG || join(companionHome(), '.lucitra-bookmarks', 'bridge.json')
}

export async function loadBridgeConfig(configPath = defaultConfigPath()) {
  let config
  try {
    config = JSON.parse(await readFile(configPath, 'utf8'))
  } catch (error) {
    throw new Error(
      `Lucitra companion is not installed or its configuration is unreadable at ${configPath}: ${error.message}`,
    )
  }

  if (!config || config.version !== 1) throw new Error('Unsupported Lucitra bridge configuration.')
  if (typeof config.token !== 'string' || config.token.length < 32) {
    throw new Error('Lucitra bridge configuration is missing its local authentication token.')
  }
  if (typeof config.socketPath !== 'string' || !config.socketPath) {
    throw new Error('Lucitra bridge configuration is missing its local socket path.')
  }
  if (!Array.isArray(config.extensionIds) || config.extensionIds.length === 0) {
    throw new Error('Lucitra bridge configuration has no approved Chrome extension IDs.')
  }
  if (config.extensionIds.some((id) => !/^[a-p]{32}$/.test(String(id)))) {
    throw new Error('Lucitra bridge configuration contains an invalid Chrome extension ID.')
  }

  return {
    ...config,
    configPath: resolve(configPath),
    socketPath: resolve(config.socketPath),
    extensionIds: config.extensionIds.map(String),
  }
}
