// @env node
import type { SettingsProvider, SettingsScope } from '@deepseek-ai/dsh-settings'
import type { SpaceEntity } from './types.ts'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { SETTINGS_NAMESPACE } from './constants.ts'

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

const SettingsSchema = z.object({
  spaces: z.array(SpaceSchema).default([]),
})

interface SpacesSettings {
  spaces: SpaceEntity[]
}

/** 空间注册表：settings 命名空间上的读写门面 */
export interface SpacesStore {
  list: () => SpaceEntity[]
  /** 全量覆盖写入（ops 纯函数产出新数组，由这里持久化） */
  save: (spaces: SpaceEntity[]) => Promise<void>
  /** 每次提交变化后触发（幂等回调，调用方自行去重） */
  watch: (callback: () => void) => () => void
}

export function registerSpacesStore(settings: SettingsProvider): SpacesStore {
  const scope: SettingsScope<SpacesSettings> = settings.register(
    settingsNamespace(SETTINGS_NAMESPACE),
    SettingsSchema,
  )
  return {
    list: () => scope.get().spaces,
    save: async spaces => scope.replace({ spaces }),
    watch: callback => scope.watch(() => callback()),
  }
}
