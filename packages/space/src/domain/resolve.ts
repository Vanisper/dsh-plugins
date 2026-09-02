import type { SpaceEntity } from './types.ts'
import { realpathSync } from 'node:fs'
import { isUnder } from '../shared/fs-path.ts'

// ============================================================
// 会话 cwd → 空间的认领解析（渲染与注入共用的唯一解析器）
// ------------------------------------------------------------
// - 匹配面只有固定壳目录一棵树，成员目录与 primary 都不参与
// - 会话入口与提示词归属使用同一条固定路径，不再做 cwd 兼容归组
// - cwd 经 symlink 进入成员目录时 realpath 归一后落在壳外，
//   不命中——这正是模型的结论：从成员进入不是工作区会话
// ============================================================

/**
 * 解析 cwd 命中的全部空间（壳目录子树包含即命中）
 *
 * @description 多空间的壳目录子树重叠时全部返回，按路径深度降序
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
    .map((space, index) => ({ space, index, anchor: space.shell }))
    .filter(({ anchor }) => isUnder(real, anchor))
    .sort((a, b) => b.anchor.length - a.anchor.length || a.index - b.index)
    .map(({ space }) => space)
}

/** 单命中解析：最深壳目录胜，同深度注册表序在前 */
export function resolveByCwd(spaces: SpaceEntity[], cwd: string): SpaceEntity | undefined {
  return resolveAllByCwd(spaces, cwd)[0]
}
