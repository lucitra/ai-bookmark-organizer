import assert from 'node:assert/strict'
import test from 'node:test'
import { execFile } from 'node:child_process'
import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const companionDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const commandPath = resolve(companionDir, 'bin', 'lucitra-bookmarks.mjs')

test('installs and removes a Chrome native host inside an isolated user home', async (context) => {
  if (process.platform !== 'darwin') {
    context.skip('The current companion installer targets macOS.')
    return
  }

  const isolatedHome = await mkdtemp(join(tmpdir(), 'lucitra-bookmarks-test-'))
  const extensionId = 'a'.repeat(32)
  const env = { ...process.env, LUCITRA_BOOKMARKS_HOME: isolatedHome }

  try {
    const install = await execFileAsync(
      process.execPath,
      [commandPath, 'setup', '--extension-id', extensionId],
      { env },
    )
    assert.match(install.stdout, /Installed Lucitra Bookmark Companion/)

    const configPath = join(isolatedHome, '.lucitra-bookmarks', 'bridge.json')
    const launcherPath = join(isolatedHome, '.lucitra-bookmarks', 'bin', 'lucitra-bookmarks-native')
    const installedCommandPath = join(
      isolatedHome,
      '.lucitra-bookmarks',
      'app',
      'bin',
      'lucitra-bookmarks.mjs',
    )
    const manifestPath = join(
      isolatedHome,
      'Library',
      'Application Support',
      'Google',
      'Chrome',
      'NativeMessagingHosts',
      'ai.lucitra.bookmarks.json',
    )
    const config = JSON.parse(await readFile(configPath, 'utf8'))
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

    assert.equal(config.extensionIds[0], extensionId)
    assert.ok(config.token.length >= 64)
    assert.match(await readFile(installedCommandPath, 'utf8'), /Lucitra Bookmark Companion/)
    assert.deepEqual(manifest.allowed_origins, [`chrome-extension://${extensionId}/`])
    assert.equal((await stat(launcherPath)).mode & 0o777, 0o700)
    assert.equal((await stat(installedCommandPath)).mode & 0o777, 0o700)

    const doctor = await execFileAsync(process.execPath, [installedCommandPath, 'doctor'], { env })
    assert.match(doctor.stdout, /READY Restart Chrome/)

    const uninstall = await execFileAsync(process.execPath, [installedCommandPath, 'uninstall'], { env })
    assert.match(uninstall.stdout, /Removed the Lucitra native host/)
    await assert.rejects(access(configPath))
    await assert.rejects(access(manifestPath))
  } finally {
    await rm(isolatedHome, { recursive: true, force: true })
  }
})
