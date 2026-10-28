import { describe, expect, it } from 'vitest'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { BUILD_COST, build } from '../src/core/construction'
import { createInitialState } from '../src/core/createInitialState'
import {
  damageOnCapture,
  DEVELOPMENT_KINDS,
  developmentLevel,
  developmentLimit,
  developmentRequirement,
  populationCap,
  siteProgressOf,
} from '../src/core/development'
import { grownPopulationOf, growPopulation, moneyYield } from '../src/core/economy'
import { granaryGrowth } from '../src/core/granary'
import type { Character, GameState, Site } from '../src/core/model'
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

/** 刘备据公安（大城），给足金钱便于测试建设。 */
function richState(): GameState {
  const state = createInitialState({ seed: 208 })
  factionOf(state, 'liubei').money = 100000
  return state
}

/** 主持建设的武将：刘备内政 80，补足兵力使一次动工推进 640 点。 */
function builderOf(state: GameState): Character {
  const officer = state.characters.find((item) => item.id === 'liubei')
  if (officer === undefined) {
    throw new Error('武将不存在：liubei')
  }
  officer.troops = 3000
  return officer
}

/** 把每次动工都当作新的一季：清掉已行动状态，专测建设本身。 */
function buildInNewTurn(
  state: GameState,
  siteId: string,
  kind: (typeof DEVELOPMENT_KINDS)[number],
  characterId = 'liubei',
) {
  state.actedCharacterIds = []
  state.actionPoints[state.playerFaction] = ACTION_POINTS_PER_TURN
  return build(state, siteId, kind, characterId)
}

describe('建设进度与上限', () => {
  it('每次动工固定二百金，进度按内政与兵力推进，攒够即升级', () => {
    const state = richState()
    const officer = builderOf(state)
    const faction = factionOf(state, 'liubei')
    const site = siteOf(state, 'gongan')
    const moneyBefore = faction.money
    const apBefore = state.actionPoints.liubei

    const result = build(state, site.id, 'farm', officer.id)

    expect(result.ok).toBe(true)
    // 内政 80、兵力满员：80 × 8 = 640，越过第一级所需的 500。
    expect(developmentLevel(site, 'farm')).toBe(1)
    expect(siteProgressOf(site, 'farm')).toBe(640 - developmentRequirement(0))
    expect(faction.money).toBe(moneyBefore - BUILD_COST)
    expect(state.actionPoints.liubei).toBe(apBefore - ACTION_COSTS.build)
    expect(state.actedCharacterIds).toContain(officer.id)
  })

  it('级别越高所需进度越长', () => {
    for (let level = 0; level < developmentLimit(siteOf(richState(), 'gongan')) - 1; level += 1) {
      expect(developmentRequirement(level + 1)).toBeGreaterThan(developmentRequirement(level))
    }

    const state = richState()
    builderOf(state)
    const site = siteOf(state, 'gongan')
    buildInNewTurn(state, site.id, 'farm')
    expect(developmentLevel(site, 'farm')).toBe(1)
    // 第二级需要 750：一次 640 不够，再来一次才升。
    buildInNewTurn(state, site.id, 'farm')
    expect(developmentLevel(site, 'farm')).toBe(2)
  })

  it('上限按战略点类型定档', () => {
    const state = richState()

    expect(developmentLimit(siteOf(state, 'gongan'))).toBe(5)
    expect(developmentLimit(siteOf(state, 'hulao'))).toBe(3)
    // 野地无归属，不可建设。
    expect(developmentLimit(siteOf(state, 'chibi'))).toBe(0)
  })
})

describe('建设行动', () => {
  it('农田提高粮产，并扣钱扣行动力', () => {
    const state = richState()
    const officer = builderOf(state)
    const faction = factionOf(state, 'liubei')
    const site = siteOf(state, 'gongan')
    const growthBefore = granaryGrowth(site)
    const moneyBefore = faction.money
    const apBefore = state.actionPoints.liubei

    const result = build(state, site.id, 'farm', officer.id)

    expect(result.ok).toBe(true)
    expect(developmentLevel(site, 'farm')).toBe(1)
    expect(granaryGrowth(site)).toBeGreaterThan(growthBefore)
    expect(faction.money).toBe(moneyBefore - BUILD_COST)
    expect(state.actionPoints.liubei).toBe(apBefore - ACTION_COSTS.build)
  })

  it('市集提高金钱产出', () => {
    const state = richState()
    builderOf(state)
    const site = siteOf(state, 'gongan')
    const before = moneyYield(state, 'liubei')

    build(state, site.id, 'market', 'liubei')

    expect(developmentLevel(site, 'market')).toBe(1)
    expect(moneyYield(state, 'liubei')).toBeGreaterThan(before)
  })

  it('民居只抬高人口上限并加快增长，不再立刻增加人口', () => {
    const state = richState()
    builderOf(state)
    const site = siteOf(state, 'gongan')
    const populationBefore = site.population
    const capBefore = populationCap(site)
    const growthBefore = grownPopulationOf(site)

    build(state, site.id, 'housing', 'liubei')

    expect(site.population).toBe(populationBefore)
    expect(populationCap(site)).toBeGreaterThan(capBefore)
    expect(grownPopulationOf(site)).toBeGreaterThan(growthBefore)
  })

  it('非自有战略点被拒且不扣行动力', () => {
    const state = richState()
    builderOf(state)
    const apBefore = state.actionPoints.liubei

    const result = build(state, 'xiangyang', 'farm', 'liubei')

    expect(result.ok).toBe(false)
    expect(state.actionPoints.liubei).toBe(apBefore)
  })

  it('金钱不足被拒且不扣行动力', () => {
    const state = richState()
    builderOf(state)
    factionOf(state, 'liubei').money = 0
    const apBefore = state.actionPoints.liubei

    const result = build(state, 'gongan', 'farm', 'liubei')

    expect(result.ok).toBe(false)
    expect(state.actionPoints.liubei).toBe(apBefore)
    expect(developmentLevel(siteOf(state, 'gongan'), 'farm')).toBe(0)
  })

  it('执行武将本季已行动时被拒', () => {
    const state = richState()
    builderOf(state)
    state.actedCharacterIds.push('liubei')

    const result = build(state, 'gongan', 'farm', 'liubei')

    expect(result).toEqual({ ok: false, reason: '刘备 本回合已行动' })
    expect(developmentLevel(siteOf(state, 'gongan'), 'farm')).toBe(0)
  })

  it('兵力清零时几乎推进不了进度，但仍耗钱与行动力', () => {
    const state = richState()
    const officer = builderOf(state)
    officer.troops = 0
    const faction = factionOf(state, 'liubei')
    const moneyBefore = faction.money

    const result = build(state, 'gongan', 'farm', officer.id)

    expect(result.ok).toBe(true)
    expect(developmentLevel(siteOf(state, 'gongan'), 'farm')).toBe(0)
    expect(siteProgressOf(siteOf(state, 'gongan'), 'farm')).toBe(0)
    expect(faction.money).toBe(moneyBefore - BUILD_COST)
  })

  it('达到上限后拒绝且不扣行动力', () => {
    const state = richState()
    builderOf(state)
    const site = siteOf(state, 'gongan')
    for (let times = 0; times < 30 && developmentLevel(site, 'farm') < developmentLimit(site); times += 1) {
      expect(buildInNewTurn(state, site.id, 'farm').ok).toBe(true)
    }
    expect(developmentLevel(site, 'farm')).toBe(developmentLimit(site))
    const apBefore = state.actionPoints.liubei

    const result = build(state, site.id, 'farm', 'liubei')

    expect(result.ok).toBe(false)
    expect(state.actionPoints.liubei).toBe(apBefore)
  })
})

describe('易主损耗', () => {
  it('随机令 1–2 项已开发的设施各降一级，在建进度作废', () => {
    const state = richState()
    builderOf(state)
    const site = siteOf(state, 'gongan')
    for (const kind of DEVELOPMENT_KINDS) {
      buildInNewTurn(state, site.id, kind)
    }
    // 再动一次工，留下一段在建进度。
    buildInNewTurn(state, site.id, 'farm')

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
    for (const kind of damaged) {
      expect(siteProgressOf(site, kind)).toBe(0)
    }
  })

  it('无可降的设施时什么也不改', () => {
    const state = richState()

    expect(damageOnCapture(siteOf(state, 'gongan'), createRandom(7))).toEqual([])
  })
})

describe('人口上限', () => {
  it('自然增长止于人口上限', () => {
    const state = richState()
    const site = siteOf(state, 'gongan')
    site.population = populationCap(site)

    growPopulation(state)

    expect(site.population).toBe(populationCap(site))
  })

  it('人口未达上限时按比例缓增', () => {
    const state = richState()
    const site = siteOf(state, 'gongan')
    site.population = 1000
    const cap = populationCap(site)

    growPopulation(state)

    expect(site.population).toBeGreaterThan(1000)
    expect(site.population).toBeLessThan(cap)
  })
})
