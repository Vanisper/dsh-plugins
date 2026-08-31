// @env node
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { SpacesStore } from './registry.ts'
import type { SpaceEntity } from './types.ts'
import { basename } from 'node:path'
import { canonicalize } from './resolve.ts'

export type Logger = (message: string) => void

/**
 * 把一个空间的全部成员登记为核心 workspace
 *
 * @description
 * - 主成员排首位，其余保持注册表顺序；整块排在成员当前最早出现的位置
 * - 登记时显式传 title（folder.title ?? 目录名）；已有记录的路径与标题不被覆盖
 * - 幂等：重复登记同一路径返回既有 workspace；单个缺失目录只跳过该条
 *
 * 导出仅为单测可直接覆盖排序逻辑，不作为插件的公共 API
 */
export async function registerOneSpace(ws: WorkspaceRegistry, space: SpaceEntity, log: Logger): Promise<void> {
  const ordered = [...space.folders].sort((a, b) => {
    if (a.path === space.primary)
      return -1
    if (b.path === space.primary)
      return 1
    return 0
  })
  const blockIds: WorkspaceId[] = []
  for (const folder of ordered) {
    if (!(await canonicalize(folder.path))) {
      log(`[dsh-space] 成员目录不存在，跳过：${folder.path}`)
      continue
    }
    blockIds.push((await ws.create(folder.path, folder.title ?? basename(folder.path))).id)
  }
  if (blockIds.length === 0)
    return
  const order = ws.list().map(workspace => workspace.id)
  const positions = blockIds.map(id => order.indexOf(id)).filter(index => index >= 0)
  const anchor = order.slice(Math.min(...positions)).find(id => !blockIds.includes(id))
  for (const id of blockIds)
    await ws.insertBefore(id, anchor)
}

/** 登记入口的统一形态：读取注册表、逐空间登记、失败只记日志 */
export type RefreshWorkspaces = () => void

/**
 * 启动工作区自动登记，并返回可手动触发重刷的函数
 *
 * @description 触发时机：启动一次 + 注册表每次变化（登记幂等，重跑无副作用）；
 * 返回的 refresh 同时交给工具/命令适配器，在 create/attach/detach 后即时调用
 */
export function startWorkspaceRegistration(ctx: Context, store: SpacesStore, log: Logger): RefreshWorkspaces {
  const ws = ctx.get('workspaceRegistry')
  if (!ws) {
    log('[dsh-space] workspaceRegistry 不可用（非 web profile？），跳过工作区自动登记')
    return () => {}
  }
  const refresh = (): void => {
    void Promise.allSettled(
      store.list().map(space => registerOneSpace(ws, space, log)),
    ).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected')
          log(`[dsh-space] 工作区登记失败：${(result.reason as Error).message}`)
      }
    })
  }
  refresh()
  store.watch(refresh)
  return refresh
}
