import assert from 'node:assert/strict'
import test from 'node:test'
import { createMcpServer } from '../src/mcp-server.mjs'

test('exposes the bounded Lucitra bookmark tool surface over MCP', async () => {
  const calls = []
  const server = createMcpServer({
    clientName: 'local',
    bridgeRequest: async (method, params, client) => {
      calls.push({ method, params, client })
      return { ready: true }
    },
  })

  const initialized = await server.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
  })
  assert.equal(initialized.result.protocolVersion, '2025-11-25')
  assert.deepEqual(initialized.result.capabilities, { tools: { listChanged: false } })

  const listed = await server.handle({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} })
  assert.deepEqual(
    listed.result.tools.map((tool) => tool.name).sort(),
    [
      'bookmarks_apply_plan',
      'bookmarks_find_duplicates',
      'bookmarks_list_folders',
      'bookmarks_prepare_organization',
      'bookmarks_search',
      'bookmarks_status',
      'bookmarks_summary',
      'bookmarks_undo',
    ],
  )

  const applyTool = listed.result.tools.find((tool) => tool.name === 'bookmarks_apply_plan')
  assert.equal(applyTool.annotations.destructiveHint, true)
  assert.equal(applyTool.annotations.readOnlyHint, false)

  const status = await server.handle({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: { name: 'bookmarks_status', arguments: {} },
  })
  assert.equal(status.result.structuredContent.ready, true)
  assert.equal(calls[0].method, 'system.status')
  assert.equal(calls[0].client.processing, 'local')
})

test('rejects malformed write arguments before they reach Chrome', async () => {
  let called = false
  const server = createMcpServer({ bridgeRequest: async () => { called = true } })
  await server.handle({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: { protocolVersion: '2025-06-18' },
  })

  const response = await server.handle({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'bookmarks_apply_plan', arguments: { planId: 'not-a-uuid' } },
  })
  assert.equal(response.error.code, -32602)
  assert.equal(called, false)
})
