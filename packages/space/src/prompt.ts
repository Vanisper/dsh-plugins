// @env node
import type { Context } from '@deepseek-ai/cordis'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import type { SpacesStore } from './registry.ts'
import type { SpaceHit } from './types.ts'
import { PROMPT_CONTEXT_NAME, PROMPT_CONTEXT_ORDER } from './constants.ts'
import { resolveByCwd } from './resolve.ts'

/** AssembleContext 是可合并扩展接口；agent 由 agent loop 在请求装配时并入 */
interface MaybeAgentContext {
  agent?: { session?: { header?: { cwd?: string } } }
}

function renderSpaceMap(hit: SpaceHit): string {
  const { space, folder: current } = hit
  const lines = [
    `当前会话属于多项目空间「${space.name}」（cwd 所在成员：${current.path}）。`,
    '',
    '成员文件夹（原地引用，磁盘未做归集；读取不限，写入跟随会话 cwd 所在成员）：',
    ...space.folders.map((folder) => {
      const title = folder.title ? ` — ${folder.title}` : ''
      const desc = folder.desc ? `：${folder.desc}` : ''
      const primary = folder.path === space.primary ? '（主成员）' : ''
      return `- ${folder.path}${title}${desc}${primary}`
    }),
    '',
    '跨成员写入请在该成员目录的会话里进行；新会话建议从主成员创建。',
  ]
  return lines.join('\n')
}

/** 注册逐请求求值的空间地图上下文；cwd 不在任何空间成员内时不贡献内容 */
export function registerPromptContext(ctx: Context, store: SpacesStore): void {
  const dispose = ctx.systemPrompt.context({
    name: PROMPT_CONTEXT_NAME,
    order: PROMPT_CONTEXT_ORDER,
    text: (context: AssembleContext) => {
      const cwd = (context as AssembleContext & MaybeAgentContext).agent?.session?.header?.cwd
      if (!cwd)
        return ''
      const hit = resolveByCwd(store.list(), cwd)
      return hit ? renderSpaceMap(hit) : ''
    },
  })
  if (dispose)
    ctx.effect(() => dispose)
}
