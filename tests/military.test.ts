import { describe, expect, it } from 'vitest'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'
import { granaryOf } from '../src/core/granary'
import {
  assignStation,
  factionTroops,
  GRAIN_HARVEST_PER_POLITICS,
  harvestGrain,
  harvestGrainBaseline,
  hasActedThisTurn,
  isFactionDestroyed,
  markActed,
  POPULATION_LOSS_PER_GRAIN,
  readyOfficers,
  RECRUIT_TROOPS_PER_COMMAND,
  recruit,
  recruitGrainCost,
  recruitMoneyCost,
  removeTroops,
  resettleTroops,
  troopLimit,
} from '../src/core/military'
import { LOGISTICS_FULL_TROOPS } from '../src/core/logistics'
import type { FactionId, GameState } from '../src/core/model'
import { advanceTurn } from '../src/core/turn'

function factionOf(state: GameState, id: FactionId) {
  const faction = state.factions.find((item) => item.id === id)
  if (faction === undefined) {
    throw new Error(`势力不存在：${id}`)
  }
  return faction
}

function characterOf(state: GameState, id: string) {
  const character = state.characters.find((item) => item.id === id)
  if (character === undefined) {
    throw new Error(`武将不存在：${id}`)
  }
  return character
}

function siteOf(state: GameState, id: string) {
  const site = state.geography.sites.find((item) => item.id === id)
  if (site === undefined) {
    throw new Error(`战略点不存在：${id}`)
  }
  return site
}

describe('征兵', () => {
  it('在本方战略点征兵：兵力按统率浮动、粮与金按统率基准扣除，扣行动力并写记录', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')
    const grainBefore = factionOf(state, 'liubei').grain
    const moneyBefore = factionOf(state, 'liubei').money
    const baseline = guanyu.command * RECRUIT_TROOPS_PER_COMMAND
    const populationBefore = siteOf(state, 'gongan').population

    const result = recruit(state, 'gongan', 'guanyu')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.kind).toBe('recruit')
      expect(result.record.targetId).toBe('gongan')
    }
    const gained = guanyu.troops - 1000
    expect(gained).toBeGreaterThanOrEqual(Math.round(baseline * 0.9))
    expect(gained).toBeLessThanOrEqual(Math.round(baseline * 1.1))
    expect(siteOf(state, 'gongan').population).toBe(populationBefore - gained)
    expect(factionOf(state, 'liubei').grain).toBe(grainBefore - recruitGrainCost(guanyu))
    expect(factionOf(state, 'liubei').money).toBe(moneyBefore - recruitMoneyCost(guanyu))
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.recruit)
    expect(state.history).toHaveLength(1)
  })

  it('金钱不足时拒绝，不扣行动力也不改兵力', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')
    factionOf(state, 'liubei').money = recruitMoneyCost(guanyu) - 1

    expect(recruit(state, 'gongan', 'guanyu')).toEqual({ ok: false, reason: '金钱不足' })
    expect(guanyu.troops).toBe(1000)
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN)
    expect(state.history).toEqual([])
  })

  it('一次征兵不超过该点现有人口，人口随之归零', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')
    const site = siteOf(state, 'gongan')
    site.population = 300

    expect(recruit(state, 'gongan', 'guanyu').ok).toBe(true)
    expect(guanyu.troops).toBe(1300)
    expect(site.population).toBe(0)
  })

  it('人口枯竭时拒绝，不扣行动力也不改兵力', () => {
    const state = createInitialState({ seed: 208 })
    const site = siteOf(state, 'gongan')
    site.population = 0

    expect(recruit(state, 'gongan', 'guanyu')).toEqual({
      ok: false,
      reason: '该点人口不足，无可征之兵',
    })
    expect(characterOf(state, 'guanyu').troops).toBe(1000)
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN)
  })

  it('粮食不足时拒绝，不扣行动力也不改兵力', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')
    factionOf(state, 'liubei').grain = recruitGrainCost(guanyu) - 1

    const result = recruit(state, 'gongan', 'guanyu')

    expect(result).toEqual({ ok: false, reason: '粮食不足' })
    expect(characterOf(state, 'guanyu').troops).toBe(1000)
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN)
    expect(state.history).toEqual([])
  })

  it('只能在本方战略点征兵，他势力武将与不存在的武将都不可征', () => {
    const state = createInitialState({ seed: 208 })

    expect(recruit(state, 'jiangling', 'guanyu')).toEqual({
      ok: false,
      reason: '只能在本方战略点征兵',
    })
    expect(recruit(state, 'gongan', 'zhangliao')).toEqual({
      ok: false,
      reason: '该武将不在此势力',
    })
    expect(recruit(state, 'gongan', 'unknown')).toEqual({ ok: false, reason: '武将不存在' })
  })

  it('征兵占用该武将本季的行动，同一武将一季只能征兵一次', () => {
    const state = createInitialState({ seed: 208 })

    expect(recruit(state, 'gongan', 'guanyu').ok).toBe(true)
    expect(hasActedThisTurn(state, 'guanyu')).toBe(true)
    expect(recruit(state, 'gongan', 'guanyu')).toEqual({ ok: false, reason: '关羽 本回合已行动' })
  })

  it('兵力随带兵上限同幅自增，满员者翻季后仍满员，不能靠上限增长挤出征兵空间', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')
    const limit = troopLimit(guanyu)
    guanyu.troops = limit

    expect(recruit(state, 'gongan', 'guanyu')).toEqual({
      ok: false,
      reason: '关羽 已达带兵上限',
    })

    advanceTurn(state)

    // 上限与兵力同幅提高，缺口不因翻季而缩小。
    expect(troopLimit(guanyu)).toBeGreaterThan(limit)
    expect(guanyu.troops).toBe(troopLimit(guanyu))
    expect(recruit(state, 'gongan', 'guanyu')).toEqual({
      ok: false,
      reason: '关羽 已达带兵上限',
    })
  })

  it('驻将照样可以征兵，征兵后本季已行动', () => {
    const state = createInitialState({ seed: 208 })
    const liuqi = characterOf(state, 'liuqi')

    expect(liuqi.stationedSiteId).toBe('jiangxia')
    expect(recruit(state, 'jiangxia', 'liuqi').ok).toBe(true)
    expect(hasActedThisTurn(state, 'liuqi')).toBe(true)
  })
})

describe('兵员折损与归籍', () => {
  /** 把刘备麾下除指定两人外的兵力清零，便于断言按比例扣减。 */
  function trimArmy(state: GameState): void {
    for (const character of state.characters) {
      if (character.factionId === 'liubei' && character.id !== 'guanyu' && character.id !== 'zhangfei') {
        character.troops = 0
      }
    }
    characterOf(state, 'guanyu').troops = 3000
    characterOf(state, 'zhangfei').troops = 1000
  }

  it('减员按各将现有兵力比例分摊', () => {
    const state = createInitialState({ seed: 208 })
    trimArmy(state)

    expect(removeTroops(state, 'liubei', 400)).toBe(400)
    expect(characterOf(state, 'guanyu').troops).toBe(2700)
    expect(characterOf(state, 'zhangfei').troops).toBe(900)
  })

  it('散兵归入本方各点人口，不超过人口上限，不落入他方', () => {
    const state = createInitialState({ seed: 208 })
    const ownSites = state.geography.sites.filter((site) => site.owner === 'liubei')
    const others = state.geography.sites.filter((site) => site.owner !== 'liubei')
    const ownBefore = ownSites.reduce((sum, site) => sum + site.population, 0)
    const otherBefore = others.map((site) => site.population)

    expect(resettleTroops(state, 'liubei', 1200)).toBe(1200)
    expect(ownSites.reduce((sum, site) => sum + site.population, 0)).toBe(ownBefore + 1200)
    expect(others.map((site) => site.population)).toEqual(otherBefore)
  })

  it('各点俱满时散兵无处落籍，返回实际归入数', () => {
    const state = createInitialState({ seed: 208 })
    for (const site of state.geography.sites) {
      if (site.owner === 'liubei') {
        site.population = 999999999
      }
    }

    expect(resettleTroops(state, 'liubei', 500)).toBe(0)
  })

  it('固定种子下归籍结果可复现', () => {
    const first = createInitialState({ seed: 208 })
    const second = createInitialState({ seed: 208 })

    resettleTroops(first, 'liubei', 900)
    resettleTroops(second, 'liubei', 900)

    expect(first.geography.sites.map((site) => site.population)).toEqual(
      second.geography.sites.map((site) => site.population),
    )
  })
})

describe('征粮', () => {
  it('派部属自本方战略点取粮：入库、占用该武将本季行动、扣行动力并写记录', () => {
    const state = createInitialState({ seed: 208 })
    const zhugeliang = characterOf(state, 'zhugeliang')
    const site = siteOf(state, 'gongan')
    const grainBefore = factionOf(state, 'liubei').grain
    const granaryBefore = granaryOf(site)
    const populationBefore = site.population
    const baseline = harvestGrainBaseline(zhugeliang)

    const result = harvestGrain(state, 'gongan', 'zhugeliang')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.kind).toBe('harvestGrain')
      expect(result.record.targetId).toBe('gongan')
    }
    expect(baseline).toBe(
      Math.round(
        zhugeliang.politics *
          GRAIN_HARVEST_PER_POLITICS *
          Math.min(1, zhugeliang.troops / LOGISTICS_FULL_TROOPS),
      ),
    )
    const gained = factionOf(state, 'liubei').grain - grainBefore
    // 取量不超过该点当前存粮，并自存粮中扣除。
    expect(gained).toBeGreaterThan(0)
    expect(gained).toBeLessThanOrEqual(granaryBefore)
    expect(granaryOf(site)).toBe(granaryBefore - gained)
    expect(site.population).toBe(populationBefore - Math.round(gained * POPULATION_LOSS_PER_GRAIN))
    expect(hasActedThisTurn(state, 'zhugeliang')).toBe(true)
    expect(state.actionPoints[state.playerFaction]).toBe(
      ACTION_POINTS_PER_TURN - ACTION_COSTS.harvestGrain,
    )
  })

  it('产量随兵力增长，兵力清零者几乎征不到粮', () => {
    const state = createInitialState({ seed: 208 })
    const zhugeliang = characterOf(state, 'zhugeliang')
    const withTroops = harvestGrainBaseline(zhugeliang)

    zhugeliang.troops = 0
    expect(harvestGrainBaseline(zhugeliang)).toBe(0)

    zhugeliang.troops = LOGISTICS_FULL_TROOPS
    expect(harvestGrainBaseline(zhugeliang)).toBeGreaterThan(withTroops)
  })

  it('已行动的武将不能再征粮，他势力武将也不可征粮', () => {
    const state = createInitialState({ seed: 208 })

    expect(harvestGrain(state, 'gongan', 'zhugeliang').ok).toBe(true)
    expect(harvestGrain(state, 'gongan', 'zhugeliang')).toEqual({
      ok: false,
      reason: '诸葛亮 本回合已行动',
    })
    expect(harvestGrain(state, 'gongan', 'zhangliao')).toEqual({
      ok: false,
      reason: '该武将不在此势力',
    })
    expect(harvestGrain(state, 'jiangling', 'guanyu')).toEqual({
      ok: false,
      reason: '只能在本方战略点征粮',
    })
  })
})

describe('驻将', () => {
  it('任命驻将耗一点行动力，不改变已行动状态，原驻将自动卸任', () => {
    const state = createInitialState({ seed: 208 })
    state.playerFaction = 'caocao'
    const xiahoudun = characterOf(state, 'xiahoudun')
    const incumbent = characterOf(state, 'manchong')

    expect(incumbent.stationedSiteId).toBe('fancheng')

    const result = assignStation(state, 'fancheng', 'xiahoudun')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.kind).toBe('station')
      expect(result.record.targetId).toBe('fancheng')
      expect(result.record.outcome).toContain('夏侯惇')
    }
    expect(xiahoudun.stationedSiteId).toBe('fancheng')
    expect(incumbent.stationedSiteId).toBeNull()
    expect(hasActedThisTurn(state, 'xiahoudun')).toBe(false)
    expect(state.actionPoints.caocao).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.station)
  })

  it('驻将不再受活动范围限制：名册中任一武将可任到本方任一据点', () => {
    const state = createInitialState({ seed: 208 })
    state.playerFaction = 'caocao'

    // 夏侯惇原守襄阳，长安不在他过去的城池清单里。
    const result = assignStation(state, 'changan', 'xiahoudun')

    expect(result.ok).toBe(true)
    expect(characterOf(state, 'xiahoudun').stationedSiteId).toBe('changan')
  })

  it('他方驻将仍受活动范围限制', () => {
    const state = createInitialState({ seed: 208 })
    state.playerFaction = 'liubei'

    // 以曹操的身份任命：长安不在夏侯惇的清单内。
    const result = assignStation(state, 'changan', 'xiahoudun', 'caocao')

    expect(result).toEqual({ ok: false, reason: '夏侯惇 的活动范围不含此处' })
  })

  it('撤下驻将；无驻将时再撤则拒绝', () => {
    const state = createInitialState({ seed: 208 })
    state.playerFaction = 'caocao'

    expect(assignStation(state, 'fancheng', null).ok).toBe(true)
    expect(characterOf(state, 'manchong').stationedSiteId).toBeNull()
    expect(assignStation(state, 'fancheng', null)).toEqual({ ok: false, reason: '该点没有驻将' })
  })

  it('同一人已是驻将时拒绝；只能在本方战略点任命', () => {
    const state = createInitialState({ seed: 208 })
    state.playerFaction = 'caocao'

    expect(assignStation(state, 'xiangyang', 'xiahoudun')).toEqual({
      ok: false,
      reason: '夏侯惇 已驻守该点',
    })
    expect(assignStation(state, 'gongan', 'xiahoudun')).toEqual({
      ok: false,
      reason: '只能在本方战略点任命驻将',
    })
    expect(assignStation(state, 'fancheng', 'guanyu')).toEqual({
      ok: false,
      reason: '该武将不在此势力',
    })
  })

  it('行动力不足时拒绝，驻将不变', () => {
    const state = createInitialState({ seed: 208 })
    state.playerFaction = 'caocao'
    state.actionPoints.caocao = 0

    expect(assignStation(state, 'fancheng', 'xiahoudun')).toEqual({
      ok: false,
      reason: '行动力不足',
    })
    expect(characterOf(state, 'manchong').stationedSiteId).toBe('fancheng')
  })
})

describe('可行动的武将', () => {
  it('名册中本季未行动的武将都在列；兵为零者仍可征兵，驻将也在列，退场者不在', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')

    expect(readyOfficers(state, 'liubei').map((item) => item.id)).toContain('guanyu')

    markActed(state, 'guanyu')
    expect(readyOfficers(state, 'liubei').map((item) => item.id)).not.toContain('guanyu')

    state.actedCharacterIds = []
    guanyu.troops = 0
    expect(readyOfficers(state, 'liubei').map((item) => item.id)).toContain('guanyu')
    expect(readyOfficers(state, 'liubei').map((item) => item.id)).toContain('liubei')
  })
})

describe('势力兵力', () => {
  it('为在仕武将所统率部队之和', () => {
    const state = createInitialState({ seed: 208 })
    const liubei = state.characters.filter(
      (character) => character.status === 'serving' && character.factionId === 'liubei',
    )

    expect(factionTroops(state, 'liubei')).toBe(
      liubei.reduce((total, character) => total + character.troops, 0),
    )

    recruit(state, 'gongan', 'guanyu')

    expect(factionTroops(state, 'liubei')).toBe(
      liubei.reduce((total, character) => total + character.troops, 0),
    )
  })
})

describe('势力覆灭', () => {
  it('尚有地盘与部属时未覆灭', () => {
    const state = createInitialState({ seed: 208 })

    expect(isFactionDestroyed(state, 'liubei')).toBe(false)
  })

  it('失去全部战略点即视为覆灭', () => {
    const state = createInitialState({ seed: 208 })
    for (const site of state.geography.sites) {
      if (site.owner === 'liubei') {
        site.owner = null
      }
    }

    expect(isFactionDestroyed(state, 'liubei')).toBe(true)
  })

  it('麾下不再有任何在仕武将也视为覆灭', () => {
    const state = createInitialState({ seed: 208 })
    for (const character of state.characters) {
      if (character.factionId === 'sunquan') {
        character.status = 'retired'
        character.factionId = null
        character.stationedSiteId = null
        character.troops = 0
      }
    }

    expect(isFactionDestroyed(state, 'sunquan')).toBe(true)
  })
})
