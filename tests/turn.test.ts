import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import { advanceTurn, resolveFactionOrder } from '../src/core/turn'

describe('advanceTurn', () => {
  it('推进一个月，回合数同步增加', () => {
    const state = createInitialState({ seed: 208 })

    advanceTurn(state)

    expect(state.currentDate).toEqual({ year: 208, month: 2 })
    expect(state.currentTurn).toBe(2)
  })

  it('十二月推进后进入下一年一月', () => {
    const state = createInitialState({ seed: 208 })
    state.currentDate = { year: 208, month: 12 }

    advanceTurn(state)

    expect(state.currentDate).toEqual({ year: 209, month: 1 })
  })

  it('连续推进十二个月，年份增加一年且月份回到起点', () => {
    const state = createInitialState({ seed: 208 })

    for (let month = 0; month < 12; month += 1) {
      advanceTurn(state)
    }

    expect(state.currentDate).toEqual({ year: 209, month: 1 })
    expect(state.currentTurn).toBe(13)
  })

  it('不改变势力列表', () => {
    const state = createInitialState({ seed: 208 })
    const before = state.factions.map((faction) => faction.id)

    advanceTurn(state)

    expect(state.factions.map((faction) => faction.id)).toEqual(before)
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
