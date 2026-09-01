import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { SpacesStore } from '../store/spaces.ts'
import { bindChatWorkspaceId, createChat, dropChat, findChat } from '../domain/chats.ts'
import { resolveAllByCwd } from '../domain/resolve.ts'
import { attachFolder, bindWorkspaceId, createSpace, detachFolder, dropSpace, effectivePath, findSpace, setPrimary } from '../domain/space.ts'
import { canonicalize } from '../shared/fs-path.ts'
import { coreRows, registerCoreWorkspace } from './core-workspace.ts'

// ============================================================
// 浏览器侧 HTTP API（未来客户端侧边栏的数据面）
// ------------------------------------------------------------
// - GET  /api/dsh-space/registry  注册表全量（spaces 含预算有效路径 + chats）
// - POST /api/dsh-space/resolve   批量 cwd → 空间认领（宽松识别：子树包含）
// - POST /api/dsh-space/ops       两条创建路径与维护动作（域函数薄封装）
// 只读路由不写任何状态；ops 与工具/命令走同一套域函数，行为一致。
// webServer 为必选注入（与 dsh-better-sidebar 同款）：本插件面向 web profile
// ============================================================

/** webServer 服务的最小结构投影 */
interface WebServerLike {
  register: (route: { kind: 'exact', path: string, handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }) => void
}

const warn = (message: string): void => console.warn(message)

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

/** ops 的纯派发层（不触碰 req/res，可单测）：与工具/命令共用域函数 */
export async function dispatchOp(ctx: Context, store: SpacesStore, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const op = String(body.op ?? '')
  const str = (key: string): string | undefined => (body[key] === undefined || body[key] === null ? undefined : String(body[key]))
  const data = store.listSpaces()
  const chats = store.listChats()

  switch (op) {
    case 'create-space': {
      const name = str('name')
      if (!name)
        throw new Error('create-space 需要 name')
      const result = await createSpace(data, name, store.root(), str('folder'))
      const workspaceId = await registerCoreWorkspace(ctx, result.space.shell!, result.space.name, warn)
      const bound = workspaceId
        ? bindWorkspaceId(result.data, result.space.name, workspaceId)
        : { data: result.data, space: findSpace(result.data, result.space.name) }
      await store.save(bound.data, chats)
      return { space: bound.space, workspaceRegistered: Boolean(workspaceId) }
    }
    case 'attach': {
      const space = str('space')
      const target = str('target')
      if (!space || !target)
        throw new Error('attach 需要 space 与 target')
      const mode = str('mode') === 'link' ? 'link' : str('mode') === 'reference' ? 'reference' : undefined
      const result = await attachFolder(data, space, target, { mode, name: str('name'), title: str('title'), desc: str('desc') })
      await store.save(result.data, chats)
      return { folder: result.folder, primary: result.space.primary }
    }
    case 'detach': {
      const space = str('space')
      const target = str('target')
      if (!space || !target)
        throw new Error('detach 需要 space 与 target')
      const result = await detachFolder(data, space, target)
      await store.save(result.data, chats)
      return { detached: result.folder }
    }
    case 'primary': {
      const space = str('space')
      const target = str('target')
      if (!space || !target)
        throw new Error('primary 需要 space 与 target')
      const result = await setPrimary(data, space, target)
      await store.save(result.data, chats)
      return { primary: result.space.primary }
    }
    case 'chat': {
      const result = await createChat(chats, store.root(), str('name'))
      const slug = result.chat.path.split('/').pop() ?? result.chat.path
      const workspaceId = await registerCoreWorkspace(ctx, result.chat.path, slug, warn)
      const bound = workspaceId
        ? bindChatWorkspaceId(result.data, result.chat.path, workspaceId)
        : { data: result.data, chat: result.chat }
      await store.save(data, bound.data)
      return { chat: bound.chat, workspaceRegistered: Boolean(workspaceId) }
    }
    case 'chatdrop': {
      const ref = str('ref')
      if (!ref)
        throw new Error('chatdrop 需要 ref')
      const result = await dropChat(chats, ref)
      await store.save(data, result.data)
      return { dropped: result.chat.path }
    }
    case 'rebind': {
      // 按需治愈：绑定行还在→原样返回；查无此行→按路径幂等重建（悬空是正常表现）
      // 注意只治愈「行不在」；行在但 path 不符属 B 类错位，只报告不自动重接
      const rows = coreRows(ctx)
      const chatRef = str('chat')
      if (chatRef) {
        const chatsNow = store.listChats()
        const chat = await findChat(chatsNow, chatRef)
        if (chat.workspaceId && rows?.some(row => row.id === chat.workspaceId))
          return { workspaceId: chat.workspaceId, healed: false }
        const slug = chat.path.split('/').pop() ?? chat.path
        const workspaceId = await registerCoreWorkspace(ctx, chat.path, slug, warn)
        if (!workspaceId)
          throw new Error('核心登记失败（workspaceRegistry 未就绪）')
        const bound = bindChatWorkspaceId(chatsNow, chat.path, workspaceId)
        await store.save(data, bound.data)
        return { workspaceId, healed: true }
      }
      const spaceRef = str('space')
      if (!spaceRef)
        throw new Error('rebind 需要 space 或 chat')
      const space = findSpace(data, spaceRef)
      if (space.workspaceId && rows?.some(row => row.id === space.workspaceId))
        return { workspaceId: space.workspaceId, healed: false }
      const effective = effectivePath(space)
      if (!effective)
        throw new Error(`空间「${space.name}」没有有效路径，无法登记`)
      const workspaceId = await registerCoreWorkspace(ctx, effective, space.name, warn)
      if (!workspaceId)
        throw new Error('核心登记失败（workspaceRegistry 未就绪）')
      const bound = bindWorkspaceId(data, space.name, workspaceId)
      await store.save(bound.data, chats)
      return { workspaceId, healed: true }
    }
    case 'drop': {
      const space = str('space')
      if (!space)
        throw new Error('drop 需要 space')
      const result = dropSpace(data, space)
      await store.save(result.data, chats)
      return { dropped: result.space.name }
    }
    default:
      throw new Error(`未知 op：${op || '(空)'}（可用：create-space | attach | detach | primary | chat | chatdrop | drop）`)
  }
}

/** 注册三条路由；webServer 未就绪时挂 internal/service 事件等它出现（一次性，双保险） */
export function registerHttpApi(ctx: Context, store: SpacesStore): void {
  let done = false
  const tryRegister = (): boolean => {
    if (done)
      return true
    let server: WebServerLike | undefined
    try {
      server = ctx.get('webServer') as WebServerLike | undefined
    }
    catch {
      server = undefined
    }
    if (!server)
      return false
    server.register({
      kind: 'exact',
      path: '/api/dsh-space/registry',
      handler: (_req, res) => {
        const spaces = store.listSpaces().map(space => ({ ...space, effectivePath: effectivePath(space) }))
        writeJson(res, 200, { ok: true, root: store.root(), spaces, chats: store.listChats() })
      },
    })
    server.register({
      kind: 'exact',
      path: '/api/dsh-space/resolve',
      handler: async (req, res) => {
        try {
          const body = await readJsonBody(req)
          const paths = Array.isArray(body.paths) ? body.paths.map(item => String(item)) : []
          const data = store.listSpaces()
          const results = await Promise.all(paths.map(async (input) => {
            const canonical = await canonicalize(input)
            const spaceIds = canonical ? resolveAllByCwd(data, canonical).map(space => space.id) : []
            return { input, canonical, spaceIds }
          }))
          writeJson(res, 200, { ok: true, results })
        }
        catch (error) {
          writeJson(res, 400, { ok: false, error: (error as Error).message })
        }
      },
    })
    server.register({
      kind: 'exact',
      path: '/api/dsh-space/ops',
      handler: async (req, res) => {
        try {
          const body = await readJsonBody(req)
          const result = await dispatchOp(ctx, store, body)
          writeJson(res, 200, { ok: true, ...result })
        }
        catch (error) {
          writeJson(res, 400, { ok: false, error: (error as Error).message })
        }
      },
    })
    done = true
    return true
  }

  if (tryRegister())
    return
  const dispose = ctx.on('internal/service', () => {
    if (tryRegister())
      dispose()
  })
  ctx.effect(() => dispose)
}
