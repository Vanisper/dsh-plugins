import type { Context } from '@deepseek-ai/cordis'
import type { DraftCommand, DraftModel, DraftModelSelection, DraftOptions } from '../shared/draft-options.ts'

interface LlmDirectory {
  listProviders: () => Array<{ id: string, name: string }>
  listModels: (provider: string) => Promise<DraftModel[]>
  resolveModelInfo: (provider: string, model: string) => Promise<DraftModel>
}

/** 查询新会话候选配置；不创建 Session，不读取凭据，不修改全局默认值 */
export async function readDraftOptions(ctx: Pick<Context, 'get'>): Promise<DraftOptions> {
  const llm = ctx.get('llm') as LlmDirectory | undefined
  const defaults = ctx.get('agentDefaultModel') as { currentSelection: () => DraftModelSelection } | undefined
  const presets = ctx.get('permissionPresets') as {
    names: readonly string[]
    defaultPreset: string
    optionOf: (name: string) => { value: string, name: string, description?: string }
  } | undefined
  const options: DraftOptions = { current: defaults?.currentSelection() ?? null, groups: [], failures: [] }
  if (presets)
    options.permissions = { currentValue: presets.defaultPreset, options: presets.names.map(name => presets.optionOf(name)) }
  try {
    // 宿主冷读接口可装载预设注册，但不会创建 Agent、Session 或启动轮次
    const agentPresets = ctx.get('agentPresets') as { standingKeyFor: (id?: string) => Promise<object> } | undefined
    const scope = await agentPresets?.standingKeyFor()
    // DSH 0.1.1-rc.2 的命令视图接受预设 scope key；不把它当作 Agent 执行命令
    const commands = ctx.get('commands') as { list: (scope?: object) => readonly DraftCommand[] } | undefined
    if (!commands)
      throw new Error('commands unavailable')
    options.commands = commands.list(scope).map(({ name, description, input }) => ({
      name,
      description,
      ...(input ? { input: { hint: input.hint, ...(input.images ? { images: true } : {}) } } : {}),
    }))
  }
  catch {
    options.commandError = '无法读取宿主命令目录，请重试或更新兼容适配'
  }
  if (!llm)
    return options
  // 分组顺序来自宿主；单个供应商失败不隐藏其他可用候选
  for (const provider of llm.listProviders()) {
    try {
      const catalog = await llm.listModels(provider.id)
      const models: DraftModel[] = []
      for (const item of catalog) {
        const detail = await llm.resolveModelInfo(provider.id, item.id)
        models.push({
          id: item.id,
          name: item.name,
          description: item.description,
          ...(detail.reasoning
            ? {
                reasoning: {
                  efforts: detail.reasoning.efforts.map(({ id, name }) => ({ id, name })),
                  defaultEffort: detail.reasoning.defaultEffort,
                },
              }
            : {}),
        })
      }
      options.groups.push({ id: provider.id, name: provider.name, models })
    }
    catch (cause) {
      options.failures.push({ id: provider.id, name: provider.name, error: cause instanceof Error ? cause.message : String(cause) })
    }
  }
  return options
}
