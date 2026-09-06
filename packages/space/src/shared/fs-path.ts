import { realpathSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'

/** 对不存在的路径返回 undefined 的 realpath 封装 */
export async function canonicalize(path: string): Promise<string | undefined> {
  try {
    return await realpath(path)
  }
  catch {
    return undefined
  }
}

/** 同步路径规范化，用于同步的提示词和界面投影 */
export function canonicalizeSync(path: string): string | undefined {
  try {
    return realpathSync(path)
  }
  catch {
    return undefined
  }
}

/** 判断路径是否等于或位于目录树内 */
export function isUnder(target: string, root: string): boolean {
  const path = relative(root, target)
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
}
