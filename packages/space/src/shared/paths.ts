import { mkdir, readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { CHATS_DIR, SPACES_DIR } from './constants.ts'

/** 托管根解析：设置项优先，缺省 ~/Documents/dsh */
export function resolveRoot(configured: string | undefined): string {
  const trimmed = configured?.trim()
  if (!trimmed)
    return join(homedir(), 'Documents', 'dsh')
  if (!isAbsolute(trimmed))
    throw new Error(`托管根必须是绝对路径：${trimmed}`)
  return resolve(trimmed)
}

export function spacesDir(root: string): string {
  return join(root, SPACES_DIR)
}

export function chatsDir(root: string): string {
  return join(root, CHATS_DIR)
}

/** 校验名称可作为文件系统目录名（空间名同时是壳目录名） */
export function assertFsSafeName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed)
    throw new Error('名称不能为空')
  if (/[/\\\0]/.test(trimmed) || trimmed.startsWith('.') || /\s/.test(trimmed))
    throw new Error(`名称含非法字符：${name}`)
  return trimmed
}

/** 校验值只能作为一个普通路径段，不能逃逸父目录 */
export function assertSafePathSegment(name: string): string {
  const trimmed = name.trim()
  if (!trimmed || trimmed === '.' || trimmed === '..' || /[/\\\0]/.test(trimmed) || isAbsolute(trimmed))
    throw new Error(`链接名不是安全的单段名称：${name}`)
  return trimmed
}

/** 对话目录命名：名字转 slug；空白兜底 'new-chat' */
export function slugify(text: string): string {
  const slug = text.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^\p{Script=Han}\w-]+/gu, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '')
  return slug || 'new-chat'
}

/** 目录已存在时按 -2/-3… 追加序号 */
export async function dedupeDir(parent: string, name: string): Promise<string> {
  let candidate = name
  let suffix = 2
  const existing = new Set(await readdir(parent).catch(() => [] as string[]))
  while (existing.has(candidate)) {
    candidate = `${name}-${suffix}`
    suffix += 1
  }
  return join(parent, candidate)
}

/** 本地日历日（非 UTC）的 YYYY-MM-DD */
export function todayDirName(now = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** 建好目录并返回其路径 */
export async function ensureDir(path: string): Promise<string> {
  await mkdir(path, { recursive: true })
  return path
}
