import assert from 'node:assert/strict'
import test from 'node:test'
import { spawn } from 'node:child_process'
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { requestBridge } from '../src/bridge-client.mjs'
import { encodeNativeMessage, NativeMessageDecoder } from '../src/native-protocol.mjs'

const companionDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const commandPath = resolve(companionDir, 'bin', 'lucitra-bookmarks.mjs')

async function waitForPath(path, attempts = 250) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await access(path)
      return
    } catch {
      await new Promise((resolveWait) => setTimeout(resolveWait, 20))
    }
  }
  throw new Error(`Timed out waiting for ${path}`)
}

test('round trips an authenticated MCP bridge request through the native host', async () => {
  const testDir = await mkdtemp(join(tmpdir(), 'lucitra-bridge-test-'))
  const socketPath = join(testDir, 'bridge.sock')
  const configPath = join(testDir, 'bridge.json')
  const extensionId = 'b'.repeat(32)
  const token = 'c'.repeat(64)
  await writeFile(configPath, JSON.stringify({
    version: 1,
    token,
    socketPath,
    extensionIds: [extensionId],
  }))

  const nativeHost = spawn(
    process.execPath,
    [commandPath, 'native', `chrome-extension://${extensionId}/`],
    {
      env: { ...process.env, LUCITRA_BOOKMARKS_CONFIG: configPath },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )
  const decoder = new NativeMessageDecoder()
  nativeHost.stdout.on('data', (chunk) => {
    for (const request of decoder.push(chunk)) {
      nativeHost.stdin.write(encodeNativeMessage({
        id: request.id,
        ok: true,
        result: { protocolVersion: 1, echoedMethod: request.method },
      }))
    }
  })

  try {
    await waitForPath(socketPath)
    const result = await requestBridge(
      'system.status',
      {},
      { name: 'Local test', provider: 'local', processing: 'local' },
      { configPath, timeoutMs: 5_000 },
    )
    assert.deepEqual(result, { protocolVersion: 1, echoedMethod: 'system.status' })
  } finally {
    nativeHost.stdin.end()
    await new Promise((resolveExit) => {
      const timeout = setTimeout(() => {
        nativeHost.kill('SIGKILL')
      }, 2_000)
      nativeHost.once('exit', () => {
        clearTimeout(timeout)
        resolveExit()
      })
    })
    await rm(testDir, { recursive: true, force: true })
  }
})
