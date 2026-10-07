import { describe, expect, it } from 'vitest'
import { ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'
import { grainYield } from '../src/core/economy'
import { TROOPS_GROWTH_PER_COMMAND, troopLimit } from '../src/core/military'
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

  it('结束回合按自有战略点收取粮产', () => {
    const state = createInitialState({ seed: 208 })
    const faction = state.factions.find((item) => item.id === 'liubei')
    if (faction === undefined) {
      throw new Error('势力不存在：liubei')
    }
    const before = faction.grain
    const yieldPerSeason = grainYield(state, 'liubei')

    advanceTurn(state)

    expect(yieldPerSeason).toBeGreaterThan(0)
    expect(faction.grain).toBe(before + yieldPerSeason)
  })

  it('结束回合在仕武将按统率自然增长，各方一视同仁', () => {
    const state = createInitialState({ seed: 208 })
    const serving = state.characters.filter((character) => character.status === 'serving')
    const before = new Map(serving.map((character) => [character.id, character.troops]))

    advanceTurn(state)

    for (const character of serving) {
      const gained = character.troops - (before.get(character.id) ?? 0)
      const baseline = character.command * TROOPS_GROWTH_PER_COMMAND

      // 增至带兵上限即止；未达上限者按基准上下浮动。
      expect(gained).toBeLessThanOrEqual(Math.round(baseline * 1.25))
      expect(character.troops).toBeLessThanOrEqual(troopLimit(character))
      if (character.troops < troopLimit(character)) {
        expect(gained).toBeGreaterThanOrEqual(Math.round(baseline * 0.75))
      }
    }
  })

  it('在野武将不参与自然增长', () => {
    const state = createInitialState({ seed: 208 })
    const wild = state.characters.filter((character) => character.status === 'wild')

    advanceTurn(state)

    expect(wild.every((character) => character.troops === 0)).toBe(true)
  })

  it('结束回合保留行动历史', () => {
    const state = createInitialState({ seed: 208 })
    state.history.push({
      kind: 'seekTalent',
      factionId: 'liubei',
      date: { era: '建安', year: 13, season: 'autumn' },
      targetId: null,
      outcome: '测试',
    })

    advanceTurn(state)

    expect(state.history).toHaveLength(1)
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
