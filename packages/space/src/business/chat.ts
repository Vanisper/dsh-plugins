import { lstat, mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'

/** 只准备快速对话的真实子目录；created 供调用方在失败时清理本次空目录 */
export async function prepareChatDirectories(path: string, created: string[]): Promise<void> {
  for (const name of ['work', 'outputs']) {
    const target = join(path, name)
    try {
      await mkdir(target)
      created.push(target)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
        throw error
    }
    if (!(await lstat(target)).isDirectory())
      throw new Error(`快速对话子目录必须是真实目录：${target}`)
  }
}

/** 对话标题的默认值只使用目录末段，不写进插件注册表 */
export function chatTitle(path: string): string {
  return basename(path)
}
