import type { SpaceEntity, SpaceHit } from './types.ts'
// @env node
import { realpathSync } from 'node:fs'
import { realpath } from 'node:fs/promises'

/** realpath 的宽容版本：路径不存在时返回 undefined */
export async function canonicalize(path: string): Promise<string | undefined> {
  try {
    return await realpath(path)
  }
  catch {
    return undefined
  }
}

export function canonicalizeSync(path: string): string | undefined {
  try {
    return realpathSync(path)
  }
  catch {
    return undefined
  }
}

/** `target` 是否等于或位于 `root` 之下（两侧都应是规范绝对路径） */
export function isUnder(target: string, root: string): boolean {
  const normalizedRoot = root.replace(/[/\\]+$/, '')
  return target === normalizedRoot || target.startsWith(`${normalizedRoot}/`) || target.startsWith(`${normalizedRoot}\\`)
}

/**
 * 用包含匹配解析 cwd 所属的空间与成员文件夹
 *
 * @description
 * - 文件夹路径在挂载时已归一为规范绝对路径，这里只做纯字符串前缀判定
 * - 成员可能互相嵌套（/a 与 /a/b），最长前缀命中优先（更具体的成员胜出）
 * - 同步实现：systemPrompt 的 text 回调是同步签名，装配期每请求一次、代价极小
 */
export function resolveByCwd(spaces: SpaceEntity[], cwd: string): SpaceHit | undefined {
  const real = canonicalizeSync(cwd)
  if (!real)
    return undefined
  let best: SpaceHit | undefined
  for (const space of spaces) {
    for (const folder of space.folders) {
      if (isUnder(real, folder.path) && (best === undefined || folder.path.length > best.folder.path.length))
        best = { space, folder }
    }
  }
  return best
}
