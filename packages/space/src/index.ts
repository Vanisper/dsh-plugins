// dsh-space 插件入口：先把附加注册表迁移到运行时不变量，再开放所有调用入口
import type { Context } from '@deepseek-ai/cordis'
import { registerCommand } from './host/command.ts'
import { createCoreWorkspaceAdapter } from './host/core-workspace.ts'
import { registerHttpApi } from './host/http.ts'
import { createSpaceOperations } from './host/operations.ts'
import { registerPromptContext } from './host/prompt.ts'
import { registerTool } from './host/tool.ts'
import { PLUGIN_NAME } from './shared/constants.ts'
import { registerSpacesStore } from './store/spaces.ts'

export default {
  name: PLUGIN_NAME,
  inject: ['settings', 'workspaceRegistry', 'webServer', 'tools', 'systemPrompt', 'commands'],
  async apply(ctx: Context) {
    const store = registerSpacesStore(ctx.settings)
    const operations = createSpaceOperations(store, createCoreWorkspaceAdapter(ctx))
    await operations.initialize()
    registerTool(ctx, operations)
    registerCommand(ctx, operations)
    registerPromptContext(ctx, operations)
    registerHttpApi(ctx, operations)
    return () => operations.dispose()
  },
}
