// @env node
import type { SettingsProvider, SettingsScope } from '@deepseek-ai/dsh-settings'
import type { SpaceEntity } from './types.ts'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { SETTINGS_NAMESPACE } from './constants.ts'
import { migrateLegacyEntry } from './migration.ts'

// schemastery 惯例：字段默认可选，required 显式标必填
const FolderSchema = z.object({
  path: z.string().required(),
  title: z.string(),
  desc: z.string(),
})

const SpaceSchema = z.object({
  id: z.string().required(),
  name: z.string().required(),
  primary: z.string(),
  folders: z.array(FolderSchema).default([]),
})

// 壳模式时代的 spaces 条目是纯字符串（壳根路径），union 容忍旧数据以便迁移
const SettingsSchema = z.object({
  spaces: z.array(z.union([SpaceSchema, z.string()])).default([]),
})

interface SpacesSettings {
  spaces: (SpaceEntity | string)[]
}

/** 空间注册表：settings 命名空间上的读写门面，类型层只暴露迁移完成的实体 */
export interface SpacesStore {
  list: () => SpaceEntity[]
  /** 全量覆盖写入（ops 纯函数产出新数组，由这里持久化） */
  save: (spaces: SpaceEntity[]) => Promise<void>
  /** 每次提交变化后触发（幂等回调，调用方自行去重） */
  watch: (callback: () => void) => () => void
}

/**
 * 注册 settings 命名空间并完成一次性迁移
 *
 * @description 旧格式条目（壳根字符串）逐个转换为项目模式实体：
 * 读壳根 space.yaml 取空间名与成员（成员 symlink 解析为真实路径），随后整段覆写为新格式
 */
export async function registerSpacesStore(settings: SettingsProvider, log: (message: string) => void): Promise<SpacesStore> {
  const scope: SettingsScope<SpacesSettings> = settings.register(
    settingsNamespace(SETTINGS_NAMESPACE),
    SettingsSchema,
  )

  const raw = scope.get().spaces
  if (raw.some(entry => typeof entry === 'string')) {
    const spaces: SpaceEntity[] = []
    for (const entry of raw) {
      if (typeof entry === 'string') {
        const migrated = await migrateLegacyEntry(entry)
        if (migrated) {
          spaces.push(migrated)
          log(`[dsh-space] 已迁移壳模式空间：${entry} →「${migrated.name}」（${migrated.folders.length} 个成员）`)
        }
        else {
          log(`[dsh-space] 旧空间条目无法迁移（目录已不存在），已丢弃：${entry}`)
        }
      }
      else {
        spaces.push(entry)
      }
    }
    await scope.replace({ spaces })
  }

  return {
    list: () => scope.get().spaces.filter((entry): entry is SpaceEntity => typeof entry !== 'string'),
    save: async spaces => scope.replace({ spaces }),
    watch: callback => scope.watch(() => callback()),
  }
}
