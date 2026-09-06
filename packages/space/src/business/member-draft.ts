import type { MemberData, SpaceData } from './types.ts'
import { createHash } from 'node:crypto'
import { assertMemberReferences, existingDirectory, memberData } from './member.ts'

export interface MemberInput {
  path: string
  mode?: 'reference' | 'link'
  linkName?: string
  title?: string
  description?: string
}

/** 描述内容版本；不依赖核心标题、会话或排序 */
export function spaceRevision(space: Pick<SpaceData, 'members' | 'primary'>): string {
  return createHash('sha256').update(JSON.stringify([
    space.primary ?? null,
    space.members.map(member => [member.path, member.mode, member.linkName, member.title, member.description]),
  ])).digest('hex')
}

/** 校验整份草稿；已有成员目录暂时离线时仍允许维护其描述 */
export async function prepareMemberDraft(inputs: MemberInput[], primary?: string, existing: MemberData[] = []): Promise<Pick<SpaceData, 'members' | 'primary'>> {
  const members: MemberData[] = []
  for (const input of inputs) {
    const old = existing.find(member => member.path === input.path)
    const path = old?.path ?? await existingDirectory(input.path)
    const member = memberData(input, path)
    if (old && (old.mode !== member.mode || old.linkName !== member.linkName))
      throw new Error('已有成员的接入方式不能直接更改，请先移除并保存，再重新添加')
    members.push(member)
  }
  assertMemberReferences(members)
  const selected = primary ? members[inputs.findIndex(input => input.path === primary)]?.path : members[0]?.path
  if (primary && !selected)
    throw new Error('主成员必须属于当前成员列表')
  return { members, ...(selected ? { primary: selected } : {}) }
}
