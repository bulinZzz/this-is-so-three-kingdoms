import { describe, expect, it } from 'vitest'
import { ACTION_COSTS } from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'
import {
  build,
  buildCost,
  damageOnCapture,
  DEVELOPMENT_KINDS,
  developmentLevel,
  developmentLimit,
  populationCap,
} from '../src/core/development'
import { growPopulation, moneyYield } from '../src/core/economy'
import { granaryGrowth } from '../src/core/granary'
import type { GameState, Site } from '../src/core/model'
import { createRandom } from '../src/core/random'

function siteOf(state: GameState, id: string): Site {
  const site = state.geography.sites.find((item) => item.id === id)
  if (site === undefined) {
    throw new Error(`战略点不存在：${id}`)
  }
  return site
}

function factionOf(state: GameState, id: string) {
  const faction = state.factions.find((item) => item.id === id)
  if (faction === undefined) {
    throw new Error(`势力不存在：${id}`)
  }
  return faction
}

/** 刘备据江夏（城市），给足金钱便于测试建设。 */
function richState(): GameState {
  const state = createInitialState({ seed: 208 })
  factionOf(state, 'liubei').money = 100000
  return state
}

describe('建设花费与上限', () => {
  it('花费随目标等级递增', () => {
    const state = richState()
    const site = siteOf(state, 'jiangxia')

    const first = buildCost(site, 'farm')
    build(state, site.id, 'farm')
    const second = buildCost(site, 'farm')

    expect(second).toBeGreaterThan(first)
  })

  it('上限按战略点类型定档', () => {
    const state = richState()

    expect(developmentLimit(siteOf(state, 'jiangxia'))).toBe(5)
    expect(developmentLimit(siteOf(state, 'sishui'))).toBe(3)
    expect(developmentLimit(siteOf(state, 'guandu'))).toBe(2)
  })
})

describe('建设行动', () => {
  it('农田提高粮产，并扣钱扣行动力', () => {
    const state = richState()
    const faction = factionOf(state, 'liubei')
    const site = siteOf(state, 'jiangxia')
    const growthBefore = granaryGrowth(site)
    const moneyBefore = faction.money
    const apBefore = state.actionPoints.liubei
    const cost = buildCost(site, 'farm')

    const result = build(state, site.id, 'farm')

    expect(result.ok).toBe(true)
    expect(developmentLevel(site, 'farm')).toBe(1)
    expect(granaryGrowth(site)).toBeGreaterThan(growthBefore)
    expect(faction.money).toBe(moneyBefore - cost)
    expect(state.actionPoints.liubei).toBe(apBefore - ACTION_COSTS.build)
  })

  it('市集提高金钱产出', () => {
    const state = richState()
    const site = siteOf(state, 'jiangxia')
    const before = moneyYield(state, 'liubei')

    build(state, site.id, 'market')

    expect(developmentLevel(site, 'market')).toBe(1)
    expect(moneyYield(state, 'liubei')).toBeGreaterThan(before)
  })

  it('民居立即增加人口并抬高人口上限', () => {
    const state = richState()
    const site = siteOf(state, 'jiangxia')
    const populationBefore = site.population
    const capBefore = populationCap(site)

    build(state, site.id, 'housing')

    expect(site.population).toBeGreaterThan(populationBefore)
    expect(populationCap(site)).toBeGreaterThan(capBefore)
  })

  it('非自有战略点被拒且不扣行动力', () => {
    const state = richState()
    const apBefore = state.actionPoints.liubei

    const result = build(state, 'xiangyang', 'farm')

    expect(result.ok).toBe(false)
    expect(state.actionPoints.liubei).toBe(apBefore)
  })

  it('金钱不足被拒且不扣行动力', () => {
    const state = richState()
    factionOf(state, 'liubei').money = 0
    const apBefore = state.actionPoints.liubei

    const result = build(state, 'jiangxia', 'farm')

    expect(result.ok).toBe(false)
    expect(state.actionPoints.liubei).toBe(apBefore)
    expect(developmentLevel(siteOf(state, 'jiangxia'), 'farm')).toBe(0)
  })

  it('达到上限后拒绝且不扣行动力', () => {
    const state = richState()
    const site = siteOf(state, 'jiangxia')
    for (let level = 0; level < developmentLimit(site); level += 1) {
      expect(build(state, site.id, 'farm').ok).toBe(true)
    }
    const apBefore = state.actionPoints.liubei

    const result = build(state, site.id, 'farm')

    expect(result.ok).toBe(false)
    expect(state.actionPoints.liubei).toBe(apBefore)
  })
})

describe('易主损耗', () => {
  it('随机令 1–2 项已开发的设施各降一级', () => {
    const state = richState()
    const site = siteOf(state, 'jiangxia')
    for (const kind of DEVELOPMENT_KINDS) {
      build(state, site.id, kind)
    }
    const totalBefore = DEVELOPMENT_KINDS.reduce(
      (total, kind) => total + developmentLevel(site, kind),
      0,
    )

    const damaged = damageOnCapture(site, createRandom(7))

    expect(damaged.length).toBeGreaterThanOrEqual(1)
    expect(damaged.length).toBeLessThanOrEqual(2)
    const totalAfter = DEVELOPMENT_KINDS.reduce(
      (total, kind) => total + developmentLevel(site, kind),
      0,
    )
    // 每降一项正好掉一级，且被降的项不影响未列出的项。
    expect(totalBefore - totalAfter).toBe(damaged.length)
    expect(new Set(damaged).size).toBe(damaged.length)
  })

  it('无可降的设施时什么也不改', () => {
    const state = richState()

    expect(damageOnCapture(siteOf(state, 'jiangxia'), createRandom(7))).toEqual([])
  })
})

describe('人口上限', () => {
  it('自然增长止于人口上限', () => {
    const state = richState()
    const site = siteOf(state, 'jiangxia')
    site.population = populationCap(site)

    growPopulation(state)

    expect(site.population).toBe(populationCap(site))
  })

  it('人口未达上限时按比例缓增', () => {
    const state = richState()
    const site = siteOf(state, 'jiangxia')
    site.population = 1000
    const cap = populationCap(site)

    growPopulation(state)

    expect(site.population).toBeGreaterThan(1000)
    expect(site.population).toBeLessThan(cap)
  })
})
