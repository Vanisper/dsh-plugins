import type { Context } from '@deepseek-ai/cordis'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import type { SpaceOperations } from '../business/operations.ts'
import { PROMPT_CONTEXT_NAME, PROMPT_CONTEXT_ORDER } from '../shared/constants.ts'

export function registerPromptContext(ctx: Context, operations: SpaceOperations): () => void {
  return ctx.systemPrompt.context({
    name: PROMPT_CONTEXT_NAME,
    order: PROMPT_CONTEXT_ORDER,
    text: (context: AssembleContext) => {
      const agent = context.agent
      if (!agent)
        return ''
      const sessionId = String(agent.session.id)
      const item = operations.snapshot().items.find(row => row.sessionIds.includes(sessionId))
      if (!item || item.kind === 'plain')
        return ''
      if (item.kind === 'chat')
        return `当前会话属于对话工作区「${item.title}」。固定入口目录：${item.path}`
      const members = item.members.map(member => `- ${member.mode === 'link' && member.linkName ? `${item.path}/projects/${member.linkName} -> ${member.path}` : member.path}${member.path === item.primary ? '（主成员）' : ''}`)
      return [`当前会话属于多项目工作区「${item.title}」`, `固定入口目录：${item.path}`, '成员目录：', ...members].join('\n')
    },
  })
}
