import type { SpaceFileData, SpaceProject } from './types.ts'
// @env node
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { parseDocument } from 'yaml'
import { SPACE_FILE } from './constants.ts'

/** space.yaml 的校验失败：issues 汇总全部问题，一次报完 */
export class SpaceFileError extends Error {
  readonly issues: string[]

  constructor(filePath: string, issues: string[]) {
    super(`${filePath}: ${issues.join('; ')}`)
    this.name = 'SpaceFileError'
    this.issues = issues
  }
}

/** 把成员路径归一为相对壳根的 POSIX 形态；无法归一（绝对路径/越出壳根）时返回 undefined */
export function normalizeProjectPath(raw: unknown): string | undefined {
  if (typeof raw !== 'string')
    return undefined
  const trimmed = raw.trim().replaceAll('\\', '/').replace(/\/+$/, '')
  if (!trimmed || trimmed.startsWith('/') || /^[A-Z]:\//i.test(trimmed))
    return undefined
  const segments = trimmed.split('/')
  const out: string[] = []
  for (const seg of segments) {
    if (!seg || seg === '.')
      continue
    if (seg === '..') {
      if (out.length === 0)
        return undefined
      out.pop()
      continue
    }
    out.push(seg)
  }
  return out.length > 0 ? out.join('/') : undefined
}

function parseProject(raw: unknown, index: number, issues: string[]): SpaceProject | undefined {
  if (typeof raw !== 'object' || raw === null) {
    issues.push(`projects[${index}] 不是对象`)
    return undefined
  }
  const record = raw as Record<string, unknown>
  const path = normalizeProjectPath(record.path)
  if (!path) {
    issues.push(`projects[${index}].path 缺失、不是字符串、或为越出壳根的绝对/相对路径`)
    return undefined
  }
  const project: SpaceProject = { path }
  if (record.title !== undefined) {
    if (typeof record.title !== 'string' || !record.title.trim()) {
      issues.push(`projects[${index}].title 不是非空字符串，已忽略`)
    }
    else {
      project.title = record.title.trim()
    }
  }
  if (record.desc !== undefined) {
    if (typeof record.desc !== 'string' || !record.desc.trim()) {
      issues.push(`projects[${index}].desc 不是非空字符串，已忽略`)
    }
    else {
      project.desc = record.desc.trim()
    }
  }
  return project
}

/**
 * 解析并校验 space.yaml 文本
 *
 * @param text 文件原文
 * @param filePath 仅用于错误信息定位
 * @throws {SpaceFileError} 结构或字段校验失败，issues 汇总全部问题
 */
export function parseSpaceFile(text: string, filePath = SPACE_FILE): SpaceFileData {
  let data: unknown
  try {
    data = parseDocument(text).toJS()
  }
  catch (error) {
    throw new SpaceFileError(filePath, [`YAML 解析失败：${(error as Error).message}`])
  }
  const issues: string[] = []
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new SpaceFileError(filePath, ['顶层必须是 YAML 对象'])

  const { version, name, projects, ...extras } = data as Record<string, unknown>
  if (version !== 1)
    issues.push(`version 必须为 1，实际为 ${JSON.stringify(version)}`)
  if (typeof name !== 'string' || !name.trim())
    issues.push('name 必须是非空字符串')

  const normalizedProjects: SpaceProject[] = []
  const seen = new Set<string>()
  if (projects !== undefined && !Array.isArray(projects))
    issues.push('projects 必须是数组')
  for (const [index, raw] of (Array.isArray(projects) ? projects : []).entries()) {
    const project = parseProject(raw, index, issues)
    if (!project)
      continue
    if (seen.has(project.path)) {
      issues.push(`projects 中路径重复：${project.path}`)
      continue
    }
    seen.add(project.path)
    normalizedProjects.push(project)
  }

  if (issues.length > 0)
    throw new SpaceFileError(filePath, issues)
  return { version: 1, name: (name as string).trim(), projects: normalizedProjects, extras }
}

export function serializeSpaceFile(file: SpaceFileData): string {
  const lines: string[] = [
    '# dsh-space 多项目空间描述文件。被 dsh-space 插件读写；手工编辑时请保持 schema。',
    `version: 1`,
    `name: ${yamlScalar(file.name)}`,
  ]
  for (const [key, value] of Object.entries(file.extras))
    lines.push(`${key}: ${yamlScalar(value)}`)
  // 空数组必须写成行内 `[]`：裸键加注释行会被 YAML 解析为 null，回填时校验失败
  if (file.projects.length === 0) {
    lines.push('projects: []')
    return `${lines.join('\n')}\n`
  }
  lines.push('projects:')
  for (const project of file.projects) {
    lines.push(`  - path: ${project.path}`)
    if (project.title !== undefined)
      lines.push(`    title: ${yamlScalar(project.title)}`)
    if (project.desc !== undefined)
      lines.push(`    desc: ${yamlScalar(project.desc)}`)
  }
  return `${lines.join('\n')}\n`
}

/** JSON 字符串字面量恰好是合法的 YAML 双引号标量，借它免去手写转义 */
function yamlScalar(value: unknown): string {
  return JSON.stringify(value ?? '')
}

export async function loadSpaceFile(root: string): Promise<SpaceFileData> {
  const filePath = `${root}/${SPACE_FILE}`
  return parseSpaceFile(await readFile(filePath, 'utf8'), filePath)
}

export async function saveSpaceFile(root: string, file: SpaceFileData): Promise<void> {
  await mkdir(dirname(`${root}/${SPACE_FILE}`), { recursive: true })
  await writeFile(`${root}/${SPACE_FILE}`, serializeSpaceFile(file), 'utf8')
}
