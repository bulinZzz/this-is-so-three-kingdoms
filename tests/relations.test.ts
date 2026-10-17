import { describe, expect, it } from 'vitest'
import { attack, isAttackable } from '../src/core/battle'
import { createInitialState } from '../src/core/createInitialState'
import { declareWar } from '../src/core/diplomacy'
import {
  adjustFavor,
  areAllied,
  areHostile,
  favorBetween,
  NEUTRAL,
  NEUTRAL_FAVOR,
  relationBetween,
  setRelation,
} from '../src/core/relations'
import { SANGUO_208 } from '../src/core/scenarios'

describe('势力关系', () => {
  it('开局关系取自剧本：孙刘同盟，其余一律中立', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })

    expect(areAllied(state, 'liubei', 'sunquan')).toBe(true)
    expect(areHostile(state, 'liubei', 'caocao')).toBe(false)
    expect(areHostile(state, 'caocao', 'sunquan')).toBe(false)
    expect(relationBetween(state, 'liubei', 'caocao')).toBe(NEUTRAL)
    // 关系对称：反过来查也是同一结果。
    expect(relationBetween(state, 'sunquan', 'liubei')).toBe('ally')
  })

  it('同盟也能宣战，宣战只拒已经敌对者', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })

    // 孙刘开局同盟，关系不是敌对，故宣战照办。
    const result = declareWar(state, 'sunquan')

    expect(result.ok).toBe(true)
    expect(relationBetween(state, 'liubei', 'sunquan')).toBe('hostile')
    expect(declareWar(state, 'sunquan')).toEqual({ ok: false, reason: '与对方已经敌对' })
  })

  it('势力失去全部据点后，其残留的敌对关系不再算敌对', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })

    declareWar(state, 'caocao')
    expect(areHostile(state, 'liubei', 'caocao')).toBe(true)

    // 曹操的据点尽失即已离开版图；关系记录原样留着，判定上却不再算敌对。
    for (const site of state.geography.sites.filter((item) => item.owner === 'caocao')) {
      site.owner = 'liubei'
    }

    expect(relationBetween(state, 'liubei', 'caocao')).toBe('hostile')
    expect(areHostile(state, 'liubei', 'caocao')).toBe(false)
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

describe('好感与状态', () => {
  it('未记录的势力对为中立、好感取中性', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })

    expect(relationBetween(state, 'liubei', 'liubei')).toBe(NEUTRAL)
    expect(favorBetween(state, 'liubei', 'sunquan')).toBe(70)
  })

  it('调整好感并夹在 0–100；未记录的对以中性为起点新建', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })
    state.relations = []

    expect(adjustFavor(state, 'liubei', 'caocao', 10)).toBe(NEUTRAL_FAVOR + 10)
    expect(favorBetween(state, 'liubei', 'caocao')).toBe(NEUTRAL_FAVOR + 10)
    expect(relationBetween(state, 'liubei', 'caocao')).toBe(NEUTRAL)

    expect(adjustFavor(state, 'liubei', 'caocao', 999)).toBe(100)
    expect(adjustFavor(state, 'liubei', 'caocao', -999)).toBe(0)
  })

  it('设置状态保留现有好感；未记录者新建，好感取中性', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })

    setRelation(state, 'liubei', 'caocao', 'neutral')
    expect(relationBetween(state, 'liubei', 'caocao')).toBe('neutral')
    expect(favorBetween(state, 'liubei', 'caocao')).toBe(NEUTRAL_FAVOR)

    setRelation(state, 'caocao', 'sunquan', 'hostile')
    expect(relationBetween(state, 'liubei', 'sunquan')).toBe('ally')
    expect(areAllied(state, 'liubei', 'sunquan')).toBe(true)
  })
})
