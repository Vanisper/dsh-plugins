import type { ProjectStatus, SandboxModeName, SpaceFileData, SpaceProject } from './types.ts'
// @env node
import { execFile } from 'node:child_process'
import { mkdir, stat, symlink, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { promisify } from 'node:util'
import { PROJECTS_DIR } from './constants.ts'
import { canonicalize, isUnder } from './locate.ts'
import { loadSpaceFile, normalizeProjectPath, saveSpaceFile } from './space-file.ts'

const execFileAsync = promisify(execFile)

export type ExecGit = (args: string[], cwd: string) => Promise<void>

const defaultExecGit: ExecGit = async (args, cwd) => {
  await execFileAsync('git', args, { cwd })
}

/** 空间操作的预期内失败（目标已存在、目录无效等），message 直接面向调用者 */
export class SpaceOpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SpaceOpError'
  }
}

/** 在 cwd 建立空间骨架：space.yaml + projects/。已存在 space.yaml 时拒绝，绝不覆盖 */
export async function initSpace(cwd: string, name?: string): Promise<SpaceFileData> {
  const root = await canonicalize(cwd)
  if (!root)
    throw new SpaceOpError(`目录不存在：${cwd}`)
  const existing = await loadSpaceFile(root).catch(() => undefined)
  if (existing)
    throw new SpaceOpError(`该目录已是多项目空间「${existing.name}」（space.yaml 已存在）`)
  const file: SpaceFileData = { version: 1, name: name?.trim() || basename(root), projects: [], extras: {} }
  await saveSpaceFile(root, file)
  await mkdir(join(root, PROJECTS_DIR), { recursive: true })
  await writeFile(join(root, PROJECTS_DIR, '.gitkeep'), '', 'utf8')
  return file
}

function isGitUrl(target: string): boolean {
  // SCP 风格的 SSH 地址（git@host:path）没有协议头，单独判；字符类排除分隔符以免歧义回溯
  return /^\w[\w+-]*:\/\//.test(target) || /^[^/@]+@[^/:]+:/.test(target) || target.endsWith('.git')
}

function projectNameFromTarget(target: string): string {
  const trimmed = target.replace(/[/\\]+$/, '')
  const base = basename(trimmed).replace(/\.git$/, '')
  if (!base)
    throw new SpaceOpError(`无法从 ${target} 推断项目名，请显式提供 name`)
  return base
}

/**
 * 挂载项目到壳内 projects/
 *
 * @description
 * - git URL 走 clone，本机目录走 symlink
 * - symlink 成员的真实路径在壳外：workspace-write 模式下写入会被沙盒拒绝（realpath 判定），doctor 会如实报告
 *
 * @param root 壳根规范路径
 * @param target git URL 或本机目录路径
 * @param options 挂载选项
 * @param options.name 壳内目录名（projects/<name>），缺省从 target 推断
 * @param options.title 显示名，写入 space.yaml；缺省时显示端以目录名兜底
 * @param execGit git 执行器，测试中可注入替身
 * @throws {SpaceOpError} 目标已存在、clone 失败或本机目录无效
 */
export async function mountProject(
  root: string,
  target: string,
  options: { name?: string, title?: string } = {},
  execGit: ExecGit = defaultExecGit,
): Promise<SpaceProject> {
  const file = await loadSpaceFile(root)
  const projectName = options.name?.trim() || projectNameFromTarget(target)
  const relPath = `${PROJECTS_DIR}/${projectName}`
  if (file.projects.some(p => p.path === relPath))
    throw new SpaceOpError(`项目已在空间中：${relPath}`)

  const absPath = join(root, relPath)
  if (await canonicalize(absPath))
    throw new SpaceOpError(`目标路径已存在：${absPath}（如需纳入请用 unmount 后手工处理）`)

  if (isGitUrl(target)) {
    await mkdir(join(root, PROJECTS_DIR), { recursive: true })
    try {
      await execGit(['clone', target, relPath], root)
    }
    catch (error) {
      throw new SpaceOpError(`git clone 失败：${(error as Error).message}`)
    }
  }
  else {
    const real = await canonicalize(target)
    if (!real)
      throw new SpaceOpError(`本机目录不存在：${target}`)
    if (!(await stat(real)).isDirectory())
      throw new SpaceOpError(`不是目录：${target}`)
    await mkdir(join(root, PROJECTS_DIR), { recursive: true })
    await symlink(real, absPath, 'dir')
  }

  const project: SpaceProject = { path: relPath }
  const title = options.title?.trim()
  if (title)
    project.title = title
  file.projects.push(project)
  await saveSpaceFile(root, file)
  return project
}

function findProject(file: SpaceFileData, ref: string): SpaceProject {
  const normalized = normalizeProjectPath(ref)
  const hit = file.projects.find(p => p.path === normalized || p.title === ref || basename(p.path) === ref)
  if (!hit)
    throw new SpaceOpError(`空间中没有项目「${ref}」（现有：${file.projects.map(p => p.path).join('、') || '无'}）`)
  return hit
}

/** 解除挂载：只改 space.yaml，绝不触碰磁盘上的项目文件 */
export async function unmountProject(root: string, ref: string): Promise<SpaceProject> {
  const file = await loadSpaceFile(root)
  const hit = findProject(file, ref)
  file.projects = file.projects.filter(p => p !== hit)
  await saveSpaceFile(root, file)
  return hit
}

/** 设置/清除项目的一句话说明（空串视为清除），注入空间地图供模型定位 */
export async function setProjectDesc(root: string, ref: string, desc: string): Promise<SpaceProject> {
  const file = await loadSpaceFile(root)
  const hit = findProject(file, ref)
  const trimmed = desc.trim()
  if (trimmed)
    hit.desc = trimmed
  else
    delete hit.desc
  await saveSpaceFile(root, file)
  return hit
}

/** 盘点：space.yaml 条目逐个落到磁盘状态 */
export async function listSpace(root: string): Promise<ProjectStatus[]> {
  const file = await loadSpaceFile(root)
  const statuses: ProjectStatus[] = []
  for (const project of file.projects) {
    const absPath = join(root, project.path)
    const realPath = await canonicalize(absPath)
    let health: ProjectStatus['health'] = 'ok'
    if (!realPath)
      health = 'missing'
    else if (!isUnder(realPath, root))
      health = 'outside-shell'
    statuses.push({ ...project, absPath, realPath, health })
  }
  return statuses
}

export interface DoctorReport {
  root: string
  /** 无法从宿主解析沙盒策略时为 'unknown'，此时 writable 为 null（未知而非放行） */
  mode: SandboxModeName | 'unknown'
  sessionCwd: string
  projects: (ProjectStatus & { writable: boolean | null })[]
}

/**
 * 逐项目诊断存在性与当前会话沙盒模式下的可写性
 *
 * @description 读取永不受沙盒限制；写入仅当 danger-full-access 或 realpath 落在会话 cwd 之内
 */
export async function doctorSpace(root: string, sessionCwd: string, mode: SandboxModeName | 'unknown'): Promise<DoctorReport> {
  const sessionReal = await canonicalize(sessionCwd)
  const projects = await listSpace(root)
  return {
    root,
    mode,
    sessionCwd: sessionReal ?? sessionCwd,
    projects: projects.map(project => ({
      ...project,
      writable: project.health === 'missing'
        ? false
        : mode === 'danger-full-access'
          ? true
          : mode === 'workspace-write'
            ? sessionReal !== undefined && isUnder(project.realPath!, sessionReal)
            : mode === 'read-only'
              ? false
              : null,
    })),
  }
}
