import type { MemberData, SpaceData, SpaceSettings } from './types.ts'
import { isAbsolute } from 'node:path'
import { assertPathSegment } from '../shared/paths.ts'
import { assertMemberReferences } from './member.ts'

const MEMBER_KEYS = new Set(['path', 'mode', 'linkName', 'title', 'description'])
const SPACE_KEYS = new Set(['workspaceId', 'primary', 'members'])
const CHAT_KEYS = new Set(['workspaceId'])
const SETTINGS_KEYS = new Set(['root', 'spaces', 'chats'])

function rejectUnknown(value: Record<string, unknown>, allowed: Set<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key))
      throw new Error(`${label}包含未知字段：${key}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label}必须是非空字符串`)
  return value
}

function validateMember(value: unknown, index: number): MemberData {
  if (!isRecord(value))
    throw new Error(`成员 ${index + 1} 不是对象`)
  rejectUnknown(value, MEMBER_KEYS, `成员 ${index + 1} `)
  const path = requiredString(value.path, `成员 ${index + 1} 的 path`)
  if (!isAbsolute(path))
    throw new Error(`成员 ${index + 1} 的 path 必须是绝对路径：${path}`)
  const mode = value.mode
  if (mode !== 'reference' && mode !== 'link')
    throw new Error(`成员 ${index + 1} 的 mode 无效`)
  if (value.linkName !== undefined && typeof value.linkName !== 'string')
    throw new Error(`成员 ${index + 1} 的 linkName 无效`)
  if (value.linkName !== undefined)
    assertPathSegment(requiredString(value.linkName, `成员 ${index + 1} 的 linkName`))
  if (mode === 'reference' && value.linkName !== undefined)
    throw new Error(`reference 成员不能设置 linkName：${path}`)
  if (value.title !== undefined && typeof value.title !== 'string')
    throw new Error(`成员 ${index + 1} 的 title 无效`)
  if (value.description !== undefined && typeof value.description !== 'string')
    throw new Error(`成员 ${index + 1} 的 description 无效`)
  return {
    path,
    mode,
    ...(typeof value.linkName === 'string' ? { linkName: value.linkName } : {}),
    ...(typeof value.title === 'string' ? { title: value.title } : {}),
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
  }
}

function validateSpace(value: unknown, index: number): SpaceData {
  if (!isRecord(value))
    throw new Error(`空间记录 ${index + 1} 不是对象`)
  rejectUnknown(value, SPACE_KEYS, `空间记录 ${index + 1} `)
  const workspaceId = requiredString(value.workspaceId, `空间记录 ${index + 1} 的 workspaceId`)
  if (!Array.isArray(value.members))
    throw new Error(`空间记录 ${index + 1} 的 members 必须是数组`)
  const members = value.members.map((member, memberIndex) => validateMember(member, memberIndex))
  assertMemberReferences(members)
  const paths = new Set(members.map(member => member.path))
  if (value.primary !== undefined) {
    const primary = requiredString(value.primary, `空间记录 ${index + 1} 的 primary`)
    if (!paths.has(primary))
      throw new Error(`空间记录 ${workspaceId} 的 primary 不是成员路径：${primary}`)
  }
  return {
    workspaceId,
    ...(typeof value.primary === 'string' ? { primary: value.primary } : {}),
    members,
  }
}

function validateChat(value: unknown, index: number): { workspaceId: string } {
  if (!isRecord(value))
    throw new Error(`对话记录 ${index + 1} 不是对象`)
  rejectUnknown(value, CHAT_KEYS, `对话记录 ${index + 1} `)
  return { workspaceId: requiredString(value.workspaceId, `对话记录 ${index + 1} 的 workspaceId`) }
}

/** 校验设置边界；不会迁移或猜测任何旧记录 */
export function validateSettings(value: unknown): SpaceSettings {
  if (!isRecord(value))
    throw new Error('dsh-space 设置必须是对象')
  rejectUnknown(value, SETTINGS_KEYS, 'dsh-space 设置 ')
  if (value.root !== undefined && typeof value.root !== 'string')
    throw new Error('dsh-space 的 root 必须是字符串')
  if (!Array.isArray(value.spaces))
    throw new Error('dsh-space 的 spaces 必须是数组')
  if (!Array.isArray(value.chats))
    throw new Error('dsh-space 的 chats 必须是数组')

  const spaces = value.spaces.map(validateSpace)
  const chats = value.chats.map(validateChat)
  const owners = new Set<string>()
  for (const space of spaces) {
    if (owners.has(space.workspaceId))
      throw new Error(`核心工作区 ${space.workspaceId} 不能同时拥有多个插件描述`)
    owners.add(space.workspaceId)
  }
  for (const chat of chats) {
    if (owners.has(chat.workspaceId))
      throw new Error(`核心工作区 ${chat.workspaceId} 不能同时拥有多个插件描述`)
    owners.add(chat.workspaceId)
  }
  return {
    root: value.root === undefined ? '' : value.root,
    spaces,
    chats,
  }
}
