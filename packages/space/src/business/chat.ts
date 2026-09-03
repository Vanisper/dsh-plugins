import { mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { canonicalize } from '../shared/fs-path.ts'
import { chatsDir, ensureDirectory, localDateName, slugify, uniqueDirectory } from '../shared/paths.ts'

/** 创建一个自动归档到本地日期目录的对话目录 */
export async function createChatDirectory(root: string, name?: string): Promise<{ path: string, created: boolean }> {
  const parent = join(chatsDir(root), localDateName())
  await mkdir(parent, { recursive: true })
  const candidate = await uniqueDirectory(parent, slugify(name ?? 'new-chat'))
  await ensureDirectory(candidate)
  return { path: (await canonicalize(candidate)) ?? candidate, created: true }
}

/** 对话标题的默认值只使用目录末段，不写进插件注册表 */
export function chatTitle(path: string): string {
  return basename(path)
}
