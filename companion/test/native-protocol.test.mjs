import assert from 'node:assert/strict'
import test from 'node:test'
import {
  encodeNativeMessage,
  encodeSocketLine,
  NativeMessageDecoder,
  SocketLineDecoder,
} from '../src/native-protocol.mjs'

test('round trips fragmented Chrome native messages', () => {
  const message = { id: 'request-1', method: 'bookmarks.summary', params: {} }
  const encoded = encodeNativeMessage(message)
  const decoder = new NativeMessageDecoder()

  assert.deepEqual(decoder.push(encoded.subarray(0, 3)), [])
  assert.deepEqual(decoder.push(encoded.subarray(3, 9)), [])
  assert.deepEqual(decoder.push(encoded.subarray(9)), [message])
})

test('round trips multiple newline-delimited bridge messages', () => {
  const decoder = new SocketLineDecoder()
  const first = { type: 'auth', token: 'secret' }
  const second = { id: 'request-2', ok: true }
  const encoded = Buffer.from(`${encodeSocketLine(first)}${encodeSocketLine(second)}`)

  assert.deepEqual(decoder.push(encoded), [first, second])
})
