import type { SpaceEntity, SpaceFolder } from './types.ts'
// @env node
import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { parseDocument } from 'yaml'
import { LEGACY_SPACE_FILE } from './constants.ts'
import { canonicalize } from './resolve.ts'

interface LegacyProjectEntry {
  path?: unknown
  title?: unknown
  desc?: unknown
}

/**
 * 把一个壳模式条目（壳根路径）转换为项目模式实体
 *
 * @description 壳根成为主成员；space.yaml 里 projects/* 成员解析 symlink 得到真实路径后并入；
 * 壳根目录已不存在时返回 undefined（由调用方丢弃并记录）
 */
export async function migrateLegacyEntry(root: string): Promise<SpaceEntity | undefined> {
  const realRoot = await canonicalize(root)
  if (!realRoot)
    return undefined

  let name = basename(realRoot)
  const members: SpaceFolder[] = []
  try {
    const raw = parseDocument(await readFile(join(realRoot, LEGACY_SPACE_FILE), 'utf8')).toJS() as Record<string, unknown>
    if (typeof raw.name === 'string' && raw.name.trim())
      name = raw.name.trim()
    const projects = Array.isArray(raw.projects) ? raw.projects as LegacyProjectEntry[] : []
    for (const project of projects) {
      if (typeof project.path !== 'string')
        continue
      const real = await canonicalize(join(realRoot, project.path))
      if (!real || real === realRoot)
        continue
      const folder: SpaceFolder = { path: real }
      if (typeof project.title === 'string' && project.title.trim())
        folder.title = project.title.trim()
      if (typeof project.desc === 'string' && project.desc.trim())
        folder.desc = project.desc.trim()
      members.push(folder)
    }
  }
  catch {
    // 没有 space.yaml 或已损坏：退化为仅含壳根的空间
  }

  return {
    id: `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    primary: realRoot,
    folders: [{ path: realRoot }, ...members],
  }
}
