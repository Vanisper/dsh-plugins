import type { Context } from '@deepseek-ai/cordis'
import type { JsonValue } from '@deepseek-ai/dsh-tools'
import type { SpaceOperations } from '../business/operations.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { TOOL_NAME } from '../shared/constants.ts'

export function registerTool(ctx: Context, operations: SpaceOperations): () => void {
  const definition = defineTool({
    name: TOOL_NAME,
    description: '读取并维护 dsh-space 的多项目与对话附加描述。核心 Workspace 才拥有会话归属和顺序。',
    parameters: {
      action: { type: 'string', required: true, description: 'list, create-space, enhance-space, attach, detach, primary, title, description, create-chat, drop-space, drop-chat' },
      workspace: { type: 'string', description: '核心 Workspace ID、路径或标题' },
      target: { type: 'string', description: '成员路径或成员显示名' },
      name: { type: 'string', description: '工作区或对话名称' },
      mode: { type: 'string', description: 'reference 或 link' },
      linkName: { type: 'string', description: 'link 成员在壳目录中的名称' },
      title: { type: 'string', description: '成员显示名' },
      description: { type: 'string', description: '成员说明' },
      value: { type: 'string', description: 'title 或 description 的新值' },
    },
    output: {
      schema: { type: 'json' },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    async execute(args) {
      if (args.action === 'list')
        return { ok: true, ...operations.snapshot() } as unknown as JsonValue
      const operation = (() => {
        switch (args.action) {
          case 'create-space': return { op: 'create-space' as const, name: args.name ?? '', folder: args.target, mode: args.mode as 'reference' | 'link' | undefined, linkName: args.linkName, title: args.title, description: args.description }
          case 'enhance-space': return { op: 'enhance-space' as const, workspace: args.workspace ?? '' }
          case 'attach': return { op: 'attach' as const, workspace: args.workspace ?? '', target: args.target ?? '', mode: args.mode as 'reference' | 'link' | undefined, linkName: args.linkName, title: args.title, description: args.description }
          case 'detach': return { op: 'detach' as const, workspace: args.workspace ?? '', target: args.target ?? '' }
          case 'primary': return { op: 'primary' as const, workspace: args.workspace ?? '', target: args.target ?? '' }
          case 'title': return { op: 'title' as const, workspace: args.workspace ?? '', target: args.target ?? '', value: args.value ?? '' }
          case 'description': return { op: 'description' as const, workspace: args.workspace ?? '', target: args.target ?? '', value: args.value ?? '' }
          case 'create-chat': return { op: 'create-chat' as const, name: args.name }
          case 'drop-space': return { op: 'drop-space' as const, workspace: args.workspace ?? '' }
          case 'drop-chat': return { op: 'drop-chat' as const, workspace: args.workspace ?? '' }
          default: throw new Error(`未知动作：${args.action}`)
        }
      })()
      return { ok: true, ...(await operations.execute(operation)) } as unknown as JsonValue
    },
  })
  return ctx.tools.register(definition)
}
