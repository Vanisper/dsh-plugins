// dsh-space 插件入口：装配 settings 注册表、space 工具、/space 命令与空间地图上下文
// 两条创建路径（工作区建壳 / 对话静默建目录）都在创建动作里幂等登记核心工作区行并持有
// id 绑定（id-first 纪律）；除此之外对核心一律只读；sessionId 零持久化（核心账目承载归属）
import type { Context } from '@deepseek-ai/cordis'
import { registerCommand } from './host/command.ts'
import { registerPromptContext } from './host/prompt.ts'
import { registerTool } from './host/tool.ts'
import { PLUGIN_NAME } from './shared/constants.ts'
import { registerSpacesStore } from './store/spaces.ts'

export default {
  name: PLUGIN_NAME,
  inject: ['settings', 'tools', 'systemPrompt', 'commands'],
  apply(ctx: Context) {
    const store = registerSpacesStore(ctx.settings)
    registerTool(ctx, store)
    registerCommand(ctx, store)
    registerPromptContext(ctx, store)
  },
}
