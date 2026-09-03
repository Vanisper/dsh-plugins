import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceView } from '../business/types.ts'

interface WorkspaceLike {
  id: string
  path: string
  title: string
  sessionIds: readonly string[]
}

interface WorkspaceRegistryLike {
  create: (path: string, title?: string) => Promise<WorkspaceLike>
  get: (id: string) => WorkspaceLike | undefined
  list: () => WorkspaceLike[]
  resolveByPath: (path: string) => Promise<WorkspaceLike | undefined>
}

/** 业务层实际使用的核心工作区能力，刻意不暴露核心 delete */
export interface WorkspaceService {
  create: (path: string, title?: string) => Promise<WorkspaceView>
  get: (id: string) => WorkspaceView | undefined
  list: () => WorkspaceView[]
  resolveByPath: (path: string) => Promise<WorkspaceView | undefined>
}

function view(row: WorkspaceLike): WorkspaceView {
  return {
    workspaceId: String(row.id),
    path: String(row.path),
    title: String(row.title),
    sessionIds: [...row.sessionIds].map(String),
  }
}

function registryFrom(ctx: Context): WorkspaceRegistryLike {
  const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
  if (!registry)
    throw new Error('workspaceRegistry 未就绪，dsh-space 无法启动')
  return registry
}

/** 把核心公开服务收窄为 dsh-space 的业务适配器 */
export function createWorkspaceService(ctx: Context): WorkspaceService {
  const registry = registryFrom(ctx)
  return {
    create: async (path, title) => view(await registry.create(path, title)),
    get: (id) => {
      const row = registry.get(id)
      return row ? view(row) : undefined
    },
    list: () => registry.list().map(view),
    resolveByPath: async (path) => {
      return viewOrUndefined(await registry.resolveByPath(path))
    },
  }
}

function viewOrUndefined(row: WorkspaceLike | undefined): WorkspaceView | undefined {
  return row ? view(row) : undefined
}

/** 供单元测试和非 Cordis 调用使用的内存适配器 */
export function createWorkspaceServiceFromRegistry(registry: {
  create: WorkspaceRegistryLike['create']
  get: WorkspaceRegistryLike['get']
  list: WorkspaceRegistryLike['list']
  resolveByPath?: WorkspaceRegistryLike['resolveByPath']
}): WorkspaceService {
  return {
    create: async (path, title) => view(await registry.create(path, title)),
    get: id => viewOrUndefined(registry.get(id)),
    list: () => registry.list().map(view),
    resolveByPath: async path => registry.resolveByPath
      ? viewOrUndefined(await registry.resolveByPath(path))
      : registry.list().map(view).find(row => row.path === path),
  }
}
