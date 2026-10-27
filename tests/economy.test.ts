import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import {
  DESERTION_SHARE,
  grainBalance,
  granaryIncome,
  growGranary,
  growPopulation,
  moneyYield,
  MONEY_PER_POPULATION,
  POPULATION_GROWTH_PER_SEASON,
  settleGrain,
  settleMoney,
  shipGranary,
  siteMoneyYield,
  troopUpkeep,
} from '../src/core/economy'
import {
  granaryCap,
  granaryGrowth,
  granaryOf,
  GRANARY_SHIP_RATIO,
} from '../src/core/granary'
import { factionTroops } from '../src/core/military'
import type { FactionId, GameState } from '../src/core/model'

function factionOf(state: GameState, id: FactionId) {
  const faction = state.factions.find((item) => item.id === id)
  if (faction === undefined) {
    throw new Error(`势力不存在：${id}`)
  }
  return faction
}

function firstServingOfficer(state: GameState, id: FactionId) {
  const officer = state.characters.find(
    (character) => character.factionId === id && character.status === 'serving',
  )
  if (officer === undefined) {
    throw new Error(`势力没有在仕武将：${id}`)
  }
  return officer
}

describe('战略点存粮', () => {
  it('各点按人口折算的增量累积，止于上限', () => {
    const state = createInitialState({ seed: 208 })
    const site = state.geography.sites.find((item) => item.owner === 'liubei')
    if (site === undefined) {
      throw new Error('刘备没有战略点')
    }
    site.granary = granaryCap(site) - 1

    growGranary(state)

    expect(granaryOf(site)).toBe(granaryCap(site))
    expect(granaryGrowth(site)).toBe(Math.round(site.population * 0.004))
  })

  it('运回取各点存粮的一部分入库，并自点上扣除', () => {
    const state = createInitialState({ seed: 208 })
    const faction = factionOf(state, 'liubei')
    const sites = state.geography.sites.filter((site) => site.owner === 'liubei')
    const stockBefore = sites.reduce((total, site) => total + granaryOf(site), 0)
    const expected = sites.reduce(
      (total, site) => total + Math.round(granaryOf(site) * GRANARY_SHIP_RATIO),
      0,
    )
    const grainBefore = faction.grain

    const shipped = shipGranary(state, 'liubei')

    expect(shipped).toBe(expected)
    expect(faction.grain).toBe(grainBefore)
    expect(sites.reduce((total, site) => total + granaryOf(site), 0)).toBe(stockBefore - shipped)
  })
})

describe('每季军粮与粮食收支', () => {
  it('军粮随兵力增长', () => {
    const state = createInitialState({ seed: 208 })
    const before = troopUpkeep(state, 'liubei')

    firstServingOfficer(state, 'liubei').troops += 10000

    expect(before).toBeGreaterThan(0)
    expect(troopUpkeep(state, 'liubei')).toBeGreaterThan(before)
  })

  it('净收支为运回减军粮', () => {
    const state = createInitialState({ seed: 208 })

    expect(grainBalance(state, 'liubei')).toBe(
      granaryIncome(state, 'liubei') - troopUpkeep(state, 'liubei'),
    )
  })

  it('结算：各点存粮先增，再按保有量运回，扣军粮后入库', () => {
    const state = createInitialState({ seed: 208 })
    const faction = factionOf(state, 'liubei')
    const before = faction.grain

    // 预览与结算同口径：界面上的运回值就是结算后到账的那一笔。
    const income = granaryIncome(state, 'liubei')
    const upkeep = troopUpkeep(state, 'liubei')

    settleGrain(state)

    expect(faction.grain).toBe(Math.max(0, before + income - upkeep))
  })

  it('粮仓见底时每季逃兵一成，散入本方各点人口并写入历史', () => {
    const state = createInitialState({ seed: 208 })
    const faction = factionOf(state, 'liubei')
    // 断掉粮源：人口与存粮皆为零，本季运不回粮，也付不出军粮。
    for (const site of state.geography.sites) {
      site.population = 0
      site.granary = 0
    }
    faction.grain = 0
    const troopsBefore = factionTroops(state, 'liubei')
    const deserters = Math.ceil(troopsBefore * DESERTION_SHARE)

    expect(troopUpkeep(state, 'liubei')).toBeGreaterThan(0)

    settleGrain(state)

    expect(faction.grain).toBe(0)
    expect(factionTroops(state, 'liubei')).toBe(troopsBefore - deserters)
    expect(
      state.geography.sites
        .filter((site) => site.owner === 'liubei')
        .reduce((sum, site) => sum + site.population, 0),
    ).toBe(deserters)
    expect(
      state.history.some(
        (record) => record.kind === 'desertion' && record.factionId === 'liubei',
      ),
    ).toBe(true)
  })
})

describe('每季人口缓增', () => {
  it('各战略点按同一比例增长，人口只增不减', () => {
    const state = createInitialState({ seed: 208 })
    const before = new Map(state.geography.sites.map((site) => [site.id, site.population]))

    growPopulation(state)

    for (const site of state.geography.sites) {
      const previous = before.get(site.id) ?? 0
      expect(site.population).toBe(previous + Math.round(previous * POPULATION_GROWTH_PER_SEASON))
      expect(site.population).toBeGreaterThanOrEqual(previous)
    }
  })

  it('与随机流无关，同一初始状态下结果可复现', () => {
    const first = createInitialState({ seed: 208 })
    const second = createInitialState({ seed: 208 })

    growPopulation(first)
    growPopulation(second)

    expect(first.geography.sites.map((site) => site.population)).toEqual(
      second.geography.sites.map((site) => site.population),
    )
  })
})

describe('每季金钱收入', () => {
  it('税收为自有战略点人口之和换算，随人口与领地增长', () => {
    const state = createInitialState({ seed: 208 })
    const sites = state.geography.sites.filter((site) => site.owner === 'liubei')
    const expected = sites.reduce((total, site) => total + siteMoneyYield(site), 0)

    expect(sites.length).toBeGreaterThan(0)
    expect(siteMoneyYield(sites[0])).toBe(Math.round(sites[0].population * MONEY_PER_POPULATION))
    expect(moneyYield(state, 'liubei')).toBe(expected)
  })

  it('无自有战略点时没有税收', () => {
    const state = createInitialState({ seed: 208 })
    for (const site of state.geography.sites) {
      site.owner = null
    }

    expect(moneyYield(state, 'liubei')).toBe(0)
  })

  it('结余入库，金钱只增不减（无支出时）', () => {
    const state = createInitialState({ seed: 208 })
    const faction = factionOf(state, 'liubei')
    const before = faction.money
    const income = moneyYield(state, 'liubei')

    settleMoney(state)

    expect(income).toBeGreaterThan(0)
    expect(faction.money).toBe(before + income)
  })
})
