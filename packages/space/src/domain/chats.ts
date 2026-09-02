import type { ChatEntity } from './types.ts'
import { join } from 'node:path'
import { canonicalize } from '../shared/fs-path.ts'
import { chatsDir, dedupeDir, ensureDir, slugify, todayDirName } from '../shared/paths.ts'

/**
 * 建立对话目录：chats/<本地日期>/<slug>，重名加 -2 序号
 *
 * @description 只负责文件系统目录；核心登记成功后再由 {@link createChatEntity} 建立附加记录
 */
export async function createChatDirectory(root: string, name?: string): Promise<string> {
  const parent = await ensureDir(join(chatsDir(root), todayDirName()))
  const dir = await dedupeDir(parent, slugify(name ?? 'new-chat'))
  return ensureDir(dir)
}

/** 建立已完成核心登记的对话实体 */
export function createChatEntity(data: ChatEntity[], path: string, workspaceId: string): { data: ChatEntity[], chat: ChatEntity } {
  const chat: ChatEntity = { path, workspaceId }
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

/** 更新核心工作区绑定，用于核心行被外部删除后的显式修复 */
export function replaceChatWorkspaceId(data: ChatEntity[], path: string, workspaceId: string): { data: ChatEntity[], chat: ChatEntity } {
  const next: ChatEntity = { path, workspaceId }
  return { data: data.map(item => (item.path === path ? next : item)), chat: next }
}

/** 删除对话的注册表记录（磁盘目录与核心行不动，与 dropSpace 同口径） */
export async function dropChat(data: ChatEntity[], ref: string): Promise<{ data: ChatEntity[], chat: ChatEntity }> {
  const chat = await findChat(data, ref)
  return { data: data.filter(item => item.path !== chat.path), chat }
}
