import { expect, it } from 'vitest'
import { moveBefore, sessionOrderMoves } from './session-order.ts'

it('只移动已有 ID，支持末尾和无效锚点', () => {
  expect(moveBefore(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a'])
  expect(moveBefore(['a', 'b'], 'a', 'missing')).toEqual(['a', 'b'])
  expect(moveBefore(['a', 'b'], 'missing', 'a')).toEqual(['a', 'b'])
})

it('写回显示顺序保留隐藏槽位，不移动隐藏会话', () => {
  const core = ['a', 'hidden', 'b', 'c']
  for (const desired of [['a', 'c', 'b'], ['c', 'b', 'a'], ['b', 'a', 'c'], ['b', 'c', 'a']]) {
    const moves = sessionOrderMoves(core, desired)
    let result = core
    for (const move of moves) {
      expect(move.id).not.toBe('hidden')
      result = moveBefore(result, move.id, move.before)
    }
    expect(result).toEqual([desired[0], 'hidden', ...desired.slice(1)])
  }
  expect(sessionOrderMoves(core, ['a', 'b', 'c'])).toEqual([])
})

it('拒绝跨工作区和重复会话', () => {
  expect(() => sessionOrderMoves(['a', 'b'], ['a', 'foreign'])).toThrow('归属已变更')
  expect(() => sessionOrderMoves(['a', 'b'], ['a', 'a'])).toThrow('归属已变更')
})
