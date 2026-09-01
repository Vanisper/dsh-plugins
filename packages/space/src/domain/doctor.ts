import type { ChatEntity, FolderStatus, SandboxModeName, SpaceEntity, Writability } from './types.ts'
import { canonicalize, isUnder } from '../shared/fs-path.ts'
import { effectivePath, listFolders } from './space.ts'

export interface DoctorReport {
  space: SpaceEntity
  mode: SandboxModeName | 'unknown'
  sessionCwd: string
  /** 壳目录的磁盘存在性（无壳为 none；missing 时注册表结构仍在，link 可推导重建） */
  shellHealth: 'ok' | 'missing' | 'none'
  folders: (FolderStatus & { writability: Writability | null })[]
}

/**
 * 逐成员诊断存在性、link 健康度与当前会话沙盒模式下的写入可达性
 *
 * @description 读取永不受沙盒限制；写入在 danger-full-access 下全开，
 * workspace-write 下以会话 cwd 子树为界——link 成员经壳内路径写入时 realpath 出壳即拒，按真实路径判定
 */
export async function doctorSpace(space: SpaceEntity, sessionCwd: string, mode: SandboxModeName | 'unknown'): Promise<DoctorReport> {
  const sessionReal = await canonicalize(sessionCwd)
  const [folders, shellReal] = await Promise.all([
    listFolders(space),
    space.shell ? canonicalize(space.shell) : Promise.resolve(undefined),
  ])
  return {
    space,
    mode,
    sessionCwd: sessionReal ?? sessionCwd,
    shellHealth: !space.shell ? 'none' : shellReal ? 'ok' : 'missing',
    folders: folders.map((folder) => {
      const writability = folder.health === 'missing'
        ? 'read-only' as const
        : mode === 'danger-full-access'
          ? 'writable' as const
          : mode === 'workspace-write'
            ? sessionReal === undefined
              ? 'read-only' as const
              : isUnder(folder.path, sessionReal)
                ? 'writable' as const
                : isUnder(sessionReal, folder.path)
                  ? 'partial' as const
                  : 'read-only' as const
            : mode === 'read-only'
              ? 'read-only' as const
              : null
      return { ...folder, writability }
    }),
  }
}

// ============================================================
// 工作区绑定审计（只读检测，不做任何治愈）
// ------------------------------------------------------------
// id-first 纪律的对照面：行经 id 查出，path 只用于一致性比对。
// 「行不在」（悬空/缺失）与「行在但不对」（错位/共享）是两类问题，
// 后者是数据质量问题，只报告、绝不静默重接
// ============================================================

/** 核心注册表行的最小结构投影（host 层从 workspaceRegistry.list() 截取） */
export interface CoreWorkspaceRow {
  id: string
  path: string
}

export type BindingStatus = 'ok' | 'unbound' | 'dangling' | 'mismatch' | 'shared-row' | 'shared-path' | 'unknown'

export interface BindingAudit {
  space: SpaceEntity
  status: BindingStatus
  /** 涉事核心行（ok/mismatch/shared-* 时存在） */
  row?: CoreWorkspaceRow
  /** 有效的规则解释，面向诊断输出 */
  detail: string
}

/**
 * 审计单个空间的绑定状态
 *
 * @param space 待审计空间
 * @param rows 核心注册表快照；undefined 表示核心服务不可用（整体降级为 unknown，不误报）
 * @param allSpaces 全部空间（共享行/共享路径是跨空间判定）
 */
export function auditBinding(space: SpaceEntity, rows: CoreWorkspaceRow[] | undefined, allSpaces: SpaceEntity[]): BindingAudit {
  const effective = effectivePath(space)
  if (rows === undefined)
    return { space, status: 'unknown', detail: '核心 workspaceRegistry 不可用，绑定状态未知' }

  if (!space.workspaceId) {
    // 共享路径提前：无绑定时有效路径撞车仍要报（将来绑定会撞）
    const clash = allSpaces.find(other => other.id !== space.id && effectivePath(other) !== undefined && effectivePath(other) === effective)
    if (clash)
      return { space, status: 'shared-path', detail: `有效路径与空间「${clash.name}」相同（${effective}），绑定会撞车` }
    return { space, status: 'unbound', detail: effective ? `无绑定（有效路径 ${effective}）；被动渲染不建行，实际操作时再登记` : '无绑定且无有效路径（纯注解合集）' }
  }

  const row = rows.find(item => item.id === space.workspaceId)
  if (!row)
    return { space, status: 'dangling', detail: `绑定 ${space.workspaceId} 查无此行（核心侧该行已被删除）；悬空是正常表现，需要时重新登记即可` }

  if (row.path !== effective)
    return { space, status: 'mismatch', row, detail: `行 ${row.id} 的 path（${row.path}）≠ 有效路径（${effective ?? '无'}）；数据质量问题，请人工核对` }

  const rowClash = allSpaces.find(other => other.id !== space.id && other.workspaceId === row.id)
  if (rowClash)
    return { space, status: 'shared-row', row, detail: `行 ${row.id} 同时被空间「${rowClash.name}」绑定` }

  return { space, status: 'ok', row, detail: `已绑定 ${row.id}（path 一致）` }
}

/** 对话实体的诊断状态 */
export type ChatHealth = 'ok' | 'unbound' | 'dangling' | 'missing-dir'

export interface ChatAudit {
  chat: ChatEntity
  status: ChatHealth
  detail: string
}

/**
 * 审计单个对话实体：绑定行在不在、目录在不在
 *
 * @param chat 待审计对话实体
 * @param rows 核心注册表快照；undefined 时绑定项降级为 unknown 口径（这里并入 unbound 报告）
 */
export async function auditChat(chat: ChatEntity, rows: CoreWorkspaceRow[] | undefined): Promise<ChatAudit> {
  const dirExists = Boolean(await canonicalize(chat.path))
  if (!dirExists)
    return { chat, status: 'missing-dir', detail: `目录已从磁盘消失：${chat.path}` }
  if (rows === undefined)
    return { chat, status: 'unbound', detail: '核心 workspaceRegistry 不可用，绑定状态未知' }
  if (!chat.workspaceId)
    return { chat, status: 'unbound', detail: `无绑定（${chat.path}）；实际操作时再登记` }
  const row = rows.find(item => item.id === chat.workspaceId)
  if (!row)
    return { chat, status: 'dangling', detail: `绑定 ${chat.workspaceId} 查无此行；悬空是正常表现，需要时重新登记即可` }
  return { chat, status: 'ok', detail: `已绑定 ${row.id}` }
}
