// @env node
// dsh-space 插件入口：装配 settings 名录、space 工具、/space 命令、空间地图上下文与工作区自动登记
import type { Context } from '@deepseek-ai/cordis'
import { registerCommand } from './command.ts'
import { PLUGIN_NAME } from './constants.ts'
import { registerPromptContext } from './prompt.ts'
import { registerSpacesRegistry } from './registry.ts'
import { registerTool } from './tool.ts'
import { startWorkspaceRegistration } from './workspaces.ts'

export interface DshSpaceConfig {
  /** 是否把空间成员自动登记为核心 workspace（默认 true） */
  registerWorkspaces?: boolean
}

export default {
  name: PLUGIN_NAME,
  inject: ['settings', 'tools', 'systemPrompt', 'commands'],
  apply(ctx: Context, config: DshSpaceConfig) {
    const registry = registerSpacesRegistry(ctx.settings)
    const refresh = config?.registerWorkspaces === false
      ? (): void => {}
      : startWorkspaceRegistration(ctx, registry, message => console.warn(message))
    registerTool(ctx, registry, refresh)
    registerCommand(ctx, registry, refresh)
    registerPromptContext(ctx)
  },
}
