import type { SpaceEntity } from './types.ts'
import { realpathSync } from 'node:fs'
import { isUnder } from '../shared/fs-path.ts'
import { effectivePath } from './space.ts'

// ============================================================
// 会话 cwd → 空间的认领解析（渲染与注入共用的唯一解析器）
// ------------------------------------------------------------
// - 匹配面只有有效路径一棵树（壳 ?? primary ?? 首位成员），
//   成员目录是纯注解，不作为任何与核心连接的匹配面
// - 识别宽松（存量会话只要落在有效路径子树内就认领）、入口严格
//   （我们只从有效路径产生会话）——两者是分离的规则
// - cwd 经 symlink 进入成员目录时 realpath 归一后落在壳外，
//   不命中——这正是模型的结论：从成员进入不是工作区会话
// ============================================================

/**
 * 解析 cwd 命中的全部空间（有效路径子树包含即命中）
 *
 * @description 多空间的有效路径子树重叠时全部返回，按路径深度降序
 * （更具体的在前、同深度时注册表序在前），调用方取首个即得主归属
 */
export function resolveAllByCwd(spaces: SpaceEntity[], cwd: string): SpaceEntity[] {
  let real: string
  try {
    real = realpathSync(cwd)
  }
  catch {
    return []
  }
  return spaces
    .map((space, index) => ({ space, index, anchor: effectivePath(space) }))
    .filter(({ anchor }) => anchor !== undefined && isUnder(real, anchor))
    .sort((a, b) => b.anchor!.length - a.anchor!.length || a.index - b.index)
    .map(({ space }) => space)
}

/** 单命中解析：最深有效路径胜，同深度注册表序在前 */
export function resolveByCwd(spaces: SpaceEntity[], cwd: string): SpaceEntity | undefined {
  return resolveAllByCwd(spaces, cwd)[0]
}
