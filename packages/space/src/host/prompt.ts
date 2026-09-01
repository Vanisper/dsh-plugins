import type { Context } from '@deepseek-ai/cordis'
import type { AssembleContext } from '@deepseek-ai/dsh-system-prompt'
import type { SpaceEntity } from '../domain/types.ts'
import type { SpacesStore } from '../store/spaces.ts'
import { resolveAllByCwd } from '../domain/resolve.ts'
import { effectivePath } from '../domain/space.ts'
import { PROMPT_CONTEXT_NAME, PROMPT_CONTEXT_ORDER } from '../shared/constants.ts'

/** AssembleContext 是可合并扩展接口；agent 由 agent loop 在请求装配时并入 */
interface MaybeAgentContext {
  agent?: { session?: { header?: { cwd?: string } } }
}

function renderMember(folder: SpaceEntity['folders'][number], primary: string | undefined): string {
  const title = folder.title ? ` — ${folder.title}` : ''
  const desc = folder.desc ? `：${folder.desc}` : ''
  const badge = folder.path === primary ? '（主成员）' : ''
  // link 成员给壳内入口路径（模型在壳内工作时应走它）+ 真实路径
  const target = folder.mode === 'link' && folder.linkPath
    ? `${folder.linkPath} → ${folder.path}`
    : folder.path
  return `- ${target}${title}${desc}${badge}`
}

function renderSpaceMap(space: SpaceEntity, multi: boolean): string {
  const effective = effectivePath(space)
  const entryKind = space.shell ? '壳目录' : '主目录'
  return [
    multi ? `空间「${space.name}」：` : `当前会话属于多项目空间「${space.name}」。`,
    `- 入口目录（${entryKind}）：${effective}`,
    '- 成员文件夹（本工作语境的一部分，读取不限）：',
    ...space.folders.map(item => `  ${renderMember(item, space.primary)}`),
  ].join('\n')
}

/** 注册逐请求求值的空间地图上下文；cwd 不在任何空间的有效路径子树内时不贡献内容 */
export function registerPromptContext(ctx: Context, store: SpacesStore): void {
  const dispose = ctx.systemPrompt.context({
    name: PROMPT_CONTEXT_NAME,
    order: PROMPT_CONTEXT_ORDER,
    text: (context: AssembleContext) => {
      const cwd = (context as AssembleContext & MaybeAgentContext).agent?.session?.header?.cwd
      if (!cwd)
        return ''
      const hits = resolveAllByCwd(store.listSpaces(), cwd)
      if (hits.length === 0)
        return ''
      // 多重归属如实并列呈现（多个空间的有效路径子树重叠时）
      const header = hits.length > 1 ? `当前会话同时属于 ${hits.length} 个多项目空间：` : ''
      const body = hits.map(space => renderSpaceMap(space, hits.length > 1)).join('\n\n')
      return [header, body, '成员目录不是会话入口，新会话从入口目录创建；写入口目录以外的成员受沙盒策略约束（workspace-write 下会被拦截，属预期行为）。'].filter(Boolean).join('\n\n')
    },
  })
  if (dispose)
    ctx.effect(() => dispose)
}
