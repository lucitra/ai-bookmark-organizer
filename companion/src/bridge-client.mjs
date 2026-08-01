import { connect } from 'node:net'
import { randomUUID } from 'node:crypto'
import { loadBridgeConfig } from './config.mjs'
import { encodeSocketLine, SocketLineDecoder } from './native-protocol.mjs'

function bridgeError(code, message) {
  const error = new Error(message)
  error.code = code
  return error
}

export async function requestBridge(
  method,
  params,
  client,
  { configPath, timeoutMs = 60_000 } = {},
) {
  const config = await loadBridgeConfig(configPath)
  const id = randomUUID()

  return new Promise((resolve, reject) => {
    const socket = connect(config.socketPath)
    const decoder = new SocketLineDecoder()
    let authenticated = false
    let settled = false

    const finish = (callback, value) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.destroy()
      callback(value)
    }

    const timeout = setTimeout(() => {
      finish(reject, bridgeError('BRIDGE_TIMEOUT', 'The Chrome bookmark bridge did not respond in time.'))
    }, timeoutMs)

    socket.on('connect', () => {
      socket.write(encodeSocketLine({ type: 'auth', token: config.token }))
    })

    socket.on('data', (chunk) => {
      try {
        for (const message of decoder.push(chunk)) {
          if (!authenticated) {
            if (!message.ok) {
              finish(reject, bridgeError('BRIDGE_AUTH_FAILED', message.error || 'Bridge authentication failed.'))
              return
            }
            authenticated = true
            socket.write(encodeSocketLine({ id, method, params, client }))
            continue
          }

          if (message.id !== id) continue
          if (!message.ok) {
            finish(
              reject,
              bridgeError(message.error?.code || 'BOOKMARK_AGENT_ERROR', message.error?.message || 'Bookmark request failed.'),
            )
            return
          }
          finish(resolve, message.result)
        }
      } catch (error) {
        finish(reject, error)
      }
    })

    socket.on('error', (error) => {
      finish(
        reject,
        bridgeError(
          'CHROME_OFFLINE',
          `The Lucitra Chrome bridge is unavailable. Open Chrome, enable Agent Access, and install the companion. ${error.message}`,
        ),
      )
    })

    socket.on('end', () => {
      if (!settled) finish(reject, bridgeError('BRIDGE_CLOSED', 'The Lucitra Chrome bridge closed the request.'))
    })
  })
}
