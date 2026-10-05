import { describe, expect, it } from 'vitest'
import {
  ACTION_COSTS,
  ACTION_POINTS_PER_TURN,
  type ActionRequest,
  canAfford,
  runAction,
  spendActionPoints,
} from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'

describe('行动力扣减', () => {
  it('执行行动按消耗扣减', () => {
    const state = createInitialState({ seed: 208 })
    const before = state.actionPoints

    expect(spendActionPoints(state, 'seekTalent')).toBe(true)
    expect(state.actionPoints).toBe(before - ACTION_COSTS.seekTalent)
  })

  it('行动力不足时不扣减，状态保持不变', () => {
    const state = createInitialState({ seed: 208 })
    state.actionPoints = 0

    expect(canAfford(state, 'seekTalent')).toBe(false)
    expect(spendActionPoints(state, 'seekTalent')).toBe(false)
    expect(state.actionPoints).toBe(0)
  })
})

describe('runAction', () => {
  const seekTalent = (overrides: Partial<ActionRequest> = {}): ActionRequest => ({
    kind: 'seekTalent',
    execute: () => ({ targetId: 'jing', outcome: '发现一人' }),
    ...overrides,
  })

  it('成功时扣除行动力并写入行动历史', () => {
    const state = createInitialState({ seed: 208 })

    const result = runAction(state, seekTalent())

    const record = {
      kind: 'seekTalent',
      factionId: 'liubei',
      date: { era: '建安', year: 13, season: 'autumn' },
      targetId: 'jing',
      outcome: '发现一人',
    }
    expect(result).toEqual({ ok: true, record })
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.seekTalent)
    expect(state.history).toEqual([record])
  })

  it('前置条件不满足时拒绝，不扣行动力也不记入记录', () => {
    const state = createInitialState({ seed: 208 })

    const result = runAction(state, seekTalent({ precondition: () => '麾下已满' }))

    expect(result).toEqual({ ok: false, reason: '麾下已满' })
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN)
    expect(state.history).toEqual([])
  })

  it('行动力不足时拒绝，状态不变', () => {
    const state = createInitialState({ seed: 208 })
    state.actionPoints = 0

    const result = runAction(state, seekTalent())

    expect(result).toEqual({ ok: false, reason: '行动力不足' })
    expect(state.actionPoints).toBe(0)
    expect(state.history).toEqual([])
  })
})
