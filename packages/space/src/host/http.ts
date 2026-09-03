import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SpaceOperation, SpaceOperations } from '../business/operations.ts'
import { Buffer } from 'node:buffer'

interface Route {
  kind: 'exact' | 'prefix'
  path: string
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
}

interface WebServerLike {
  register: (route: Route) => () => void
}

const MAX_BODY = 256 * 1024
const operationKeys = new Set(['op', 'name', 'folder', 'mode', 'linkName', 'title', 'description', 'workspace', 'target', 'value'])

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('请求 JSON 根必须是对象')
  return value as Record<string, unknown>
}

function optionalString(value: unknown, key: string): string | undefined {
  if (value === undefined)
    return undefined
  if (typeof value !== 'string')
    throw new Error(`${key} 必须是字符串`)
  return value
}

function requiredString(body: Record<string, unknown>, key: string): string {
  const value = optionalString(body[key], key)
  if (!value?.trim())
    throw new Error(`${key} 必须是非空字符串`)
  return value
}

function mode(value: unknown): 'reference' | 'link' | undefined {
  if (value === undefined)
    return undefined
  if (value !== 'reference' && value !== 'link')
    throw new Error('mode 只接受 reference 或 link')
  return value
}

export function parseOperation(value: unknown): SpaceOperation {
  const body = object(value)
  for (const key of Object.keys(body)) {
    if (!operationKeys.has(key))
      throw new Error(`请求包含未知字段：${key}`)
  }
  const op = requiredString(body, 'op')
  switch (op) {
    case 'create-space': return { op, name: requiredString(body, 'name'), folder: optionalString(body.folder, 'folder'), mode: mode(body.mode), linkName: optionalString(body.linkName, 'linkName'), title: optionalString(body.title, 'title'), description: optionalString(body.description, 'description') }
    case 'enhance-space': return { op, workspace: requiredString(body, 'workspace') }
    case 'attach': return { op, workspace: requiredString(body, 'workspace'), target: requiredString(body, 'target'), mode: mode(body.mode), linkName: optionalString(body.linkName, 'linkName'), title: optionalString(body.title, 'title'), description: optionalString(body.description, 'description') }
    case 'detach': return { op, workspace: requiredString(body, 'workspace'), target: requiredString(body, 'target') }
    case 'primary': return { op, workspace: requiredString(body, 'workspace'), target: requiredString(body, 'target') }
    case 'title': return { op, workspace: requiredString(body, 'workspace'), target: requiredString(body, 'target'), value: optionalString(body.value, 'value') ?? '' }
    case 'description': return { op, workspace: requiredString(body, 'workspace'), target: requiredString(body, 'target'), value: optionalString(body.value, 'value') ?? '' }
    case 'create-chat': return { op, name: optionalString(body.name, 'name') }
    case 'drop-space': return { op, workspace: requiredString(body, 'workspace') }
    case 'drop-chat': return { op, workspace: requiredString(body, 'workspace') }
    default: throw new Error(`未知操作：${op}`)
  }
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = ''
    let tooLarge = false
    req.on('data', (chunk: Buffer | string) => {
      body += chunk.toString()
      if (Buffer.byteLength(body) > MAX_BODY && !tooLarge) {
        tooLarge = true
        reject(new Error('请求体过大'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (tooLarge)
        return
      try {
        resolve(JSON.parse(body || '{}'))
      }
      catch {
        reject(new Error('请求体不是有效 JSON'))
      }
    })
    req.on('error', reject)
  })
}

function json(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(payload))
}

export function registerHttpApi(ctx: Context, operations: SpaceOperations): () => void {
  const server = ctx.get('webServer') as WebServerLike | undefined
  if (!server)
    throw new Error('webServer 未就绪，dsh-space 无法启动')
  const registry = server.register({ kind: 'exact', path: '/api/dsh-space/registry', handler: (req, res) => {
    if (req.method !== 'GET')
      return json(res, 405, { ok: false, error: '只支持 GET' })
    json(res, 200, { ok: true, ...operations.snapshot() })
  } })
  const ops = server.register({ kind: 'exact', path: '/api/dsh-space/ops', handler: async (req, res) => {
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: '只支持 POST' })
      return
    }
    try {
      const result = await operations.execute(parseOperation(await readBody(req)))
      json(res, 200, { ok: true, ...result })
    }
    catch (error) {
      json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) })
    }
  } })
  return () => {
    registry()
    ops()
  }
}
