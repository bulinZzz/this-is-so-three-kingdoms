import { describe, expect, it } from 'vitest'
import { ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'
import { advanceTurn, resolveFactionOrder } from '../src/core/turn'

describe('advanceTurn', () => {
  it('推进一季，回合数同步增加', () => {
    const state = createInitialState({ seed: 208 })

    advanceTurn(state)

    expect(state.currentDate).toEqual({ era: '建安', year: 13, season: 'winter' })
    expect(state.currentTurn).toBe(2)
  })

  it('冬季推进后进入下一年春季', () => {
    const state = createInitialState({ seed: 208 })
    state.currentDate = { era: '建安', year: 12, season: 'winter' }

    advanceTurn(state)

    expect(state.currentDate).toEqual({ era: '建安', year: 13, season: 'spring' })
  })

  it('只有冬季跨年，春、夏、秋只前进一季且年份不变', () => {
    const state = createInitialState({ seed: 208 })
    state.currentDate = { era: '建安', year: 12, season: 'spring' }

    advanceTurn(state)
    expect(state.currentDate).toEqual({ era: '建安', year: 12, season: 'summer' })

    advanceTurn(state)
    expect(state.currentDate).toEqual({ era: '建安', year: 12, season: 'autumn' })

    advanceTurn(state)
    expect(state.currentDate).toEqual({ era: '建安', year: 12, season: 'winter' })

    advanceTurn(state)
    expect(state.currentDate).toEqual({ era: '建安', year: 13, season: 'spring' })
  })

  it('连续推进四季，季节回到春季且年份增加一年', () => {
    const state = createInitialState({ seed: 208 })
    state.currentDate = { era: '建安', year: 12, season: 'spring' }

    for (let season = 0; season < 4; season += 1) {
      advanceTurn(state)
    }

    expect(state.currentDate).toEqual({ era: '建安', year: 13, season: 'spring' })
    expect(state.currentTurn).toBe(5)
  })

  it('每个季节回合数只增加一', () => {
    const state = createInitialState({ seed: 208 })

    for (let step = 1; step <= 4; step += 1) {
      advanceTurn(state)

      expect(state.currentTurn).toBe(1 + step)
    }
  })

  it('不改变势力列表', () => {
    const state = createInitialState({ seed: 208 })
    const before = state.factions.map((faction) => faction.id)

    advanceTurn(state)

    expect(state.factions.map((faction) => faction.id)).toEqual(before)
  })

  it('结束回合后行动力恢复为当季预算', () => {
    const state = createInitialState({ seed: 208 })
    state.actionPoints = 0

    advanceTurn(state)

    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN)
  })

  it('结束回合后本季行动记录清空', () => {
    const state = createInitialState({ seed: 208 })
    state.actionLog.push({ kind: 'seekTalent', targetId: null, outcome: '测试' })

    advanceTurn(state)

    expect(state.actionLog).toEqual([])
  })
})

describe('resolveFactionOrder', () => {
  it('玩家势力排在首位，其余按势力列表顺序', () => {
    const state = createInitialState({ seed: 208 })

    expect(resolveFactionOrder(state)).toEqual(['liubei', 'caocao', 'sunquan'])
  })

  it('包含全部势力且不重复', () => {
    const state = createInitialState({ seed: 208 })
    const order = resolveFactionOrder(state)

    expect(order).toHaveLength(state.factions.length)
    expect(new Set(order).size).toBe(order.length)
  })
})
