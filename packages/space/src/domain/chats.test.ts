import type { ChatEntity } from './types.ts'
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from '../shared/fs-path.ts'
import { todayDirName } from '../shared/paths.ts'
import { createChatDirectory, createChatEntity, dropChat, findChat, replaceChatWorkspaceId } from './chats.ts'

let root: string

beforeEach(async () => {
  root = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-chats-'))))!
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('对话创建', () => {
  it('目录与完成核心绑定的实体分两步建立', async () => {
    const path = await createChatDirectory(root)
    const { data, chat } = createChatEntity([], path, 'ws-chat')
    expect(chat).toEqual({ path: join(root, 'chats', todayDirName(), 'new-chat'), workspaceId: 'ws-chat' })
    expect(data).toEqual([chat])
  })

  it('名字转 slug，同日重名加序号', async () => {
    const first = await createChatDirectory(root, '调研 多根工作区!')
    const second = await createChatDirectory(root, '调研 多根工作区!')
    expect(first.endsWith('调研-多根工作区')).toBe(true)
    expect(second.endsWith('调研-多根工作区-2')).toBe(true)
  })
})

describe('findChat / dropChat', () => {
  it('支持精确路径、规范路径和唯一目录名；歧义时要求完整路径', async () => {
    const oldPath = join(root, 'chats', '2020-01-01', 'topic')
    await mkdir(oldPath, { recursive: true })
    const currentPath = await createChatDirectory(root, 'topic')
    const old: ChatEntity = { path: oldPath, workspaceId: 'ws-old' }
    const current: ChatEntity = { path: currentPath, workspaceId: 'ws-current' }
    await expect(findChat([old, current], currentPath)).resolves.toBe(current)
    await expect(findChat([old, current], oldPath)).resolves.toBe(old)
    await expect(findChat([old, current], 'topic')).rejects.toThrow('多个日期')
  })

  it('dropChat 只删附加记录，磁盘目录不动', async () => {
    const path = await createChatDirectory(root, 'gone')
    const created = createChatEntity([], path, 'ws-chat')
    expect((await dropChat(created.data, 'gone')).data).toEqual([])
    expect(await canonicalize(path)).toBe(path)
  })

  it('显式修复绑定时保持单条实体', async () => {
    const path = await createChatDirectory(root)
    const created = createChatEntity([], path, 'ws-1')
    const replaced = replaceChatWorkspaceId(created.data, path, 'ws-2')
    expect(replaced.chat.workspaceId).toBe('ws-2')
    expect(replaced.data).toEqual([replaced.chat])
  })
})

describe('目录树形态', () => {
  it('根下只有 chats/ 一棵对话树', async () => {
    await createChatDirectory(root)
    expect(await readdir(root)).toEqual(['chats'])
  })
})
