import type { SettingsProvider, SettingsScope } from '@deepseek-ai/dsh-settings'
import type { ChatEntity, SpaceEntity } from '../domain/types.ts'
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
  /** 核心工作区行绑定（id-first；旧数据无此字段即「未绑定」态） */
  workspaceId: z.string(),
  folders: z.array(FolderSchema).default([]),
})

const ChatSchema = z.object({
  path: z.string().required(),
  /** 核心工作区行绑定（id-first；登记失败时缺省，doctor 报未绑定） */
  workspaceId: z.string(),
})

const SettingsSchema = z.object({
  /** 托管根绝对路径；空串 = 缺省 ~/Documents/dsh */
  root: z.string().default(''),
  spaces: z.array(SpaceSchema).default([]),
  chats: z.array(ChatSchema).default([]),
})

interface SpaceSettings {
  root: string
  spaces: SpaceEntity[]
  chats: ChatEntity[]
}

/** 注册表：settings 命名空间上的读写门面（spaces + chats 两类实体） */
export interface SpacesStore {
  listSpaces: () => SpaceEntity[]
  listChats: () => ChatEntity[]
  /** 全量覆盖写入（域操作产出新数组，由这里持久化） */
  save: (spaces: SpaceEntity[], chats: ChatEntity[]) => Promise<void>
  /** 托管根：设置项优先，缺省 ~/Documents/dsh */
  root: () => string
  /** 每次提交变化后触发（幂等回调，调用方自行去重） */
  watch: (callback: () => void) => () => void
}

export function registerSpacesStore(settings: SettingsProvider): SpacesStore {
  const scope: SettingsScope<SpaceSettings> = settings.register(
    settingsNamespace(SETTINGS_NAMESPACE),
    SettingsSchema,
  )
  return {
    listSpaces: () => scope.get().spaces,
    listChats: () => scope.get().chats,
    save: async (spaces, chats) => scope.update({ spaces, chats }),
    root: () => resolveRoot(scope.get().root),
    watch: callback => scope.watch(() => callback()),
  }
}
