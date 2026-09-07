/** 区分输入法组字按键与表单提交，兼容组合结束后仍以 229 标记的按键 */
export function createImeGuard(): {
  start: () => void
  end: () => void
  active: (event?: { isComposing?: boolean, keyCode?: number }) => boolean
} {
  let composing = false
  return {
    start: (): void => { composing = true },
    end: (): void => { composing = false },
    active: (event?: { isComposing?: boolean, keyCode?: number }): boolean =>
      composing || event?.isComposing === true || event?.keyCode === 229,
  }
}
