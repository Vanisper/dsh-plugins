import type { Context } from '@deepseek-ai/cordis'
import type { CoreWorkspaceRow } from '../domain/doctor.ts'
import type { Logger } from '../shared/log.ts'

// ============================================================
// 与核心 workspaceRegistry 的唯一接触面（结构性类型，不加包依赖）
// ------------------------------------------------------------
// id-first 纪律：create 是幂等 create-or-get（同 path 返回既有行），
// 返回的 id 即绑定；path 只在审计时经 id 查出做一致性比对。
// 两个调用方：建壳时登记（工作区）、建对话目录时登记（对话）
// ============================================================

/** workspaceRegistry 的最小结构投影 */
interface WorkspaceRegistryLike {
  create: (path: string, title?: string) => Promise<{ id: string }>
  list: () => { id: string, path: string }[]
}

function registryOf(ctx: Context): WorkspaceRegistryLike | undefined {
  try {
    return ctx.get('workspaceRegistry') as WorkspaceRegistryLike | undefined
  }
  catch {
    return undefined
  }
}

/**
 * 把单个目录幂等登记为 dsh 原生工作区，返回行 id
 *
 * @description 服务未就绪或失败时记日志返回 undefined——绑定留空由 doctor 报「未绑定」，不阻塞创建
 */
export async function registerCoreWorkspace(ctx: Context, path: string, title: string, log: Logger): Promise<string | undefined> {
  const ws = registryOf(ctx)
  if (!ws) {
    log('[dsh-space] workspaceRegistry 尚未就绪，未登记工作区')
    return undefined
  }
  try {
    return (await ws.create(path, title)).id
  }
  catch (error) {
    log(`[dsh-space] 工作区登记失败（${path}）：${(error as Error).message}`)
    return undefined
  }
}

/** 核心注册表快照（id + path）；服务不可用时返回 undefined，审计降级 */
export function coreRows(ctx: Context): CoreWorkspaceRow[] | undefined {
  return registryOf(ctx)?.list().map(({ id, path }) => ({ id, path }))
}
