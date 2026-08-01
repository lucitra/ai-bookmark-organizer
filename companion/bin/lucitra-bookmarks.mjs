#!/usr/bin/env node

const [command = 'help', ...args] = process.argv.slice(2)

function option(name, fallback = null) {
  const index = args.indexOf(name)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}

switch (command) {
  case 'setup': {
    await import('../scripts/install-host.mjs')
    break
  }
  case 'doctor': {
    const { runDoctor } = await import('../src/doctor.mjs')
    const ready = await runDoctor()
    if (!ready) process.exitCode = 1
    break
  }
  case 'uninstall': {
    await import('../scripts/uninstall-host.mjs')
    break
  }
  case 'mcp': {
    const { startMcpServer } = await import('../src/mcp-server.mjs')
    const clientName = option('--client', 'local')
    await startMcpServer({ clientName })
    break
  }
  case 'native': {
    const { startNativeHost } = await import('../src/native-host.mjs')
    await startNativeHost({ callerOrigin: args[0] || null })
    break
  }
  case 'help':
  case '--help':
  case '-h':
    process.stdout.write([
      'Lucitra Bookmark Companion',
      '',
      'Usage:',
      '  lucitra-bookmarks setup --extension-id <chrome-extension-id>',
      '  lucitra-bookmarks doctor',
      '  lucitra-bookmarks mcp --client <local|codex|claude>',
      '  lucitra-bookmarks uninstall',
      '  lucitra-bookmarks native',
      '',
      'Agent Access is local and read-only by default. Enable providers in Chrome settings.',
      '',
    ].join('\n'))
    break
  default:
    process.stderr.write(`Unknown command: ${command}\n`)
    process.exitCode = 1
}
