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
import { canonicalize } from '../shared/fs-path.ts'
import { assertFsSafeName, ensureDir, spacesDir } from '../shared/paths.ts'

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
 * 创建空间：在托管根下建壳目录（spaces/<名称>/projects/）
 *
 * @description 建目录与建实体一体完成；名称同时是壳目录名，须为合法目录名且不与既有空间重名；
 * 核心工作区行的登记与绑定由 host 层接续完成
 *
 * @throws {SpaceOpError} 名称非法/重名、壳目录已存在
 */
export async function createSpace(data: SpaceEntity[], name: string, root: string, firstFolderPath?: string): Promise<{ data: SpaceEntity[], space: SpaceEntity }> {
  let safeName: string
  try {
    safeName = assertFsSafeName(name)
  }
  catch (error) {
    throw new SpaceOpError((error as Error).message)
  }
  if (data.some(space => space.name === safeName))
    throw new SpaceOpError(`空间「${safeName}」已存在`)

  const shell = join(spacesDir(root), safeName)
  if (await canonicalize(shell))
    throw new SpaceOpError(`壳目录已存在：${shell}`)
  await ensureDir(join(shell, SHELL_PROJECTS_DIR))

  const space: SpaceEntity = { id: newSpaceId(), name: safeName, shell, folders: [] }
  let next = [...data, space]
  if (firstFolderPath !== undefined)
    next = (await attachFolder(next, safeName, firstFolderPath)).data
  return { data: next, space: findSpace(next, safeName) }
}

/** attach 的公共校验：存在、是目录（成员可属于多个空间——归属歧义由 resolve/注入侧如实呈现） */
async function prepareFolder(rawPath: string): Promise<{ real: string }> {
  const real = await canonicalize(rawPath)
  if (!real)
    throw new SpaceOpError(`目录不存在：${rawPath}`)
  if (!(await stat(real)).isDirectory())
    throw new SpaceOpError(`不是目录：${rawPath}`)
  return { real }
}

/**
 * 挂入文件夹
 *
 * @description
 * - reference（默认）：只登记真实路径，磁盘完全不动
 * - link（显式选择）：symlink 到壳内 projects/<目录名>，可用 options.name 改链接名
 * - 首个成员自动成为主成员
 *
 * @throws {SpaceOpError} 目录无效、同空间重复、显示名撞车、无壳空间被要求 link、壳内重名链接
 */
export async function attachFolder(data: SpaceEntity[], spaceRef: string, rawPath: string, options: { mode?: 'link' | 'reference', name?: string, title?: string, desc?: string } = {}): Promise<{ data: SpaceEntity[], space: SpaceEntity, folder: SpaceFolder }> {
  const space = findSpace(data, spaceRef)
  const { real } = await prepareFolder(rawPath)
  // 多重归属指跨空间；同一空间内同路径重复是纯垃圾数据
  if (space.folders.some(folder => folder.path === real))
    throw new SpaceOpError(`该目录已在空间「${space.name}」中，无需重复挂入`)

  // 默认 reference（零磁盘侵入）；link 需显式选择
  const mode = options.mode ?? 'reference'
  const folder: SpaceFolder = { path: real, mode }
  if (mode === 'link') {
    if (!space.shell)
      throw new SpaceOpError('该空间没有壳目录，只支持 reference 模式')
    const linkName = options.name?.trim() || basename(real)
    const linkPath = join(space.shell, SHELL_PROJECTS_DIR, linkName)
    if (await canonicalize(linkPath))
      throw new SpaceOpError(`壳内已有同名链接：${linkPath}（可用 name 指定另一个链接名）`)
    await symlink(real, linkPath, 'dir')
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

/**
 * 空间的有效路径：与核心工作区唯一对应的那条目录
 *
 * @description 壳优先；无壳时主成员兜底（无壳形态的正向表达——它就是该形态下的锚）；
 * 连主成员也没有时取数组首位。链上各级彼此独立成立，不依赖数组顺序
 */
export function effectivePath(space: SpaceEntity): string | undefined {
  return space.shell ?? space.primary ?? space.folders[0]?.path
}

/** 写入核心工作区行绑定（建壳登记后由 host 层调用；幂等覆写） */
export function bindWorkspaceId(data: SpaceEntity[], spaceRef: string, workspaceId: string): { data: SpaceEntity[], space: SpaceEntity } {
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
