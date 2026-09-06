import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SpaceOperations } from '../business/operations.ts'
import { Buffer } from 'node:buffer'
import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { parseOperation, registerHttpApi } from './http.ts'

async function request(chunks: Buffer[]) {
  const routes: Array<{ path: string, handler: (req: IncomingMessage, res: ServerResponse) => unknown }> = []
  const execute = vi.fn(async operation => operation)
  const dispose = registerHttpApi({ get: () => ({ register: (route: typeof routes[number]) => {
    routes.push(route)
    return () => {}
  } }) } as unknown as Context, { execute } as unknown as SpaceOperations)
  const req = Object.assign(Readable.from(chunks), { method: 'POST' }) as unknown as IncomingMessage
  const res = { writeHead: vi.fn(), end: vi.fn() }
  try {
    await routes.find(route => route.path.endsWith('/ops'))!.handler(req, res as unknown as ServerResponse)
    return { execute, body: JSON.parse(res.end.mock.calls[0]![0]), status: res.writeHead.mock.calls[0]![0] }
  }
  finally {
    dispose()
  }
}

describe('hTTP 请求边界', () => {
  it('跨数据块的 UTF-8 字符保持原值', async () => {
    const bytes = Buffer.from(JSON.stringify({ op: 'create-space', name: '项目' }))
    const chunks = Array.from(bytes, byte => Buffer.from([byte]))
    const result = await request(chunks)
    expect(result.status).toBe(200)
    expect(result.body.name).toBe('项目')
  })

  it('超限和无效 JSON 不执行写操作', async () => {
    for (const bytes of [Buffer.alloc(256 * 1024 + 1, 32), Buffer.from('{')]) {
      const result = await request([bytes])
      expect(result.status).toBe(400)
      expect(result.execute).not.toHaveBeenCalled()
    }
  })
})

describe('parseOperation', () => {
  it('keeps the operation boundary strict', () => {
    expect(parseOperation({ op: 'create-space', name: 'demo' })).toEqual({ op: 'create-space', name: 'demo', folder: undefined, mode: undefined, linkName: undefined, title: undefined, description: undefined })
    expect(() => parseOperation({ op: 'create-space', name: 12 })).toThrow('name 必须是字符串')
    expect(() => parseOperation({ op: 'create-space', name: 'demo', extra: true })).toThrow('未知字段')
    expect(() => parseOperation([])).toThrow('根必须是对象')
    expect(() => parseOperation({ op: 'create-space', name: 'demo', mode: 'other' })).toThrow('mode')
  })

  it('maps only the supported operations', () => {
    expect(parseOperation({ op: 'description', workspace: 'w', target: 'm', value: 'text' })).toEqual({ op: 'description', workspace: 'w', target: 'm', value: 'text' })
    expect(parseOperation({ op: 'update-member', workspace: 'w', target: 'm', title: 'Title', description: 'Note' })).toEqual({ op: 'update-member', workspace: 'w', target: 'm', title: 'Title', description: 'Note' })
    expect(() => parseOperation({ op: 'rename-workspace', workspace: 'w' })).toThrow('未知操作')
  })

  it('批量成员边界拒绝无效字段和缺失并发凭据', () => {
    expect(() => parseOperation({ op: 'save-members', workspace: 'w', members: [] })).toThrow('expectedRevision')
    expect(() => parseOperation({ op: 'create-space', name: 'demo', members: [{ path: '/a', extra: 1 }] })).toThrow('未知字段')
    expect(() => parseOperation({ op: 'create-space', name: 'demo', members: 'a' })).toThrow('members')
    expect(parseOperation({ op: 'create-space', name: 'demo', members: [{ path: '/a' }], primary: '/a' })).toMatchObject({ members: [{ path: '/a' }], primary: '/a' })
  })
})
