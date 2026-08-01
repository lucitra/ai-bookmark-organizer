import { chmod, lstat, unlink } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import { timingSafeEqual } from 'node:crypto'
import { loadBridgeConfig } from './config.mjs'
import {
  encodeNativeMessage,
  encodeSocketLine,
  NativeMessageDecoder,
  SocketLineDecoder,
} from './native-protocol.mjs'

function tokensEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8')
  const rightBuffer = Buffer.from(String(right || ''), 'utf8')
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

async function removeStaleSocket(socketPath) {
  try {
    const stats = await lstat(socketPath)
    if (!stats.isSocket()) throw new Error(`Refusing to replace non-socket path: ${socketPath}`)
    await unlink(socketPath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

async function activeHostExists(config) {
  return new Promise((resolve) => {
    const socket = connect(config.socketPath)
    const decoder = new SocketLineDecoder()
    const timeout = setTimeout(() => {
      socket.destroy()
      resolve(false)
    }, 500)

    const finish = (active) => {
      clearTimeout(timeout)
      socket.destroy()
      resolve(active)
    }

    socket.on('connect', () => {
      socket.write(encodeSocketLine({ type: 'auth', token: config.token }))
    })
    socket.on('data', (chunk) => {
      try {
        if (decoder.push(chunk).some((message) => message.ok === true)) finish(true)
      } catch {
        finish(false)
      }
    })
    socket.on('error', () => finish(false))
  })
}

export async function startNativeHost({ callerOrigin = null } = {}) {
  const config = await loadBridgeConfig()
  if (callerOrigin) {
    const expectedOrigins = config.extensionIds.map((id) => `chrome-extension://${id}/`)
    if (!expectedOrigins.includes(callerOrigin)) {
      throw new Error(`Chrome extension origin is not approved: ${callerOrigin}`)
    }
  }

  if (await activeHostExists(config)) {
    throw new Error('Another Lucitra native host is already connected to Chrome.')
  }
  await removeStaleSocket(config.socketPath)
  const pending = new Map()
  const server = createServer((socket) => {
    const decoder = new SocketLineDecoder()
    let authenticated = false

    socket.on('data', (chunk) => {
      try {
        for (const message of decoder.push(chunk)) {
          if (!authenticated) {
            if (message.type !== 'auth' || !tokensEqual(message.token, config.token)) {
              socket.end(encodeSocketLine({ ok: false, error: 'Authentication failed.' }))
              return
            }
            authenticated = true
            socket.write(encodeSocketLine({ ok: true, protocolVersion: 1 }))
            continue
          }

          if (!message.id || typeof message.method !== 'string') {
            socket.write(encodeSocketLine({
              id: message.id || null,
              ok: false,
              error: { code: 'INVALID_REQUEST', message: 'Bridge request is missing an ID or method.' },
            }))
            continue
          }

          if (pending.has(message.id) || pending.size >= 100) {
            socket.write(encodeSocketLine({
              id: message.id,
              ok: false,
              error: {
                code: 'BRIDGE_BUSY',
                message: pending.has(message.id)
                  ? 'A bridge request with this ID is already pending.'
                  : 'The local bridge has too many pending requests.',
              },
            }))
            continue
          }

          pending.set(message.id, socket)
          process.stdout.write(encodeNativeMessage(message))
        }
      } catch (error) {
        socket.end(encodeSocketLine({ ok: false, error: error.message }))
      }
    })

    socket.on('close', () => {
      for (const [id, pendingSocket] of pending) {
        if (pendingSocket === socket) pending.delete(id)
      }
    })
  })

  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(config.socketPath, resolve)
  })
  await chmod(config.socketPath, 0o600)

  const decoder = new NativeMessageDecoder()
  process.stdin.on('data', (chunk) => {
    try {
      for (const response of decoder.push(chunk)) {
        const socket = pending.get(response?.id)
        if (!socket) continue
        pending.delete(response.id)
        socket.end(encodeSocketLine(response))
      }
    } catch (error) {
      process.stderr.write(`Native message error: ${error.message}\n`)
    }
  })

  const shutdown = async () => {
    for (const socket of new Set(pending.values())) {
      socket.end(encodeSocketLine({
        ok: false,
        error: { code: 'CHROME_OFFLINE', message: 'Chrome closed the Lucitra native connection.' },
      }))
    }
    server.close()
    try {
      await unlink(config.socketPath)
    } catch (error) {
      if (error.code !== 'ENOENT') process.stderr.write(`Socket cleanup failed: ${error.message}\n`)
    }
  }

  process.stdin.on('end', () => void shutdown().finally(() => process.exit(0)))
  process.on('SIGTERM', () => void shutdown().finally(() => process.exit(0)))
  process.on('SIGINT', () => void shutdown().finally(() => process.exit(0)))
}
