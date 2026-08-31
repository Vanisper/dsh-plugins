// @env node
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { SpacesRegistry } from './registry.ts'
import { basename, join } from 'node:path'
import { canonicalize } from './locate.ts'
import { loadSpaceFile } from './space-file.ts'

export type Logger = (message: string) => void

/**
 * 把一个空间的壳根与全部成员项目登记为核心 workspace
 *
 * @description
 * - 用 insertBefore 把成员排到壳根之后，保持 space.yaml 顺序相邻
 * - 登记时显式传 title：成员取 space.yaml 的 title 或壳内目录名，避免 symlink 目标名盖过空间语义
 * - 幂等：重复登记同一路径返回既有 workspace（不改动既有标题）；单条失败只跳过该条
 *
 * 导出仅为单测可直接覆盖排序逻辑，不作为插件的公共 API
 */
export async function registerOneSpace(ws: WorkspaceRegistry, root: string, log: Logger): Promise<void> {
  const realRoot = await canonicalize(root)
  if (!realRoot) {
    log(`[dsh-space] 空间根目录不存在，跳过登记：${root}`)
    return
  }
  const file = await loadSpaceFile(realRoot)
  const shellId = (await ws.create(realRoot, file.name)).id
  const memberIds: WorkspaceId[] = []
  for (const project of file.projects) {
    const real = await canonicalize(join(realRoot, project.path))
    if (!real) {
      log(`[dsh-space] 成员目录不存在，跳过：${realRoot}/${project.path}`)
      continue
    }
    memberIds.push((await ws.create(real, project.title ?? basename(project.path))).id)
  }
  const order = ws.list().map(workspace => workspace.id)
  const anchor = order.slice(order.indexOf(shellId) + 1).find(id => !memberIds.includes(id))
  for (const memberId of memberIds)
    await ws.insertBefore(memberId, anchor)
}

/** 登记入口的统一形态：读取名录、逐空间登记、失败只记日志 */
export type RefreshWorkspaces = () => void

/**
 * 启动工作区自动登记，并返回可手动触发重刷的函数
 *
 * @description 触发时机：启动一次 + 名录每次变化（登记幂等，重跑无副作用）；
 * 另把返回的 refresh 交给工具/命令适配器，在 init/mount/unmount 后即时调用
 */
export function startWorkspaceRegistration(ctx: Context, registry: SpacesRegistry, log: Logger): RefreshWorkspaces {
  const ws = ctx.get('workspaceRegistry')
  if (!ws) {
    log('[dsh-space] workspaceRegistry 不可用（非 web profile？），跳过工作区自动登记')
    return () => {}
  }
  const refresh = (): void => {
    void Promise.allSettled(
      registry.list().map(root => registerOneSpace(ws, root, log)),
    ).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected')
          log(`[dsh-space] 工作区登记失败：${(result.reason as Error).message}`)
      }
    })
  }
  refresh()
  registry.watch(refresh)
  return refresh
}
