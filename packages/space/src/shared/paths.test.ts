import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from './fs-path.ts'
import { assertFsSafeName, chatsDir, dedupeDir, ensureDir, resolveRoot, slugify, spacesDir, todayDirName } from './paths.ts'

let dir: string

beforeEach(async () => {
  dir = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-paths-'))))!
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('resolveRoot', () => {
  it('设置项优先，空白回退缺省 ~/Documents/dsh', () => {
    expect(resolveRoot('/data/dsh')).toBe('/data/dsh')
    expect(resolveRoot('  ')).toBe(join(process.env.HOME ?? '', 'Documents', 'dsh'))
    expect(resolveRoot(undefined)).toBe(join(process.env.HOME ?? '', 'Documents', 'dsh'))
  })
})

describe('目录布局', () => {
  it('spaces/chats 两棵树挂在托管根下', () => {
    expect(spacesDir(dir)).toBe(join(dir, 'spaces'))
    expect(chatsDir(dir)).toBe(join(dir, 'chats'))
  })
})

describe('assertFsSafeName', () => {
  it('拒绝空名、路径分隔符、点开头与空白连字符', () => {
    expect(() => assertFsSafeName('')).toThrow('不能为空')
    expect(() => assertFsSafeName('a/b')).toThrow('非法字符')
    expect(() => assertFsSafeName('.hidden')).toThrow('非法字符')
    expect(() => assertFsSafeName('my space')).toThrow('非法字符')
    expect(assertFsSafeName('  测试工作区  ')).toBe('测试工作区')
  })
})

describe('slugify', () => {
  it('空白兜底 new-chat；Han 保留；不安全字符段折叠为单个 -', () => {
    expect(slugify('')).toBe('new-chat')
    expect(slugify('   ')).toBe('new-chat')
    expect(slugify('调研 计划')).toBe('调研-计划')
    expect(slugify('https://github.com/a/b')).toBe('https-github-com-a-b')
    expect(slugify('A  --  B')).toBe('a-b')
  })
})

describe('dedupeDir', () => {
  it('已存在时追加 -2/-3 序号', async () => {
    await ensureDir(join(dir, 'topic'))
    await ensureDir(join(dir, 'topic-2'))
    expect(await dedupeDir(dir, 'topic')).toBe(join(dir, 'topic-3'))
    expect(await dedupeDir(dir, 'fresh')).toBe(join(dir, 'fresh'))
  })
})

describe('todayDirName', () => {
  it('本地日历日的 YYYY-MM-DD', () => {
    expect(todayDirName(new Date(2026, 0, 9, 23, 59))).toBe('2026-01-09')
    expect(todayDirName(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})
