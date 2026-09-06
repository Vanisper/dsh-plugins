import { randomUUID } from 'node:crypto'
import { link, mkdir, open, readFile, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export type CreationKind = 'space' | 'chat'

export interface PendingCreation {
  kind: CreationKind
  path: string
  workspaceId?: string
}

function markerPath(target: string): string {
  return join(dirname(target), `.${basename(target)}.dsh-space-pending.json`)
}

async function publishPendingCreation(key: string, pending: PendingCreation, exclusive: boolean): Promise<void> {
  const marker = markerPath(key)
  const temporary = `${marker}.${randomUUID()}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try {
    try {
      await file.writeFile(`${JSON.stringify(pending)}\n`, 'utf8')
      await file.sync()
    }
    finally {
      await file.close()
    }
    // 首次发布不能覆盖他人的凭据；更新只替换已经完整落盘的文件
    if (exclusive)
      await link(temporary, marker)
    else
      await rename(temporary, marker)
  }
  finally {
    await rm(temporary, { force: true })
  }
}

function parsePendingCreation(raw: string, expectedKind: CreationKind, target: string): PendingCreation {
  let value: unknown
  try {
    value = JSON.parse(raw)
  }
  catch {
    throw new Error(`创建凭据已损坏：${markerPath(target)}`)
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`创建凭据格式无效：${markerPath(target)}`)
  const record = value as Record<string, unknown>
  if (record.kind !== expectedKind || typeof record.path !== 'string' || !record.path)
    throw new Error(`创建凭据与当前操作不匹配：${markerPath(target)}`)
  if (record.workspaceId !== undefined && (typeof record.workspaceId !== 'string' || !record.workspaceId))
    throw new Error(`创建凭据中的 workspaceId 无效：${markerPath(target)}`)
  return {
    kind: expectedKind,
    path: record.path,
    ...(typeof record.workspaceId === 'string' ? { workspaceId: record.workspaceId } : {}),
  }
}

/** 读取指定目标旁的未完成创建凭据 */
export async function readPendingCreation(target: string, kind: CreationKind): Promise<PendingCreation | undefined> {
  const raw = await readFile(markerPath(target), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT')
      return undefined
    throw error
  })
  return raw === undefined ? undefined : parsePendingCreation(raw, kind, target)
}

/** 首次创建凭据；已有凭据由调用方显式读取并恢复 */
export async function startPendingCreation(key: string, kind: CreationKind, target = key): Promise<PendingCreation> {
  const pending: PendingCreation = { kind, path: target }
  await mkdir(dirname(key), { recursive: true })
  await publishPendingCreation(key, pending, true)
  return pending
}

/** 更新创建进度，供失败后的下一次调用确定性恢复 */
export async function savePendingCreation(target: string, pending: PendingCreation): Promise<void> {
  await publishPendingCreation(target, pending, false)
}

/** 删除已经完成或确定回滚的创建凭据 */
export async function finishPendingCreation(target: string): Promise<void> {
  await rm(markerPath(target), { force: true })
}
