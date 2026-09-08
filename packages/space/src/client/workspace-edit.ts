import type { MemberDraft } from './member-editor.ts'
import type { RegistryItem, RegistryPayload } from './types.ts'

export interface WorkspaceDraft extends MemberDraft {
  title: string
  space: boolean
}

interface Dependencies {
  read: () => Promise<RegistryPayload>
  run: (operation: Record<string, unknown>) => Promise<Record<string, unknown>>
  rename: (id: string, title: string) => Promise<void>
  accepted: (item: RegistryItem) => void
}

export interface WorkspaceEdit {
  snapshot: () => { item: RegistryItem, saved: boolean }
  save: (draft: WorkspaceDraft) => Promise<void>
}

function membersKey(draft: Partial<MemberDraft>): string {
  return JSON.stringify([
    draft.primary || draft.members?.[0]?.path || null,
    (draft.members ?? []).map(member => [member.path, member.mode, member.linkName || (member.mode === 'link' ? member.path.split(/[\\/]/).at(-1) : null), member.title?.trim() || null, member.description?.trim() || null]),
  ])
}

/** 协调核心名称与插件成员的分步保存；确认过的步骤不会因后续失败而回滚 */
export function createWorkspaceEdit(item: RegistryItem, deps: Dependencies): WorkspaceEdit {
  let base = structuredClone(item)
  let saved = false
  let busy = false
  const read = async (): Promise<RegistryItem> => {
    const registry = await deps.read()
    const current = registry.items.find(row => row.workspaceId === base.workspaceId)
    if (!current || current.path !== base.path || current.kind === 'chat'
      || registry.invalidSpaces.some(row => row.workspaceId === base.workspaceId)
      || registry.invalidChats.some(row => row.workspaceId === base.workspaceId)) {
      throw new Error('工作区登记或描述已变化，请重新载入后检查')
    }
    return current
  }
  const accept = (current: RegistryItem): void => {
    base = structuredClone(current)
    deps.accepted(base)
  }
  return {
    snapshot: () => ({ item: structuredClone(base), saved }),
    async save(draft): Promise<void> {
      if (busy)
        throw new Error('工作区正在保存')
      const title = draft.title.trim()
      if (!title)
        throw new Error('工作区名称不能为空')
      if (base.kind === 'chat')
        throw new Error('成员目录需要显式增强为空间')
      busy = true
      try {
        let current = await read()
        const nameChanged = title !== base.title
        const checkName = (): void => {
          if (nameChanged && current.title !== base.title && current.title !== title)
            throw new Error('工作区名称已在其他位置修改，请重新载入后检查')
        }
        checkName()
        const configChanged = draft.space !== (base.kind === 'space') || (draft.space && membersKey(draft) !== membersKey(base))
        const matches = (row: RegistryItem): boolean => draft.space ? row.kind === 'space' && membersKey(row) === membersKey(draft) : row.kind === 'plain'
        if (configChanged && !matches(current)) {
          if (current.kind !== base.kind || current.revision !== base.revision)
            throw new Error('成员已在其他位置修改，请重新载入后检查')
          if (current.kind === 'space' && !current.revision)
            throw new Error('空间版本不可用，请重新载入后检查')
          let updated: RegistryItem
          try {
            if (!draft.space) {
              await deps.run({ op: 'drop-space', workspace: current.workspaceId, expectedRevision: current.revision })
              updated = await read()
              if (updated.kind !== 'plain')
                throw new Error('空间化关闭结果未确认，请重试')
              updated = { ...updated, title: base.title }
            }
            else {
              const result = await deps.run({
                op: current.kind === 'space' ? 'save-members' : 'enhance-space',
                workspace: current.workspaceId,
                members: draft.members,
                primary: draft.primary,
                ...(current.kind === 'space' ? { expectedRevision: current.revision } : {}),
              })
              const space = result.space as RegistryItem | undefined
              if (!space?.revision || space.workspaceId !== base.workspaceId || space.path !== base.path || !Array.isArray(space.members))
                throw new Error('成员保存响应不完整')
              updated = { ...space, kind: 'space', title: base.title }
            }
          }
          catch (cause) {
            // 响应丢失不等于写入失败；只接受与本次请求完全一致的读回结果
            const actual = await read().catch(() => undefined)
            if (!actual || !matches(actual))
              throw cause
            updated = { ...actual, title: base.title }
          }
          saved = true
          accept(updated)
          current = await read()
          if (current.kind !== base.kind || current.revision !== base.revision)
            throw new Error('成员已保存，但随后发生了其他修改，请重新载入后检查')
          checkName()
        }
        else if (current.kind !== base.kind && !matches(current)) {
          throw new Error('工作区类型已变化，请重新载入后检查')
        }
        if (nameChanged && current.title !== title) {
          // 宿主 rename 没有版本参数；写前复核，不声称跨两个存储的事务保证
          try {
            await deps.rename(base.workspaceId, title)
          }
          catch (cause) {
            const actual = await read().catch(() => undefined)
            if (!actual || actual.title !== title)
              throw cause
            current = actual
          }
          saved = true
          current = { ...current, title }
        }
        accept(current)
      }
      catch (cause) {
        const reason = cause instanceof Error ? cause.message : String(cause)
        throw new Error(`${saved ? '已完成的修改已保留，未完成部分可重试。' : ''}${reason}`)
      }
      finally {
        busy = false
      }
    },
  }
}
