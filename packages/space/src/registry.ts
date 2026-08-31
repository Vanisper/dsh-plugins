// @env node
import type { SettingsProvider, SettingsScope } from '@deepseek-ai/dsh-settings'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { SETTINGS_NAMESPACE } from './constants.ts'

const SpacesSettingsSchema = z.object({
  /** 已知空间壳根的规范绝对路径列表；init/attach 时追加 */
  spaces: z.array(z.string()).default([]),
})

interface SpacesSettings {
  spaces: string[]
}

/** 已登记空间的持久名录：启动时自动登记工作区、列表命令的数据来源 */
export interface SpacesRegistry {
  list: () => string[]
  add: (root: string) => Promise<void>
  remove: (root: string) => Promise<void>
  /** 名录每次提交变化后触发（幂等回调，由调用方负责去重） */
  watch: (callback: () => void) => () => void
}

export function registerSpacesRegistry(settings: SettingsProvider): SpacesRegistry {
  const scope: SettingsScope<SpacesSettings> = settings.register(
    settingsNamespace(SETTINGS_NAMESPACE),
    SpacesSettingsSchema,
  )
  return {
    list: () => [...scope.get().spaces],
    async add(root) {
      if (!scope.get().spaces.includes(root))
        await scope.update({ spaces: [...scope.get().spaces, root] })
    },
    async remove(root) {
      await scope.update({ spaces: scope.get().spaces.filter(known => known !== root) })
    },
    watch(callback) {
      return scope.watch(() => callback())
    },
  }
}
