/** 在同一列表内移动，省略锚点表示放到末尾 */
export function moveBefore(order: readonly string[], id: string, before?: string): string[] {
  if (id === before || !order.includes(id) || (before && !order.includes(before)))
    return [...order]
  const result = order.filter(value => value !== id)
  result.splice(before ? result.indexOf(before) : result.length, 0, id)
  return result
}

/** 将当前展示顺序写回核心列表，隐藏会话保留原有槽位 */
export function sessionOrderMoves(core: readonly string[], visible: readonly string[]): Array<{ id: string, before?: string }> {
  const included = new Set(visible)
  if (included.size !== visible.length || visible.some(id => !core.includes(id)))
    throw new Error('会话归属已变更，请重新检查列表')
  let index = 0
  const desired = core.map(id => included.has(id) ? visible[index++]! : id)
  let current = [...core]
  const moves: Array<{ id: string, before?: string }> = []
  for (let index = desired.length - 1; index >= 0; index--) {
    const id = desired[index]!
    const before = desired[index + 1]
    if (!included.has(id) || current[current.indexOf(id) + 1] === before)
      continue
    moves.push({ id, before })
    current = moveBefore(current, id, before)
  }
  return moves
}
