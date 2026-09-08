import type { ReactLike } from './types.ts'
import type { SessionEntry } from './views.ts'
import { createControls } from './controls.ts'

interface Props {
  entries: SessionEntry[]
  missing: number
  pending: boolean
  filtered: boolean
  showHeading?: boolean
}

export function createArchiveView(React: ReactLike): (props: Props) => unknown {
  const e = React.createElement
  const { Icon, IconButton } = createControls(React)
  const planned = (label: string, icon: 'restore' | 'remove'): unknown => e('span', {
    'className': 'dsh-space-planned',
    'tabIndex': 0,
    'role': 'note',
    'aria-label': `${label}：计划支持，当前不可用`,
    'title': `${label}计划支持，等待宿主能力接入`,
  }, e(IconButton, { icon, label: `${label}（计划支持）`, disabled: true, onClick: () => {} }))
  return function ArchiveView({ entries, missing, pending, filtered, showHeading = true }: Props): unknown {
    return e(
      'section',
      { 'className': 'dsh-space-archive', 'aria-label': '已归档会话', 'aria-busy': pending },
      showHeading ? e('div', { className: 'dsh-space-section-head' }, e('span', { className: 'dsh-space-toolbar-title' }, '已归档'), e('span', { className: 'dsh-space-count' }, entries.length || '')) : null,
      e('div', { className: 'dsh-space-planned-notice', role: 'status' }, e(Icon, { name: 'info', size: 14 }), e('span', null, '取消归档、永久删除计划支持，当前宿主能力尚未接入。')),
      pending ? e('div', { className: 'dsh-space-empty', role: 'status' }, '加载归档会话…') : null,
      ...entries.map(({ session, item }) => e(
        'article',
        { 'key': session.id, 'className': 'dsh-space-archive-row', 'data-archived-session-id': session.id },
        e(
          'div',
          { className: 'dsh-space-archive-heading' },
          e('strong', { title: session.displayTitle }, session.displayTitle || '新会话'),
          e('time', { dateTime: new Date(session.updatedAt).toISOString(), title: new Date(session.updatedAt).toLocaleString() }, new Date(session.updatedAt).toLocaleDateString()),
        ),
        e(
          'div',
          { className: 'dsh-space-archive-meta' },
          e(Icon, { name: item?.kind === 'chat' ? 'chat' : 'folder', size: 14 }),
          e('span', { className: 'dsh-space-archive-owner', title: item ? `${item.title}\n${item.path}` : undefined }, item?.title ?? '未归属工作区'),
          planned('取消归档', 'restore'),
          planned('永久删除', 'remove'),
        ),
      )),
      !pending && !entries.length ? e('div', { className: 'dsh-space-empty' }, filtered ? '没有匹配的归档会话' : missing ? '归档摘要暂不可用' : '暂无归档会话') : null,
      missing ? e('div', { className: 'dsh-space-notice', role: 'status' }, `${missing} 条归档记录暂缺会话摘要，未移除这些记录。`) : null,
    )
  }
}
