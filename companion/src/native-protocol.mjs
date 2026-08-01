const MAX_NATIVE_MESSAGE_BYTES = 1024 * 1024
const MAX_SOCKET_LINE_BYTES = 2 * 1024 * 1024

export function encodeNativeMessage(value) {
  const payload = Buffer.from(JSON.stringify(value), 'utf8')
  if (payload.length > MAX_NATIVE_MESSAGE_BYTES) {
    throw new Error(`Native message exceeds ${MAX_NATIVE_MESSAGE_BYTES} bytes.`)
  }
  const header = Buffer.allocUnsafe(4)
  header.writeUInt32LE(payload.length, 0)
  return Buffer.concat([header, payload])
}

export class NativeMessageDecoder {
  #buffer = Buffer.alloc(0)

  push(chunk) {
    this.#buffer = Buffer.concat([this.#buffer, chunk])
    const messages = []

    while (this.#buffer.length >= 4) {
      const length = this.#buffer.readUInt32LE(0)
      if (length > MAX_NATIVE_MESSAGE_BYTES) {
        throw new Error(`Native message exceeds ${MAX_NATIVE_MESSAGE_BYTES} bytes.`)
      }
      if (this.#buffer.length < 4 + length) break
      const payload = this.#buffer.subarray(4, 4 + length)
      this.#buffer = this.#buffer.subarray(4 + length)
      messages.push(JSON.parse(payload.toString('utf8')))
    }

    return messages
  }
}

export function encodeSocketLine(value) {
  const line = `${JSON.stringify(value)}\n`
  if (Buffer.byteLength(line, 'utf8') > MAX_SOCKET_LINE_BYTES) {
    throw new Error(`Bridge message exceeds ${MAX_SOCKET_LINE_BYTES} bytes.`)
  }
  return line
}

export class SocketLineDecoder {
  #buffer = ''

  push(chunk) {
    this.#buffer += chunk.toString('utf8')
    if (Buffer.byteLength(this.#buffer, 'utf8') > MAX_SOCKET_LINE_BYTES) {
      throw new Error(`Bridge message exceeds ${MAX_SOCKET_LINE_BYTES} bytes.`)
    }

    const messages = []
    let newline = this.#buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.#buffer.slice(0, newline).trim()
      this.#buffer = this.#buffer.slice(newline + 1)
      if (line) messages.push(JSON.parse(line))
      newline = this.#buffer.indexOf('\n')
    }
    return messages
  }
}
