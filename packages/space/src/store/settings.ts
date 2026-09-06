import type { SettingsProvider, SettingsScope } from '@deepseek-ai/dsh-settings'
import type { SpaceSettings } from '../business/types.ts'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { validateSettings } from '../business/validation.ts'
import { SETTINGS_NAMESPACE } from '../shared/constants.ts'
import { resolveRoot } from '../shared/paths.ts'

const MemberSchema = z.object({
  path: z.string().required(),
  mode: z.union(['reference', 'link']).default('reference'),
  linkName: z.string(),
  title: z.string(),
  description: z.string(),
})

const SpaceSchema = z.object({
  workspaceId: z.string().required(),
  primary: z.string(),
  members: z.array(MemberSchema).default([]),
})

const ChatSchema = z.object({
  workspaceId: z.string().required(),
  creationId: z.string(),
})

const SettingsSchema = z.object({
  root: z.string().default(''),
  spaces: z.array(SpaceSchema).default([]),
  chats: z.array(ChatSchema).default([]),
})

export interface SpaceStore {
  read: () => SpaceSettings
  replace: (settings: SpaceSettings) => Promise<void>
  root: () => string
}

function copy(settings: SpaceSettings): SpaceSettings {
  return structuredClone(settings)
}

/** settings namespace 的薄适配器；插件设置只保存核心工作区的附加描述 */
export function registerSpaceStore(settings: SettingsProvider): SpaceStore {
  const scope: SettingsScope<SpaceSettings> = settings.register(
    settingsNamespace(SETTINGS_NAMESPACE),
    SettingsSchema,
    { validate: (value: unknown) => validateSettings(value) },
  )
  const read = (): SpaceSettings => copy(scope.get())
  return {
    read,
    replace: async (next) => {
      const value = copy(next)
      await scope.replace(value)
    },
    root: () => resolveRoot(read().root),
  }
}
