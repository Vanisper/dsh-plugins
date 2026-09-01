import type { ChatEntity } from './types.ts'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { canonicalize } from '../shared/fs-path.ts'
import { todayDirName } from '../shared/paths.ts'
import { bindChatWorkspaceId, createChat, dropChat, findChat } from './chats.ts'

let root: string

beforeEach(async () => {
  root = (await canonicalize(await mkdtemp(join(tmpdir(), 'dsh-space-chats-'))))!
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('createChat', () => {
  it('静默建目录：chats/<本地日期>/<slug>，缺省 new-chat', async () => {
    const { data, chat } = await createChat([], root)
    expect(chat.path).toBe(join(root, 'chats', todayDirName(), 'new-chat'))
    expect(await canonicalize(chat.path)).toBeTruthy()
    expect(data).toEqual([chat])
  })

  it('名字转 slug，同日重名加 -2 序号', async () => {
    const first = await createChat([], root, '调研 多根工作区!')
    expect(first.chat.path.endsWith('调研-多根工作区')).toBe(true)
    const second = await createChat(first.data, root, '调研 多根工作区!')
    expect(second.chat.path.endsWith('调研-多根工作区-2')).toBe(true)
    // 目录级去重保证了注册表路径唯一
    expect(second.data.map(c => c.path)).toContain(second.chat.path)
  })

  it('跨日期同目录名允许存在', async () => {
    const yesterday = join(root, 'chats', '2020-01-01')
    const fake: ChatEntity = { path: join(yesterday, 'topic') }
    await (await import('node:fs/promises')).mkdir(yesterday, { recursive: true })
    const today = await createChat([fake], root, 'topic')
    expect(today.data).toHaveLength(2)
  })
})

describe('findChat / dropChat', () => {
  it('按精确路径、规范路径、唯一目录名定位；目录名歧义报错', async () => {
    const fake: ChatEntity = { path: join(root, 'chats', '2020-01-01', 'topic') }
    const real = await createChat([fake], root, 'topic')
    await expect(findChat(real.data, real.chat.path)).resolves.toBeTruthy()
    await expect(findChat(real.data, fake.path)).resolves.toBe(fake)
    // 两个同名 topic 分属不同日期——目录名歧义
    await expect(findChat(real.data, 'topic')).rejects.toThrow('多个日期')
  })

  it('dropChat 只删记录，磁盘目录不动', async () => {
    const { data, chat } = await createChat([], root, 'gone')
    const result = await dropChat(data, 'gone')
    expect(result.data).toEqual([])
    expect(await canonicalize(chat.path)).toBeTruthy()
  })
})

describe('bindChatWorkspaceId', () => {
  it('幂等覆写绑定', async () => {
    const { data, chat } = await createChat([], root)
    const first = bindChatWorkspaceId(data, chat.path, 'ws-1')
    expect(first.chat.workspaceId).toBe('ws-1')
    const second = bindChatWorkspaceId(first.data, chat.path, 'ws-2')
    expect(second.chat.workspaceId).toBe('ws-2')
    expect(second.data).toHaveLength(1)
  })
})

describe('目录树形态', () => {
  it('根下只有 chats/ 一棵对话树', async () => {
    await createChat([], root)
    expect(await readdir(root)).toEqual(['chats'])
  })
})
