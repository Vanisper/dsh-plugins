// @env node
import type { Context } from '@deepseek-ai/cordis'
import type { WorkspaceId, WorkspaceRegistry } from '@deepseek-ai/dsh-workspace'
import type { SpacesRegistry } from './registry.ts'
import { join } from 'node:path'
import { canonicalize } from './locate.ts'
import { loadSpaceFile } from './space-file.ts'

export type Logger = (message: string) => void

/**
 * 把一个空间的壳根与全部成员项目登记为核心 workspace
 *
 * @description
 * - 用 insertBefore 把成员排到壳根之后，保持 space.yaml 顺序相邻
 * - 幂等：重复登记同一路径返回既有 workspace；单条失败只跳过该条
 */
async function registerOneSpace(ws: WorkspaceRegistry, root: string, log: Logger): Promise<void> {
  const realRoot = await canonicalize(root)
  if (!realRoot) {
    log(`[dsh-space] 空间根目录不存在，跳过登记：${root}`)
    return
  }
  const file = await loadSpaceFile(realRoot)
  const shellId = (await ws.create(realRoot)).id
  const memberIds: WorkspaceId[] = []
  for (const project of file.projects) {
    const real = await canonicalize(join(realRoot, project.path))
    if (!real) {
      log(`[dsh-space] 成员目录不存在，跳过：${realRoot}/${project.path}`)
      continue
    }
    memberIds.push((await ws.create(real)).id)
  }
  const order = ws.list().map(workspace => workspace.id)
  const anchor = order.slice(order.indexOf(shellId) + 1).find(id => !memberIds.includes(id))
  for (const memberId of memberIds)
    await ws.insertBefore(memberId, anchor)
}

/** 启动时把名录中的空间全部登记；之后名录变化（init 新增）时增量重跑（登记幂等） */
export function startWorkspaceRegistration(ctx: Context, registry: SpacesRegistry, log: Logger): void {
  const ws = ctx.get('workspaceRegistry')
  if (!ws) {
    log('[dsh-space] workspaceRegistry 不可用（非 web profile？），跳过工作区自动登记')
    return
  }
  const run = (): void => {
    void Promise.allSettled(
      registry.list().map(root => registerOneSpace(ws, root, log)),
    ).then((results) => {
      for (const result of results) {
        if (result.status === 'rejected')
          log(`[dsh-space] 工作区登记失败：${(result.reason as Error).message}`)
      }
    })
  }
  run()
  registry.watch?.(run)
}
