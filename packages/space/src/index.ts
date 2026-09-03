import type { Context } from '@deepseek-ai/cordis'
import { createSpaceOperations } from './business/operations.ts'
import { registerCommand } from './host/command.ts'
import { registerHttpApi } from './host/http.ts'
import { registerPromptContext } from './host/prompt.ts'
import { registerTool } from './host/tool.ts'
import { PLUGIN_NAME } from './shared/constants.ts'
import { registerSpaceStore } from './store/settings.ts'
import { createWorkspaceService } from './workspace/core.ts'

export default {
  name: PLUGIN_NAME,
  inject: ['settings', 'workspaceRegistry', 'webServer', 'tools', 'commands', 'systemPrompt'],
  apply(ctx: Context) {
    const operations = createSpaceOperations(registerSpaceStore(ctx.settings), createWorkspaceService(ctx))
    ctx.effect(() => registerHttpApi(ctx, operations), 'dsh-space http')
    ctx.effect(() => registerCommand(ctx, operations), 'dsh-space command')
    ctx.effect(() => registerTool(ctx, operations), 'dsh-space tool')
    ctx.effect(() => registerPromptContext(ctx, operations), 'dsh-space prompt')
  },
}
