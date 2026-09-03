import type { MemberData, SpaceData } from './types.ts'
import { lstat, mkdir, readlink, rm, symlink } from 'node:fs/promises'
import { basename, isAbsolute, join } from 'node:path'
import { PROJECTS_DIR } from '../shared/constants.ts'
import { canonicalize, isUnder } from '../shared/fs-path.ts'
import { assertPathSegment } from '../shared/paths.ts'

export interface MemberInput {
  path: string
  mode?: 'reference' | 'link'
  linkName?: string
  title?: string
  description?: string
}

export class MemberError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MemberError'
  }
}

/** 将输入目录规范化为现有目录，不创建用户选择的成员目录 */
export async function existingDirectory(rawPath: string): Promise<string> {
  const path = await canonicalize(rawPath.trim())
  if (!path)
    throw new MemberError(`目录不存在：${rawPath}`)
  const stat = await lstat(path)
  if (!stat.isDirectory())
    throw new MemberError(`不是目录：${rawPath}`)
  return path
}

function cleanOptional(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed || undefined
}

/** 生成不含派生 linkPath 的插件成员描述 */
export function memberData(input: MemberInput, path: string): MemberData {
  const mode = input.mode ?? 'reference'
  if (mode !== 'reference' && mode !== 'link')
    throw new MemberError(`成员 mode 无效：${mode}`)
  if (mode === 'reference' && input.linkName !== undefined)
    throw new MemberError('reference 成员不能设置 linkName')
  const linkName = mode === 'link'
    ? assertPathSegment(input.linkName?.trim() || basename(path))
    : undefined
  const title = cleanOptional(input.title)
  const description = cleanOptional(input.description)
  return {
    path,
    mode,
    ...(linkName ? { linkName } : {}),
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
  }
}

function linkPath(workspacePath: string, member: MemberData): string | undefined {
  return member.mode === 'link' && member.linkName
    ? join(workspacePath, PROJECTS_DIR, member.linkName)
    : undefined
}

/** 创建或确认一个由插件拥有的符号链接 */
export async function ensureMemberLink(workspacePath: string, member: MemberData): Promise<boolean> {
  const target = linkPath(workspacePath, member)
  if (!target)
    return false
  const projectsPath = join(workspacePath, PROJECTS_DIR)
  if (!isUnder(target, projectsPath))
    throw new MemberError(`成员链接不能离开核心工作区目录：${target}`)
  await mkdir(projectsPath, { recursive: true })
  const current = await lstat(target).catch(() => undefined)
  if (current) {
    if (!current.isSymbolicLink())
      throw new MemberError(`链接位置已有非符号链接文件：${target}`)
    const targetPath = await canonicalize(target)
    if (targetPath !== member.path)
      throw new MemberError(`链接位置已指向其他目录：${target}`)
    return false
  }
  await symlink(member.path, target, 'dir')
  return true
}

/** 仅删除与成员描述完全匹配的插件符号链接 */
export async function removeMemberLink(workspacePath: string, member: MemberData): Promise<void> {
  const target = linkPath(workspacePath, member)
  if (!target)
    return
  const projectsPath = join(workspacePath, PROJECTS_DIR)
  if (!isUnder(target, projectsPath))
    return
  const current = await lstat(target).catch(() => undefined)
  if (!current?.isSymbolicLink())
    return
  let targetPath: string | undefined
  try {
    const raw = await readlink(target)
    targetPath = await canonicalize(isAbsolute(raw) ? raw : join(workspacePath, raw))
    if (!targetPath && raw === member.path)
      targetPath = member.path
  }
  catch {
    // 断链时 realpath 失败，下面用链接文本与规范目标再做一次安全比较
    try {
      const raw = await readlink(target)
      targetPath = await canonicalize(join(workspacePath, raw))
      if (!targetPath && raw === member.path)
        targetPath = member.path
    }
    catch {
      return
    }
  }
  if (targetPath === member.path)
    await rm(target)
}

/** 计算供提示词和界面展示的动态链接路径 */
export function memberEntryPath(workspacePath: string, member: MemberData): string {
  return linkPath(workspacePath, member) ?? member.path
}

export function findMember(space: SpaceData, reference: string): MemberData {
  const value = reference.trim()
  const hits = space.members.filter(member => member.path === value || member.title === value || basename(member.path) === value)
  if (hits.length === 1)
    return hits[0]!
  if (hits.length > 1)
    throw new MemberError(`成员引用「${reference}」不唯一，请使用完整路径`)
  throw new MemberError(`空间中没有成员「${reference}」`)
}

export function addMemberData(space: SpaceData, member: MemberData): SpaceData {
  if (space.members.some(item => item.path === member.path))
    throw new MemberError(`该目录已经是成员：${member.path}`)
  return {
    ...space,
    members: [...space.members, member],
    primary: space.primary ?? member.path,
  }
}

export function removeMemberData(space: SpaceData, member: MemberData): SpaceData {
  const members = space.members.filter(item => item !== member)
  const primary = space.primary === member.path ? members[0]?.path : space.primary
  return {
    ...space,
    members,
    ...(primary ? { primary } : { primary: undefined }),
  }
}

export function updateMember(space: SpaceData, oldMember: MemberData, patch: Partial<Pick<MemberData, 'title' | 'description'>>): SpaceData {
  const members = space.members.map((member) => {
    if (member !== oldMember)
      return member
    const next = { ...member }
    if (patch.title !== undefined) {
      const title = patch.title.trim()
      if (title)
        next.title = title
      else
        delete next.title
    }
    if (patch.description !== undefined) {
      const description = patch.description.trim()
      if (description)
        next.description = description
      else
        delete next.description
    }
    return next
  })
  return { ...space, members }
}
