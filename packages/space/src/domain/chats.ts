import type { ChatEntity } from './types.ts'
import { join } from 'node:path'
import { canonicalize } from '../shared/fs-path.ts'
import { chatsDir, dedupeDir, ensureDir, slugify, todayDirName } from '../shared/paths.ts'

/**
 * 建立对话：静默建目录（chats/<本地日期>/<slug>，重名加 -2 序号）并登记为实体
 *
 * @description 目录位置自动确定；核心工作区行的登记与绑定由 host 层接续完成
 * @returns 追加实体后的新数组与该对话实体
 */
export async function createChat(data: ChatEntity[], root: string, name?: string): Promise<{ data: ChatEntity[], chat: ChatEntity }> {
  const parent = await ensureDir(join(chatsDir(root), todayDirName()))
  const dir = await dedupeDir(parent, slugify(name ?? 'new-chat'))
  const chat: ChatEntity = { path: await ensureDir(dir) }
  return { data: [...data, chat], chat }
}

/**
 * 按引用定位对话：精确路径、规范路径、目录名（唯一时）依次尝试
 *
 * @throws {Error} 找不到、或目录名歧义（跨日期重名）时
 */
export async function findChat(data: ChatEntity[], ref: string): Promise<ChatEntity> {
  const trimmed = ref.trim()
  const byPath = data.find(chat => chat.path === trimmed)
  if (byPath)
    return byPath
  const real = await canonicalize(trimmed)
  const byReal = real ? data.find(chat => chat.path === real) : undefined
  if (byReal)
    return byReal
  const byName = data.filter(chat => chat.path.endsWith(`/${trimmed}`))
  if (byName.length === 1)
    return byName[0]!
  if (byName.length > 1)
    throw new Error(`目录名「${trimmed}」在多个日期下存在（${byName.map(c => c.path).join('、')}），请用完整路径引用`)
  throw new Error(`没有这个对话：${ref}`)
}

/** 写入核心工作区行绑定（建目录登记后由 host 层以精确路径调用；幂等覆写） */
export function bindChatWorkspaceId(data: ChatEntity[], path: string, workspaceId: string): { data: ChatEntity[], chat: ChatEntity } {
  const next: ChatEntity = { path, workspaceId }
  return { data: data.map(item => (item.path === path ? next : item)), chat: next }
}

/** 删除对话的注册表记录（磁盘目录与核心行不动，与 dropSpace 同口径） */
export async function dropChat(data: ChatEntity[], ref: string): Promise<{ data: ChatEntity[], chat: ChatEntity }> {
  const chat = await findChat(data, ref)
  return { data: data.filter(item => item.path !== chat.path), chat }
}
