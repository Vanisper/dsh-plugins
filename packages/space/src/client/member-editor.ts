import type { MemberItem, ReactLike } from './types.ts'
import { createControls } from './controls.ts'
import { createImeGuard } from './ime.ts'

export interface MemberDraft {
  members: MemberItem[]
  primary?: string
}

export function memberLabel(member: MemberItem): string {
  return member.title
    || member.path.split(/[\\/]/).filter(Boolean).at(-1)
    || member.path
}

export function createMemberEditor(
  React: ReactLike,
) {
  const e = React.createElement
  const { Icon, IconButton } = createControls(React)
  return function MemberEditor({
    draft,
    setDraft,
    original = [],
    onPick,
  }: {
    draft: MemberDraft
    setDraft: (next: MemberDraft) => void
    original?: MemberItem[]
    onPick: (accept: (path: string) => void) => void
  }): unknown {
    const [path, setPath] = React.useState('')
    const [error, setError] = React.useState('')
    const ime = React.useMemo(createImeGuard, [])
    const list = React.useRef<HTMLDivElement | null>(null)
    const positions = React.useRef(new Map<string, number>())
    const members = [...draft.members].sort(
      (a, b) =>
        Number(b.path === draft.primary) - Number(a.path === draft.primary),
    )
    React.useEffect(() => {
      for (const row of list.current?.querySelectorAll<HTMLElement>(
        '[data-member-path]',
      ) ?? []) {
        const path = row.dataset.memberPath!
        const top = row.offsetTop
        const previous = positions.current.get(path)
        if (
          previous !== undefined
          && previous !== top
          && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ) {
          row.animate?.(
            [
              { transform: `translateY(${previous - top}px)` },
              { transform: 'translateY(0)' },
            ],
            { duration: 180, easing: 'ease-out' },
          )
        }
      }
      positions.current.clear()
    }, [draft.primary])
    const selectPrimary = (path: string): void => {
      // 只为用户触发的重排采集可见坐标，避免弹窗显示前的零坐标和编辑区展开影响动画
      positions.current.clear()
      for (const row of list.current?.querySelectorAll<HTMLElement>('[data-member-path]') ?? [])
        positions.current.set(row.dataset.memberPath!, row.offsetTop)
      setDraft({ ...draft, primary: path })
    }
    const add = (value: string): void => {
      const next = value.trim()
      if (!next)
        return
      if (
        draft.members.some(
          member =>
            member.path.replace(/[\\/]+$/, '') === next.replace(/[\\/]+$/, ''),
        )
      ) {
        setError('此目录已在成员列表中')
        return
      }
      if (draft.members.length >= 100) {
        setError('一个空间最多添加 100 个成员')
        return
      }
      setDraft({
        members: [...draft.members, { path: next, mode: 'reference' }],
        primary: draft.primary ?? next,
      })
      setPath('')
      setError('')
    }
    const patch = (member: MemberItem, values: Partial<MemberItem>): void =>
      setDraft({
        ...draft,
        members: draft.members.map(row =>
          row.path === member.path ? { ...row, ...values } : row,
        ),
      })
    return e(
      'div',
      null,
      e(
        'div',
        { className: 'dsh-space-inline-heading' },
        e('h3', null, `成员目录 · ${draft.members.length}`),
      ),
      e(
        'div',
        { ref: list, className: 'dsh-space-member-list' },
        ...members.map(member =>
          e(
            'div',
            {
              'className': 'dsh-space-member',
              'key': member.path,
              'data-member-path': member.path,
            },
            e(
              'div',
              { className: 'dsh-space-member-head' },
              e(Icon, { name: 'folder' }),
              e(
                'div',
                { className: 'dsh-space-member-main' },
                e(
                  'strong',
                  { title: memberLabel(member) },
                  memberLabel(member),
                  member.path === draft.primary
                    ? e('span', { className: 'dsh-space-badge' }, '主要')
                    : null,
                ),
                e('small', { title: member.path }, member.path),
              ),
              e('input', {
                'type': 'radio',
                'name': 'space-primary-member',
                'className': 'dsh-space-member-primary',
                'aria-label':
                  member.path === draft.primary
                    ? '当前主成员'
                    : `将 ${memberLabel(member)} 设为主要`,
                'title': member.path === draft.primary ? '当前主成员' : '设为主要',
                'checked': member.path === draft.primary,
                'onChange': () => selectPrimary(member.path),
              }),
              e(IconButton, {
                icon: 'close',
                label: `移除成员 ${memberLabel(member)}`,
                onClick: () => {
                  const remaining = draft.members.filter(
                    row => row.path !== member.path,
                  )
                  setDraft({
                    members: remaining,
                    primary:
                      draft.primary === member.path
                        ? remaining[0]?.path
                        : draft.primary,
                  })
                },
              }),
            ),
            e(
              'details',
              null,
              e('summary', null, '名称、说明与接入方式'),
              e(
                'div',
                { className: 'dsh-space-member-fields' },
                e(
                  'label',
                  null,
                  '显示名称',
                  e('input', {
                    'aria-label': `${member.path} 显示名称`,
                    'value': member.title ?? '',
                    'placeholder': member.path.split(/[\\/]/).at(-1),
                    'onChange': (event: { target: HTMLInputElement }) =>
                      patch(member, { title: event.target.value }),
                  }),
                ),
                e(
                  'label',
                  null,
                  '接入方式',
                  original.some(row => row.path === member.path)
                    ? e('output', null, member.mode === 'reference' ? '引用' : '符号链接')
                    : e(
                        'select',
                        {
                          value: member.mode,
                          onChange: (event: { target: HTMLSelectElement }) =>
                            patch(member, {
                              mode: event.target.value as MemberItem['mode'],
                              linkName: undefined,
                            }),
                        },
                        e('option', { value: 'reference' }, '引用'),
                        e('option', { value: 'link' }, '符号链接'),
                      ),
                ),
                member.mode === 'link'
                  ? e(
                      'label',
                      { className: 'full' },
                      '链接名称',
                      original.some(row => row.path === member.path)
                        ? e('output', null, member.linkName)
                        : e('input', {
                            value: member.linkName ?? '',
                            placeholder: '默认使用目录名称',
                            onChange: (event: { target: HTMLInputElement }) =>
                              patch(member, {
                                linkName: event.target.value || undefined,
                              }),
                          }),
                    )
                  : null,
                e(
                  'label',
                  { className: 'full' },
                  '说明',
                  e('textarea', {
                    value: member.description ?? '',
                    onChange: (event: { target: HTMLTextAreaElement }) =>
                      patch(member, { description: event.target.value }),
                  }),
                ),
              ),
            ),
          ),
        ),
      ),
      draft.members.length === 0
        ? e('p', { className: 'dsh-space-muted' }, '尚无成员目录')
        : null,
      e(
        'button',
        { type: 'button', className: 'dsh-space-add-member', onClick: () => onPick(add) },
        e(Icon, { name: 'folderPlus' }),
        '添加成员目录',
      ),
      e('details', { className: 'dsh-space-member-manual' }, e('summary', null, '输入目录路径'), e(
        'div',
        { className: 'dsh-space-path-field' },
        e('input', {
          'aria-label': '成员目录路径',
          'value': path,
          'placeholder': '目录完整路径',
          'onCompositionStart': ime.start,
          'onCompositionEnd': ime.end,
          'onChange': (event: { target: HTMLInputElement }) =>
            setPath(event.target.value),
          'onKeyDown': (event: { key: string, nativeEvent: KeyboardEvent, preventDefault: () => void }) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              if (!ime.active(event.nativeEvent))
                add(path)
            }
          },
        }),
        e(IconButton, {
          icon: 'plus',
          label: '添加路径',
          disabled: !path.trim(),
          onClick: () => add(path),
        }),
      )),
      error
        ? e(
            'div',
            { role: 'alert', className: 'dsh-space-error dsh-space-notice' },
            error,
          )
        : null,
    )
  }
}
