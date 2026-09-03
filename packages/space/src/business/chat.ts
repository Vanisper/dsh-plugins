import { basename } from 'node:path'

/** 对话标题的默认值只使用目录末段，不写进插件注册表 */
export function chatTitle(path: string): string {
  return basename(path)
}
