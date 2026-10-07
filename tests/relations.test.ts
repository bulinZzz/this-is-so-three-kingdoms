import { describe, expect, it } from 'vitest'
import { attack, isAttackable } from '../src/core/battle'
import { createInitialState } from '../src/core/createInitialState'
import { areAllied, areHostile, relationBetween } from '../src/core/relations'
import { SANGUO_208 } from '../src/core/scenarios'

describe('势力关系', () => {
  it('开局关系取自剧本：刘孙同盟，刘曹与曹孙敌对', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })

    expect(areAllied(state, 'liubei', 'sunquan')).toBe(true)
    expect(areHostile(state, 'liubei', 'caocao')).toBe(true)
    expect(areHostile(state, 'caocao', 'sunquan')).toBe(true)
    // 关系对称：反过来查也是同一结果。
    expect(relationBetween(state, 'sunquan', 'liubei')).toBe('ally')
  })

  it('同盟之间不能进攻', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })

    expect(isAttackable(state, 'chaisang')).toBe(false)
    expect(attack(state, { commander: 'guanyu' }, 'chaisang')).toEqual({
      ok: false,
      reason: '与对方同盟，不能进攻',
    })
  })
})
