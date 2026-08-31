import type { Space } from './types.ts'
// @env node
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { realpath } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { SPACE_FILE } from './constants.ts'
import { parseSpaceFile } from './space-file.ts'

/** realpath 的宽容版本：路径不存在时返回 undefined */
export async function canonicalize(path: string): Promise<string | undefined> {
  try {
    return await realpath(path)
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
 * 从 cwd 逐级向上找 space.yaml，命中即返回该空间
 *
 * @description 同步实现：systemPrompt 的 text 回调是同步签名，装配期每请求一次、代价极小
 */
export function locateSpaceSync(cwd: string): Space | undefined {
  let dir: string
  try {
    dir = realpathSync(cwd)
  }
  catch {
    return undefined
  }
  while (true) {
    const filePath = join(dir, SPACE_FILE)
    if (existsSync(filePath)) {
      try {
        return { root: dir, file: parseSpaceFile(readFileSync(filePath, 'utf8'), filePath) }
      }
      catch {
        // 损坏的 space.yaml 不阻断装配；由 doctor 负责报告
        return undefined
      }
    }
    const parent = dirname(dir)
    if (parent === dir)
      return undefined
    dir = parent
  }
}

export async function locateSpace(cwd: string): Promise<Space | undefined> {
  const root = await canonicalize(cwd)
  return root ? locateSpaceSync(root) : undefined
}
