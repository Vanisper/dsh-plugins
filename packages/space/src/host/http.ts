import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SpaceOperation, SpaceOperations } from './operations.ts'

// ============================================================
// 浏览器侧 HTTP API（未来客户端侧边栏的数据面）
// ------------------------------------------------------------
// - GET  /api/dsh-space/registry  完整运行时投影
// - POST /api/dsh-space/ops       统一操作模块的浏览器 adapter
// webServer 为必选注入（与 dsh-better-sidebar 同款）：本插件面向 web profile
// ============================================================

/** webServer 服务的最小结构投影 */
interface WebServerLike {
  register: (route: { kind: 'exact', path: string, handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }) => void
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk: unknown) => {
      data += chunk
      if (data.length > 1024 * 1024) {
        reject(new Error('request body too large'))
        req.destroy()
      }
    })
    req.on('end', () => {
      try {
        const parsed = data.length > 0 ? JSON.parse(data) : {}
        resolve(typeof parsed === 'object' && parsed !== null ? parsed as Record<string, unknown> : {})
      }
      catch (error) {
        reject(error)
      }
    })
    req.on('error', reject)
  })
}

function writeJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

function modeOf(value: string | undefined): 'link' | 'reference' | undefined {
  if (value === undefined)
    return undefined
  if (value === 'link' || value === 'reference')
    return value
  throw new Error(`mode 只接受 link | reference，收到 ${value}`)
}

/** 把 HTTP 载荷收窄为统一操作模块的类型化命令 */
export function parseOperation(body: Record<string, unknown>): SpaceOperation {
  const op = String(body.op ?? '')
  const str = (key: string): string | undefined => (body[key] === undefined || body[key] === null ? undefined : String(body[key]))
  switch (op) {
    case 'create-space': {
      const name = str('name')
      if (!name)
        throw new Error('create-space 需要 name')
      return { op: 'create-space', name, folder: str('folder'), mode: modeOf(str('mode')), linkName: str('linkName'), title: str('title'), desc: str('desc') }
    }
    case 'attach': {
      const space = str('space')
      const target = str('target')
      if (!space || !target)
        throw new Error('attach 需要 space 与 target')
      return { op: 'attach', space, target, mode: modeOf(str('mode')), name: str('name'), title: str('title'), desc: str('desc') }
    }
    case 'detach': {
      const space = str('space')
      const target = str('target')
      if (!space || !target)
        throw new Error('detach 需要 space 与 target')
      return { op: 'detach', space, target }
    }
    case 'primary': {
      const space = str('space')
      const target = str('target')
      if (!space || !target)
        throw new Error('primary 需要 space 与 target')
      return { op: 'primary', space, target }
    }
    case 'title': {
      const space = str('space')
      const target = str('target')
      if (!space || !target)
        throw new Error('title 需要 space 与 target')
      return { op: 'title', space, target, value: str('value') ?? '' }
    }
    case 'desc': {
      const space = str('space')
      const target = str('target')
      if (!space || !target)
        throw new Error('desc 需要 space 与 target')
      return { op: 'desc', space, target, value: str('value') ?? '' }
    }
    case 'chat':
      return { op: 'create-chat', name: str('name') }
    case 'chatdrop': {
      const ref = str('ref')
      if (!ref)
        throw new Error('chatdrop 需要 ref')
      return { op: 'drop-chat', ref }
    }
    case 'rebind': {
      const chatRef = str('chat')
      const spaceRef = str('space')
      if (chatRef && spaceRef)
        throw new Error('rebind 的 space 与 chat 只能提供一个')
      if (chatRef)
        return { op: 'rebind-chat', chat: chatRef }
      if (!spaceRef)
        throw new Error('rebind 需要 space 或 chat')
      return { op: 'rebind-space', space: spaceRef }
    }
    case 'reorder-spaces': {
      const ids = Array.isArray(body.ids) ? body.ids.map(item => String(item)) : null
      if (!ids || ids.length === 0)
        throw new Error('reorder-spaces 需要 ids（全部空间 id 的目标顺序）')
      return { op: 'reorder-spaces', ids }
    }
    case 'drop': {
      const space = str('space')
      if (!space)
        throw new Error('drop 需要 space')
      return { op: 'drop-space', space }
    }
    default:
      throw new Error(`未知 op：${op || '(空)'}`)
  }
}

/** ops 的纯派发层（不触碰 req/res，可单测） */
export async function dispatchOp(operations: SpaceOperations, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  return operations.execute(parseOperation(body))
}

/** 注册浏览器数据面；入口已声明 webServer 为必需依赖 */
export function registerHttpApi(ctx: Context, operations: SpaceOperations): void {
  const server = ctx.get('webServer') as WebServerLike | undefined
  if (!server)
    throw new Error('webServer 未就绪，dsh-space 无法注册浏览器数据面')
  server.register({
    kind: 'exact',
    path: '/api/dsh-space/registry',
    handler: (_req, res) => {
      writeJson(res, 200, { ok: true, ...operations.snapshot() })
    },
  })
  server.register({
    kind: 'exact',
    path: '/api/dsh-space/ops',
    handler: async (req, res) => {
      try {
        const body = await readJsonBody(req)
        const result = await dispatchOp(operations, body)
        writeJson(res, 200, { ok: true, ...result })
      }
      catch (error) {
        writeJson(res, 400, { ok: false, error: (error as Error).message })
      }
    },
  })
}
