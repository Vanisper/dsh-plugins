import { realpathSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { isAbsolute, relative, sep } from 'node:path'

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
  const path = relative(root, target)
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
}
