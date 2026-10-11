import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import {
  GRAIN_PER_POPULATION,
  grainBalance,
  grainYield,
  growPopulation,
  MAX_DISBAND_RATIO,
  POPULATION_GROWTH_PER_SEASON,
  settleGrain,
  troopUpkeep,
} from '../src/core/economy'
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

describe('每季粮产与军粮', () => {
  it('粮产为自有战略点人口之和乘以单位产粮', () => {
    const state = createInitialState({ seed: 208 })
    const sites = state.geography.sites.filter((site) => site.owner === 'liubei')
    const population = sites.reduce((total, site) => total + site.population, 0)

    expect(sites.length).toBeGreaterThan(0)
    expect(grainYield(state, 'liubei')).toBe(Math.round(population * GRAIN_PER_POPULATION))
  })

  it('类型不参与粮产：把城市改成野地，粮产不变', () => {
    const state = createInitialState({ seed: 208 })
    const site = state.geography.sites.find((item) => item.owner === 'liubei')
    if (site === undefined) {
      throw new Error('刘备没有战略点')
    }
    const before = grainYield(state, 'liubei')

    site.type = 'field'

    expect(grainYield(state, 'liubei')).toBe(before)
  })

  it('军粮随兵力增长', () => {
    const state = createInitialState({ seed: 208 })
    const before = troopUpkeep(state, 'liubei')

    firstServingOfficer(state, 'liubei').troops += 10000

    expect(before).toBeGreaterThan(0)
    expect(troopUpkeep(state, 'liubei')).toBeGreaterThan(before)
  })

  it('净收支为粮产减军粮', () => {
    const state = createInitialState({ seed: 208 })

    expect(grainBalance(state, 'liubei')).toBe(
      grainYield(state, 'liubei') - troopUpkeep(state, 'liubei'),
    )
  })

  it('粮产与军粮相抵，结余入库', () => {
    const state = createInitialState({ seed: 208 })
    const faction = factionOf(state, 'liubei')
    const before = faction.grain
    const balance = grainBalance(state, 'liubei')

    settleGrain(state)

    expect(faction.grain).toBe(before + balance)
  })

  it('收不抵支时粮仓见底，部队按缺口比例逃散、每季有上限，并留记录', () => {
    const state = createInitialState({ seed: 208 })
    const faction = factionOf(state, 'liubei')
    // 断掉粮源并掏空粮仓，使本季军粮无从支付。
    for (const site of state.geography.sites) {
      site.owner = null
    }
    faction.grain = 0

    const troopsBefore = factionTroops(state, 'liubei')

    expect(troopUpkeep(state, 'liubei')).toBeGreaterThan(0)
    expect(troopsBefore).toBeGreaterThan(0)

    settleGrain(state)

    const lost = troopsBefore - factionTroops(state, 'liubei')
    expect(faction.grain).toBe(0)
    expect(factionTroops(state, 'liubei')).toBeGreaterThanOrEqual(0)
    expect(lost).toBeGreaterThan(0)
    // 缺口再大也至多逃散四分之一：逃散是持续失血，不会让部队一季跑光。
    expect(lost).toBeLessThan(troopsBefore * (MAX_DISBAND_RATIO + 0.05))

    const record = state.history.at(-1)
    expect(record?.kind).toBe('disband')
    expect(record?.factionId).toBe('liubei')
    expect(record?.outcome).toContain('逃散')
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
