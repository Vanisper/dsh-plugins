// ============================================================
// 空间与成员的域操作
// ------------------------------------------------------------
// - 全部为「读数据 → 纯函数改写 → 返回新数组」形态，持久化由 store 层负责
// - 只有校验/挂载需要碰磁盘（canonicalize、symlink）；摘除只动注册表与自建 symlink
// ============================================================
import type { FolderStatus, SpaceEntity, SpaceFolder } from './types.ts'
import { lstat, rm, stat, symlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { SHELL_PROJECTS_DIR } from '../shared/constants.ts'
import { canonicalize, isUnder } from '../shared/fs-path.ts'
import { assertFsSafeName, assertSafePathSegment } from '../shared/paths.ts'

/** 空间操作的预期内失败（名称冲突、目录无效等），message 直接面向调用者 */
export class SpaceOpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpaceOpError'
  }
}

/** 文件夹的身份键：引用匹配与 title 冲突校验共用同一组口径，防止两套规则漂移 */
function folderIdentityKeys(folder: SpaceFolder): string[] {
  return [folder.path, basename(folder.path), ...(folder.title ? [folder.title] : [])]
}

/** 按 id 或名称定位空间 */
export function findSpace(data: SpaceEntity[], ref: string): SpaceEntity {
  const hit = data.find(space => space.id === ref || space.name === ref.trim())
  if (!hit)
    throw new SpaceOpError(`没有空间「${ref}」（现有：${data.map(s => s.name).join('、') || '无'}）`)
  return hit
}

/**
 * 按引用定位成员文件夹
 *
 * @description 依次尝试精确路径、title、目录名；都不中且引用像路径时，canonicalize 后再比一次
 */
export async function findFolder(space: SpaceEntity, ref: string): Promise<SpaceFolder> {
  const syncHits = space.folders.filter(folder => folderIdentityKeys(folder).includes(ref))
  if (syncHits.length === 1)
    return syncHits[0]!
  if (syncHits.length > 1)
    throw new SpaceOpError(`成员引用「${ref}」命中多个目录（${syncHits.map(folder => folder.path).join('、')}），请使用完整路径`)
  const asPath = await canonicalize(ref)
  const pathHit = asPath ? space.folders.find(folder => folder.path === asPath) : undefined
  if (!pathHit)
    throw new SpaceOpError(`空间「${space.name}」中没有成员「${ref}」（现有：${space.folders.map(f => f.path).join('、') || '无'}）`)
  return pathHit
}

function assertUniqueTitle(space: SpaceEntity, title: string): void {
  const conflict = space.folders.find(folder => folderIdentityKeys(folder).includes(title))
  if (conflict)
    throw new SpaceOpError(`显示名「${title}」与现有成员 ${conflict.path} 冲突，请换一个`)
}

function newSpaceId(): string {
  return `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

/**
 * 建立已完成核心登记的空间实体
 *
 * @description 文件系统建壳与核心登记由上层统一操作模块完成；领域层只接收完整绑定，
 * 因此不会产生无壳或未绑定的运行时实体
 *
 * @throws {SpaceOpError} 名称非法或重名
 */
export function createSpaceEntity(data: SpaceEntity[], name: string, shell: string, workspaceId: string): { data: SpaceEntity[], space: SpaceEntity } {
  let safeName: string
  try {
    safeName = assertFsSafeName(name)
  }
  catch (error) {
    throw new SpaceOpError((error as Error).message)
  }
  if (data.some(space => space.name === safeName))
    throw new SpaceOpError(`空间「${safeName}」已存在`)
  const space: SpaceEntity = { id: newSpaceId(), name: safeName, shell, workspaceId, folders: [] }
  return { data: [...data, space], space }
}

/** attach 的公共校验：存在且是目录；成员可独立属于多个工作区 */
export async function canonicalFolderPath(rawPath: string): Promise<string> {
  const real = await canonicalize(rawPath)
  if (!real)
    throw new SpaceOpError(`目录不存在：${rawPath}`)
  if (!(await stat(real)).isDirectory())
    throw new SpaceOpError(`不是目录：${rawPath}`)
  return real
}

/**
 * 挂入文件夹
 *
 * @description
 * - reference（默认）：只登记真实路径，磁盘完全不动
 * - link（显式选择）：symlink 到壳内 projects/<目录名>，可用 options.name 改链接名
 * - 首个成员自动成为主成员
 *
 * @throws {SpaceOpError} 目录无效、同空间重复、显示名撞车、链接名不安全、壳内重名链接
 */
export async function attachFolder(data: SpaceEntity[], spaceRef: string, rawPath: string, options: { mode?: 'link' | 'reference', name?: string, title?: string, desc?: string } = {}): Promise<{ data: SpaceEntity[], space: SpaceEntity, folder: SpaceFolder }> {
  const space = findSpace(data, spaceRef)
  const real = await canonicalFolderPath(rawPath)
  // 多重归属指跨空间；同一空间内同路径重复是纯垃圾数据
  if (space.folders.some(folder => folder.path === real))
    throw new SpaceOpError(`该目录已在空间「${space.name}」中，无需重复挂入`)

  // 默认 reference（零磁盘侵入）；link 需显式选择
  const mode = options.mode ?? 'reference'
  if (mode === 'reference' && options.name !== undefined)
    throw new SpaceOpError('name 只用于 link 模式的壳内链接名')
  const folder: SpaceFolder = { path: real, mode }
  if (mode === 'link') {
    let linkName: string
    try {
      linkName = assertSafePathSegment(options.name?.trim() || basename(real))
    }
    catch (error) {
      throw new SpaceOpError((error as Error).message)
    }
    const projectsRoot = join(space.shell, SHELL_PROJECTS_DIR)
    const linkPath = join(projectsRoot, linkName)
    if (!isUnder(linkPath, projectsRoot))
      throw new SpaceOpError(`链接路径逃逸壳目录：${linkPath}`)
    const existing = await lstat(linkPath).catch(() => undefined)
    if (existing) {
      const sameTarget = existing.isSymbolicLink() && await canonicalize(linkPath) === real
      if (!sameTarget)
        throw new SpaceOpError(`壳内已有同名链接：${linkPath}（可用 name 指定另一个链接名）`)
    }
    else {
      await symlink(real, linkPath, 'dir')
    }
    folder.linkPath = linkPath
  }
  const title = options.title?.trim()
  if (title) {
    assertUniqueTitle(space, title)
    folder.title = title
  }
  const desc = options.desc?.trim()
  if (desc)
    folder.desc = desc

  const next: SpaceEntity = {
    ...space,
    folders: [...space.folders, folder],
    primary: space.primary ?? folder.path,
  }
  return { data: data.map(item => (item.id === space.id ? next : item)), space: next, folder }
}

/**
 * 摘除文件夹
 *
 * @description link 模式连带删除壳内 symlink（插件自建产物，删除前校验确为符号链接）；
 * 成员真实目录永远不动；摘除主成员时回退为剩余首位
 */
export async function detachFolder(data: SpaceEntity[], spaceRef: string, folderRef: string): Promise<{ data: SpaceEntity[], space: SpaceEntity, folder: SpaceFolder }> {
  const space = findSpace(data, spaceRef)
  const folder = await findFolder(space, folderRef)
  if (folder.mode === 'link' && folder.linkPath) {
    const projectsRoot = join(space.shell, SHELL_PROJECTS_DIR)
    if (!isUnder(folder.linkPath, projectsRoot))
      throw new SpaceOpError(`拒绝删除壳外链接：${folder.linkPath}`)
    const linkStat = await lstat(folder.linkPath).catch(() => undefined)
    if (linkStat?.isSymbolicLink())
      await rm(folder.linkPath)
  }
  const folders = space.folders.filter(item => item !== folder)
  const next: SpaceEntity = { ...space, folders }
  if (next.primary === folder.path)
    next.primary = folders[0]?.path
  return { data: data.map(item => (item.id === space.id ? next : item)), space: next, folder }
}

/** 更新核心工作区绑定，用于核心行被外部删除后的显式修复 */
export function replaceWorkspaceId(data: SpaceEntity[], spaceRef: string, workspaceId: string): { data: SpaceEntity[], space: SpaceEntity } {
  const space = findSpace(data, spaceRef)
  const next: SpaceEntity = { ...space, workspaceId }
  return { data: data.map(item => (item.id === space.id ? next : item)), space: next }
}

/**
 * 设置主成员
 *
 * @description 纯字段设置——不联动排序；「primary 排首位」只是前端当前的展示倾向，
 * 将来可改向且数据层零牵连
 */
export async function setPrimary(data: SpaceEntity[], spaceRef: string, folderRef: string): Promise<{ data: SpaceEntity[], space: SpaceEntity }> {
  const space = findSpace(data, spaceRef)
  const folder = await findFolder(space, folderRef)
  const next: SpaceEntity = { ...space, primary: folder.path }
  return { data: data.map(item => (item.id === space.id ? next : item)), space: next }
}

/** 设置/清除成员显示名（空串视为清除）；设置时校验不撞其他成员身份键 */
export async function setFolderTitle(data: SpaceEntity[], spaceRef: string, folderRef: string, title: string): Promise<{ data: SpaceEntity[], folder: SpaceFolder }> {
  const space = findSpace(data, spaceRef)
  const folder = await findFolder(space, folderRef)
  const trimmed = title.trim()
  const nextFolder: SpaceFolder = { ...folder }
  if (trimmed) {
    const others: SpaceEntity = { ...space, folders: space.folders.filter(item => item !== folder) }
    assertUniqueTitle(others, trimmed)
    nextFolder.title = trimmed
  }
  else {
    delete nextFolder.title
  }
  const next: SpaceEntity = { ...space, folders: space.folders.map(item => (item === folder ? nextFolder : item)) }
  return { data: data.map(item => (item.id === space.id ? next : item)), folder: nextFolder }
}

/** 设置/清除成员说明（空串视为清除） */
export async function setFolderDesc(data: SpaceEntity[], spaceRef: string, folderRef: string, desc: string): Promise<{ data: SpaceEntity[], folder: SpaceFolder }> {
  const space = findSpace(data, spaceRef)
  const folder = await findFolder(space, folderRef)
  const trimmed = desc.trim()
  const nextFolder: SpaceFolder = { ...folder }
  if (trimmed)
    nextFolder.desc = trimmed
  else
    delete nextFolder.desc
  const next: SpaceEntity = { ...space, folders: space.folders.map(item => (item === folder ? nextFolder : item)) }
  return { data: data.map(item => (item.id === space.id ? next : item)), folder: nextFolder }
}

/**
 * 删除空间实体
 *
 * @description 只删注册表记录；壳目录与成员的物理清理由用户确认后另行进行，绝不在此联动
 */
export function dropSpace(data: SpaceEntity[], spaceRef: string): { data: SpaceEntity[], space: SpaceEntity } {
  const space = findSpace(data, spaceRef)
  return { data: data.filter(item => item.id !== space.id), space }
}

/** 盘点：逐成员落存在性与 link 健康度 */
export async function listFolders(space: SpaceEntity): Promise<FolderStatus[]> {
  return Promise.all(space.folders.map(async (folder): Promise<FolderStatus> => {
    const health = (await canonicalize(folder.path)) ? 'ok' : 'missing'
    let linkHealth: FolderStatus['linkHealth'] = 'none'
    if (folder.mode === 'link' && folder.linkPath) {
      const linkStat = await lstat(folder.linkPath).catch(() => undefined)
      const targetOk = linkStat?.isSymbolicLink()
        && (await canonicalize(folder.linkPath).catch(() => undefined)) === folder.path
      linkHealth = targetOk ? 'ok' : 'broken'
    }
    return { ...folder, health, linkHealth }
  }))
}
