import type { Context } from '@deepseek-ai/cordis'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import type { SpaceOperations } from '../business/operations.ts'
import { COMMAND_NAME } from '../shared/constants.ts'

const usage = 'status | create <name> | enhance <workspace> | attach <workspace> <path> | detach <workspace> <member> | primary <workspace> <member> | chat | drop-space <workspace> | drop-chat <workspace>'

function tokens(input: string): string[] {
  return input.trim().split(/\s+/).filter(Boolean)
}

async function run(operations: SpaceOperations, invocation: CommandInvocation): Promise<CommandResult> {
  const [action = 'status', ...args] = tokens(invocation.rawInput)
  try {
    if (action === 'status')
      return { kind: 'success', text: JSON.stringify(operations.snapshot(), null, 2) }
    if (action === 'create' && args[0]) {
      const result = await operations.execute({ op: 'create-space', name: args[0] })
      return { kind: 'success', text: `已创建多项目工作区 ${JSON.stringify(result.space)}` }
    }
    if (action === 'enhance' && args[0]) {
      await operations.execute({ op: 'enhance-space', workspace: args[0] })
      return { kind: 'success', text: '已为核心工作区添加多项目描述' }
    }
    if (action === 'attach' && args[0] && args[1]) {
      await operations.execute({ op: 'attach', workspace: args[0], target: args[1] })
      return { kind: 'success', text: '已添加成员目录' }
    }
    if ((action === 'detach' || action === 'primary') && args[0] && args[1]) {
      await operations.execute({ op: action, workspace: args[0], target: args[1] })
      return { kind: 'success', text: action === 'detach' ? '已摘除成员目录' : '已更新主成员标记' }
    }
    if (action === 'chat') {
      const result = await operations.execute({ op: 'create-chat', name: args.join(' ') || undefined })
      return { kind: 'success', text: `已创建对话工作区 ${JSON.stringify(result.chat)}` }
    }
    if (action === 'drop-space' && args[0]) {
      await operations.execute({ op: 'drop-space', workspace: args[0] })
      return { kind: 'success', text: '已移除多项目附加描述，核心工作区保留' }
    }
    if (action === 'drop-chat' && args[0]) {
      await operations.execute({ op: 'drop-chat', workspace: args[0] })
      return { kind: 'success', text: '已移除对话附加描述，核心工作区保留' }
    }
    return { kind: 'error', text: `用法：/space ${usage}` }
  }
  catch (error) {
    return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
  }
}

export function registerCommand(ctx: Context, operations: SpaceOperations): () => void {
  return ctx.commands.register({ name: COMMAND_NAME, description: '管理多项目工作区附加描述与对话目录', input: { hint: usage }, handler: invocation => run(operations, invocation) })
}
