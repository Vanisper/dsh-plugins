export type DraftIntent = 'message' | 'plan' | 'goal'

/** 只在首次交付时编码为原生命令，草稿正文不包含隐式命令前缀 */
export function draftSubmissionText(text: string, intent: DraftIntent): string {
  if (intent !== 'goal')
    return text
  const objective = text.trim()
  if (!objective)
    throw new Error('请填写目标内容，附件不能代替目标')
  if (/^(?:clear|pause|resume)$|^edit(?:\s|$)/iu.test(objective))
    throw new Error('此内容是原生目标管理参数，请填写完整的新目标描述')
  return `/goal ${text}`
}
