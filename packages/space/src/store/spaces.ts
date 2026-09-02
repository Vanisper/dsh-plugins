import type { SettingsProvider, SettingsScope } from '@deepseek-ai/dsh-settings'
import type { SpaceRegistry, StoredChatEntity, StoredSpaceEntity } from '../domain/types.ts'
import { settingsNamespace } from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import { SETTINGS_NAMESPACE } from '../shared/constants.ts'
import { resolveRoot } from '../shared/paths.ts'

// schemastery 惯例：字段默认可选，required 显式标必填
const FolderSchema = z.object({
  path: z.string().required(),
  mode: z.union(['link', 'reference']).default('reference'),
  linkPath: z.string(),
  title: z.string(),
  desc: z.string(),
})

const SpaceSchema = z.object({
  id: z.string().required(),
  name: z.string().required(),
  shell: z.string(),
  primary: z.string(),
  /** 旧版本允许缺省；初始化迁移后必有 */
  workspaceId: z.string(),
  folders: z.array(FolderSchema).default([]),
})

const ChatSchema = z.object({
  path: z.string().required(),
  /** 旧版本允许缺省；初始化迁移后必有 */
  workspaceId: z.string(),
})

const SettingsSchema = z.object({
  version: z.number().default(1),
  /** 托管根绝对路径；空串 = 缺省 ~/Documents/dsh */
  root: z.string().default(''),
  spaces: z.array(SpaceSchema).default([]),
  chats: z.array(ChatSchema).default([]),
})

interface SpaceSettings {
  version: number
  root: string
  spaces: StoredSpaceEntity[]
  chats: StoredChatEntity[]
}

export interface StoredRegistry {
  version: number
  spaces: StoredSpaceEntity[]
  chats: StoredChatEntity[]
}

/** 注册表：settings 命名空间上的读写门面（spaces + chats 两类实体） */
export interface SpacesStore {
  read: () => StoredRegistry
  /** 全量覆盖写入；写入值已经满足当前运行时不变量 */
  save: (registry: SpaceRegistry) => Promise<void>
  /** 托管根：设置项优先，缺省 ~/Documents/dsh */
  root: () => string
  /** 每次提交变化后触发 */
  watch: (callback: (registry: StoredRegistry) => void) => () => void
}

export function registerSpacesStore(settings: SettingsProvider): SpacesStore {
  const scope: SettingsScope<SpaceSettings> = settings.register(
    settingsNamespace(SETTINGS_NAMESPACE),
    SettingsSchema,
  )
  return {
    read: () => {
      const { version, spaces, chats } = scope.get()
      return { version, spaces, chats }
    },
    save: async ({ spaces, chats }) => scope.update({ version: 2, spaces, chats }),
    root: () => resolveRoot(scope.get().root),
    watch: callback => scope.watch((next) => {
      callback({ version: next.version, spaces: next.spaces, chats: next.chats })
    }),
  }
}
