import type { Context } from '@deepseek-ai/cordis'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import type { Space } from './types.ts'
import { PROMPT_CONTEXT_NAME, PROMPT_CONTEXT_ORDER } from './constants.ts'
import { locateSpaceSync } from './locate.ts'

/** AssembleContext 是可合并扩展接口；agent 由 agent loop 在请求装配时并入 */
interface MaybeAgentContext {
  agent?: { session?: { header?: { cwd?: string } } }
}

function renderSpaceMap(space: Space): string {
  const lines = [
    `当前会话位于多项目空间「${space.file.name}」（壳根：${space.root}）。`,
    '',
    '成员项目（git 各自独立，路径相对壳根）：',
    ...space.file.projects.map((project) => {
      const title = project.title ? ` — ${project.title}` : ''
      const desc = project.desc ? `：${project.desc}` : ''
      return `- ${project.path}${title}${desc}`
    }),
    '',
    '空间级约定见壳根 AGENTS.md，项目级约定见各成员的 AGENTS.md。'
    + '会话工作目录在壳根时可直接操作全部成员；在某个成员项目内时，'
    + '标准文件工具的写入范围以该成员为根，跨项目写入请改用壳根会话。',
  ]
  return lines.join('\n')
}

/** 注册逐请求求值的空间地图上下文；cwd 不在任何空间内时不贡献内容 */
export function registerPromptContext(ctx: Context): void {
  const dispose = ctx.systemPrompt.context({
    name: PROMPT_CONTEXT_NAME,
    order: PROMPT_CONTEXT_ORDER,
    text: (context: AssembleContext) => {
      const cwd = (context as AssembleContext & MaybeAgentContext).agent?.session?.header?.cwd
      if (!cwd)
        return ''
      const space = locateSpaceSync(cwd)
      return space ? renderSpaceMap(space) : ''
    },
  })
  if (dispose)
    ctx.effect(() => dispose)
}
