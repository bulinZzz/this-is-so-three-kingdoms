import { describe, expect, it } from 'vitest'
import { ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'
import { granaryIncome, troopUpkeep } from '../src/core/economy'
import { TROOPS_LIMIT_GROWTH_PER_COMMAND, troopLimit } from '../src/core/military'
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

  it('跨年时全体武将年龄加一', () => {
    const state = createInitialState({ seed: 208 })
    state.currentDate = { era: '建安', year: 12, season: 'winter' }
    const before = new Map(state.characters.map((character) => [character.id, character.age]))

    advanceTurn(state)

    for (const character of state.characters) {
      expect(character.age).toBe((before.get(character.id) ?? 0) + 1)
    }
  })

  it('未跨年的季节不改变年龄', () => {
    const state = createInitialState({ seed: 208 })
    const before = state.characters.map((character) => character.age)

    advanceTurn(state)

    expect(state.characters.map((character) => character.age)).toEqual(before)
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
    state.actionPoints[state.playerFaction] = 0

    advanceTurn(state)

    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN)
  })

  it('结束回合结算粮食收支：各点运回减军粮', () => {
    const state = createInitialState({ seed: 208 })
    const faction = state.factions.find((item) => item.id === 'liubei')
    if (faction === undefined) {
      throw new Error('势力不存在：liubei')
    }
    const before = faction.grain

    // 预览与结算同口径：结束回合的到账就是界面上那一笔运回减军粮。
    const income = granaryIncome(state, 'liubei')
    const upkeep = troopUpkeep(state, 'liubei')

    advanceTurn(state)

    expect(income).toBeGreaterThan(0)
    expect(upkeep).toBeGreaterThan(0)
    expect(faction.grain).toBe(Math.max(0, before + income - upkeep))
  })

  it('结束回合不改变兵力：兵只从征兵来，只有带兵上限随季提高', () => {
    const state = createInitialState({ seed: 208 })
    const serving = state.characters.filter(
      (character) => character.status === 'serving' && character.factionId === 'liubei',
    )
    const before = new Map(serving.map((character) => [character.id, character.troops]))
    const limits = new Map(serving.map((character) => [character.id, troopLimit(character)]))

    advanceTurn(state)

    for (const character of serving) {
      expect(character.troops).toBe(before.get(character.id) ?? 0)
      expect(troopLimit(character)).toBe(
        (limits.get(character.id) ?? 0) + character.command * TROOPS_LIMIT_GROWTH_PER_COMMAND,
      )
    }
  })

  it('在野武将兵力始终为零', () => {
    const state = createInitialState({ seed: 208 })
    const wild = state.characters.filter((character) => character.status === 'wild')

    advanceTurn(state)

    expect(wild.every((character) => character.troops === 0)).toBe(true)
  })

  it('结束回合后各战略点人口缓增', () => {
    const state = createInitialState({ seed: 208 })
    const before = new Map(state.geography.sites.map((site) => [site.id, site.population]))

    advanceTurn(state)

    for (const site of state.geography.sites) {
      expect(site.population).toBeGreaterThan(before.get(site.id) ?? 0)
    }
  })

  it('缺粮不减员：粮仓归零，部队一兵不动', () => {
    const state = createInitialState({ seed: 208 })
    // 断掉粮源：本季既运不回粮，也付不出军粮。
    for (const site of state.geography.sites) {
      site.population = 0
      site.granary = 0
    }
    const faction = state.factions.find((item) => item.id === 'liubei')
    if (faction === undefined) {
      throw new Error('势力不存在：liubei')
    }
    faction.grain = 0
    const before = new Map(
      state.characters
        .filter((character) => character.factionId === 'liubei')
        .map((character) => [character.id, character.troops]),
    )

    advanceTurn(state)

    expect(faction.grain).toBe(0)
    for (const character of state.characters) {
      if (character.factionId === 'liubei') {
        expect(character.troops).toBe(before.get(character.id) ?? 0)
      }
    }
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

    expect(resolveFactionOrder(state)).toEqual([
      'liubei',
      'caocao',
      'sunquan',
      'liuzhang',
      'mateng',
      'hansui',
      'gongsunkang',
      'shixie',
      'zhanglu',
    ])
  })

  it('包含全部势力且不重复', () => {
    const state = createInitialState({ seed: 208 })
    const order = resolveFactionOrder(state)

    expect(order).toHaveLength(state.factions.length)
    expect(new Set(order).size).toBe(order.length)
  })
})
