import type { FolderStatus, SandboxModeName, SpaceEntity, SpaceFolder, Writability } from './types.ts'
// @env node
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { canonicalize, isUnder } from './resolve.ts'

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
  const syncHit = space.folders.find(folder => folderIdentityKeys(folder).includes(ref))
  if (syncHit)
    return syncHit
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
 * 创建空间
 *
 * @description 纯注册表操作，不动磁盘；可选地同时挂入首个文件夹（自动成为主成员）
 *
 * @throws {SpaceOpError} 名称为空或与既有空间重名、首个文件夹无效
 */
export async function createSpace(data: SpaceEntity[], name: string, firstFolderPath?: string): Promise<{ data: SpaceEntity[], space: SpaceEntity }> {
  const trimmed = name.trim()
  if (!trimmed)
    throw new SpaceOpError('空间名称不能为空')
  if (data.some(space => space.name === trimmed))
    throw new SpaceOpError(`空间「${trimmed}」已存在`)

  const folders: SpaceFolder[] = []
  if (firstFolderPath !== undefined)
    folders.push(await prepareFolder(data, firstFolderPath))

  const space: SpaceEntity = {
    id: newSpaceId(),
    name: trimmed,
    folders,
    ...(folders[0] ? { primary: folders[0].path } : {}),
  }
  return { data: [...data, space], space }
}

/** attach 的公共校验：存在、是目录、全局唯一（任一空间的成员都不能重复） */
async function prepareFolder(data: SpaceEntity[], rawPath: string): Promise<SpaceFolder> {
  const real = await canonicalize(rawPath)
  if (!real)
    throw new SpaceOpError(`目录不存在：${rawPath}`)
  if (!(await stat(real)).isDirectory())
    throw new SpaceOpError(`不是目录：${rawPath}`)
  const holder = data.find(space => space.folders.some(folder => folder.path === real))
  if (holder)
    throw new SpaceOpError(`该目录已是空间「${holder.name}」的成员，一个文件夹只能属于一个空间`)
  return { path: real }
}

/**
 * 挂入文件夹
 *
 * @description 原地引用：只登记规范路径，磁盘位置不动；首个成员自动成为主成员
 *
 * @throws {SpaceOpError} 目录无效、已被任何空间收录、显示名撞车
 */
export async function attachFolder(data: SpaceEntity[], spaceRef: string, rawPath: string, options: { title?: string, desc?: string } = {}): Promise<{ data: SpaceEntity[], space: SpaceEntity, folder: SpaceFolder }> {
  const space = findSpace(data, spaceRef)
  const folder = await prepareFolder(data, rawPath)
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

/** 摘除文件夹：只改注册表，绝不触碰磁盘；摘除主成员时主成员回退为剩余首位 */
export async function detachFolder(data: SpaceEntity[], spaceRef: string, folderRef: string): Promise<{ data: SpaceEntity[], space: SpaceEntity, folder: SpaceFolder }> {
  const space = findSpace(data, spaceRef)
  const folder = await findFolder(space, folderRef)
  const folders = space.folders.filter(item => item !== folder)
  const next: SpaceEntity = { ...space, folders }
  if (next.primary === folder.path)
    next.primary = folders[0]?.path
  return { data: data.map(item => (item.id === space.id ? next : item)), space: next, folder }
}

/** 设置主成员 */
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
  const nextFolder: SpaceFolder = { path: folder.path, ...(folder.desc ? { desc: folder.desc } : {}) }
  if (trimmed) {
    const others: SpaceEntity = { ...space, folders: space.folders.filter(item => item !== folder) }
    assertUniqueTitle(others, trimmed)
    nextFolder.title = trimmed
  }
  const next: SpaceEntity = { ...space, folders: space.folders.map(item => (item === folder ? nextFolder : item)) }
  return { data: data.map(item => (item.id === space.id ? next : item)), folder: nextFolder }
}

/** 设置/清除成员说明（空串视为清除） */
export async function setFolderDesc(data: SpaceEntity[], spaceRef: string, folderRef: string, desc: string): Promise<{ data: SpaceEntity[], folder: SpaceFolder }> {
  const space = findSpace(data, spaceRef)
  const folder = await findFolder(space, folderRef)
  const trimmed = desc.trim()
  const nextFolder: SpaceFolder = { path: folder.path, ...(folder.title ? { title: folder.title } : {}), ...(trimmed ? { desc: trimmed } : {}) }
  const next: SpaceEntity = { ...space, folders: space.folders.map(item => (item === folder ? nextFolder : item)) }
  return { data: data.map(item => (item.id === space.id ? next : item)), folder: nextFolder }
}

/** 删除空间实体：成员文件夹只解除关联，磁盘不动 */
export function deleteSpace(data: SpaceEntity[], spaceRef: string): { data: SpaceEntity[], space: SpaceEntity } {
  const space = findSpace(data, spaceRef)
  return { data: data.filter(item => item.id !== space.id), space }
}

/** 盘点：逐成员落一次存在性 */
export async function listFolders(space: SpaceEntity): Promise<FolderStatus[]> {
  return Promise.all(space.folders.map(async (folder): Promise<FolderStatus> => ({
    ...folder,
    health: (await canonicalize(folder.path)) ? 'ok' : 'missing',
  })))
}

export interface DoctorReport {
  space: SpaceEntity
  mode: SandboxModeName | 'unknown'
  sessionCwd: string
  folders: (FolderStatus & { writability: Writability | null })[]
}

/**
 * 逐成员诊断存在性与当前会话沙盒模式下的写入可达性
 *
 * @description 读取永不受沙盒限制；写入在 danger-full-access 下全开，
 * workspace-write 下以会话 cwd 子树为界（成员完整落在其中才算可写，cwd 在成员内部则只有该子树可写）
 */
export async function doctorSpace(space: SpaceEntity, sessionCwd: string, mode: SandboxModeName | 'unknown'): Promise<DoctorReport> {
  const sessionReal = await canonicalize(sessionCwd)
  const folders = await listFolders(space)
  return {
    space,
    mode,
    sessionCwd: sessionReal ?? sessionCwd,
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
