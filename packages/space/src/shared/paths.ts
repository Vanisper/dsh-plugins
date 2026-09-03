import { mkdir, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { CHATS_DIR, SPACES_DIR } from './constants.ts'

/** 解析插件托管根目录；空值使用用户文档目录下的 dsh */
export function resolveRoot(configured: string | undefined): string {
  const value = configured?.trim()
  if (!value)
    return join(homedir(), 'Documents', 'dsh')
  if (!isAbsolute(value))
    throw new Error(`托管根必须是绝对路径：${configured}`)
  return resolve(value)
}

export function spacesDir(root: string): string {
  return join(root, SPACES_DIR)
}

export function chatsDir(root: string): string {
  return join(root, CHATS_DIR)
}

/** 校验可直接作为目录名的工作区标题 */
export function assertDirectoryName(value: string): string {
  const name = value.trim()
  if (!name)
    throw new Error('名称不能为空')
  if (name === '.' || name === '..' || /[/\\\0]/.test(name) || name.startsWith('.'))
    throw new Error(`名称含非法字符：${value}`)
  return name
}

/** 校验一个不会逃逸父目录的路径段 */
export function assertPathSegment(value: string): string {
  const name = value.trim()
  if (!name || name === '.' || name === '..' || /[/\\\0]/.test(name) || isAbsolute(name))
    throw new Error(`路径段不是安全的单段名称：${value}`)
  return name
}

/** 把对话标题转换为稳定、可读的目录名 */
export function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\p{Script=Han}\w-]+/gu, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
  return slug || 'new-chat'
}

/** 在同一日期目录内选择未占用的目录名 */
export async function uniqueDirectory(parent: string, baseName: string): Promise<string> {
  const names = new Set(await readdir(parent).catch(() => [] as string[]))
  let candidate = baseName
  let suffix = 2
  while (names.has(candidate)) {
    candidate = `${baseName}-${suffix}`
    suffix += 1
  }
  return join(parent, candidate)
}

/** 本地日历日，避免 UTC 跨日造成目录错位 */
export function localDateName(now = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

export async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}
