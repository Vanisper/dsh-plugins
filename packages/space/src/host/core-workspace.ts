import type { Context } from '@deepseek-ai/cordis'

/** 插件实际依赖的核心工作区投影 */
export interface CoreWorkspaceView {
  id: string
  path: string
  title: string
  sessionIds: string[]
}

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
}

/** 核心 workspaceRegistry 的 Host 侧 adapter */
export interface CoreWorkspaceAdapter {
  ensure: (path: string, title: string) => Promise<CoreWorkspaceView>
  get: (id: string) => CoreWorkspaceView | undefined
  list: () => CoreWorkspaceView[]
}

function project(row: WorkspaceLike): CoreWorkspaceView {
  return {
    id: String(row.id),
    path: row.path,
    title: row.title,
    sessionIds: [...row.sessionIds].map(String),
  }
}

/**
 * 建立核心工作区 adapter
 *
 * @description dsh-space 的创建流程要求核心登记必定成功，因此服务缺失直接失败，
 * 不再制造无绑定附加记录
 */
export function createCoreWorkspaceAdapter(ctx: Context): CoreWorkspaceAdapter {
  const registry = ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
  if (!registry)
    throw new Error('workspaceRegistry 未就绪，dsh-space 无法启动')

  return {
    ensure: async (path, title) => project(await registry.create(path, title)),
    get: (id) => {
      const row = registry.get(id)
      return row ? project(row) : undefined
    },
    list: () => registry.list().map(project),
  }
}
