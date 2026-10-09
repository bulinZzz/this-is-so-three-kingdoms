import { describe, expect, it } from 'vitest'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'
import {
  factionTroops,
  GRAIN_HARVEST_PER_POLITICS,
  GRAIN_HARVEST_PER_SITE,
  harvestGrain,
  harvestGrainBaseline,
  hasActedThisTurn,
  isFactionDestroyed,
  RECRUIT_TROOPS_PER_COMMAND,
  recruit,
  recruitGrainCost,
  transfer,
  transferCandidates,
  troopLimit,
} from '../src/core/military'
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

/** 以曹操为主角，其战略点相邻关系丰富，便于验证调动。 */
function caocaoTurn(): GameState {
  const state = createInitialState({ seed: 208 })
  state.playerFaction = 'caocao'

  return state
}

describe('征兵', () => {
  it('在驻地补兵，兵力按统率浮动、粮食按统率基准扣除，扣行动力并写记录', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')
    const grainBefore = factionOf(state, 'liubei').grain
    const baseline = guanyu.command * RECRUIT_TROOPS_PER_COMMAND

    const result = recruit(state, 'guanyu')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.kind).toBe('recruit')
      expect(result.record.targetId).toBe('jiangxia')
    }
    expect(guanyu.troops).toBeGreaterThanOrEqual(8000 + Math.round(baseline * 0.75))
    expect(guanyu.troops).toBeLessThanOrEqual(8000 + Math.round(baseline * 1.25))
    expect(factionOf(state, 'liubei').grain).toBe(grainBefore - recruitGrainCost(guanyu))
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.recruit)
    expect(state.history).toHaveLength(1)
  })

  it('粮食不足时拒绝，不扣行动力也不改兵力', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')
    factionOf(state, 'liubei').grain = recruitGrainCost(guanyu) - 1

    const result = recruit(state, 'guanyu')

    expect(result).toEqual({ ok: false, reason: '粮食不足' })
    expect(characterOf(state, 'guanyu').troops).toBe(8000)
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN)
    expect(state.history).toEqual([])
  })

  it('他势力武将不可征兵', () => {
    const state = createInitialState({ seed: 208 })

    expect(recruit(state, 'zhangliao')).toEqual({ ok: false, reason: '该武将不在此势力' })
    expect(recruit(state, 'unknown')).toEqual({ ok: false, reason: '武将不存在' })
  })

  it('征兵占用该武将本季的行动，同一武将一季只能征兵一次', () => {
    const state = createInitialState({ seed: 208 })

    expect(recruit(state, 'guanyu').ok).toBe(true)
    expect(hasActedThisTurn(state, 'guanyu')).toBe(true)
    expect(recruit(state, 'guanyu')).toEqual({ ok: false, reason: '关羽 本回合已行动' })
  })

  it('补到统率所限的带兵上限为止，满员后不再能征兵', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')
    const limit = troopLimit(guanyu)
    guanyu.troops = limit - 1

    expect(recruit(state, 'guanyu').ok).toBe(true)
    expect(guanyu.troops).toBe(limit)

    advanceTurn(state)

    expect(recruit(state, 'guanyu')).toEqual({ ok: false, reason: '关羽 已达带兵上限' })
  })
})

describe('征粮', () => {
  it('派部属征粮：粮食入库、占用该武将本季行动、扣行动力并写记录', () => {
    const state = createInitialState({ seed: 208 })
    const zhugeliang = characterOf(state, 'zhugeliang')
    const grainBefore = factionOf(state, 'liubei').grain
    const sites = state.geography.sites.filter((site) => site.owner === 'liubei').length
    const baseline = harvestGrainBaseline(state, zhugeliang)

    const result = harvestGrain(state, 'zhugeliang')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.kind).toBe('harvestGrain')
      expect(result.record.targetId).toBe('jiangxia')
    }
    expect(baseline).toBe(
      zhugeliang.politics * GRAIN_HARVEST_PER_POLITICS + sites * GRAIN_HARVEST_PER_SITE,
    )
    expect(factionOf(state, 'liubei').grain).toBeGreaterThanOrEqual(
      grainBefore + Math.round(baseline * 0.75),
    )
    expect(factionOf(state, 'liubei').grain).toBeLessThanOrEqual(
      grainBefore + Math.round(baseline * 1.25),
    )
    expect(hasActedThisTurn(state, 'zhugeliang')).toBe(true)
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.harvestGrain)
  })

  it('产量随自有战略点数增长', () => {
    const state = createInitialState({ seed: 208 })
    const zhugeliang = characterOf(state, 'zhugeliang')
    const before = harvestGrainBaseline(state, zhugeliang)

    const extra = state.geography.sites.find((site) => site.owner === 'caocao')
    if (extra === undefined) {
      throw new Error('没有可改归属的战略点')
    }
    extra.owner = 'liubei'

    expect(harvestGrainBaseline(state, zhugeliang)).toBe(before + GRAIN_HARVEST_PER_SITE)
  })

  it('已行动的武将不能再征粮，他势力武将也不可征粮', () => {
    const state = createInitialState({ seed: 208 })

    expect(harvestGrain(state, 'zhugeliang').ok).toBe(true)
    expect(harvestGrain(state, 'zhugeliang')).toEqual({
      ok: false,
      reason: '诸葛亮 本回合已行动',
    })
    expect(harvestGrain(state, 'zhangliao')).toEqual({ ok: false, reason: '该武将不在此势力' })
  })
})

describe('调动', () => {
  it('把武将及其部队调到相邻的自有战略点', () => {
    const state = caocaoTurn()
    const xiahoudun = characterOf(state, 'xiahoudun')

    const result = transfer(state, ['xiahoudun'], 'hulao')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.kind).toBe('transfer')
      expect(result.record.targetId).toBe('hulao')
    }
    expect(xiahoudun.stationedSiteId).toBe('hulao')
    expect(xiahoudun.troops).toBe(8000)
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.transfer)
    expect(hasActedThisTurn(state, 'xiahoudun')).toBe(true)
  })

  it('一次可调多人，按人数消耗行动力', () => {
    const state = caocaoTurn()

    const result = transfer(state, ['xiahoudun', 'xiahouyuan'], 'hulao')

    expect(result.ok).toBe(true)
    expect(characterOf(state, 'xiahoudun').stationedSiteId).toBe('hulao')
    expect(characterOf(state, 'xiahouyuan').stationedSiteId).toBe('hulao')
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.transfer * 2)
  })

  it('超过三人时拒绝', () => {
    const state = caocaoTurn()

    expect(transfer(state, ['xiahoudun', 'xiahouyuan', 'jiaxu', 'caocao'], 'hulao')).toEqual({
      ok: false,
      reason: '一次至多调动 3 名武将',
    })
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN)
  })

  it('目标非自有战略点时拒绝', () => {
    const state = caocaoTurn()

    expect(transfer(state, ['xiahoudun'], 'tongguan')).toEqual({
      ok: false,
      reason: '目标不是自有战略点',
    })
    expect(state.actionPoints[state.playerFaction]).toBe(ACTION_POINTS_PER_TURN)
  })

  it('目标与驻地不相邻时拒绝', () => {
    const state = caocaoTurn()

    expect(transfer(state, ['xiahoudun'], 'chenliu')).toEqual({
      ok: false,
      reason: '夏侯惇 的驻地与目标不相邻',
    })
  })

  it('同一武将每回合至多调动一次，结束回合后恢复', () => {
    const state = caocaoTurn()

    expect(transfer(state, ['xiahoudun'], 'hulao').ok).toBe(true)
    expect(transfer(state, ['xiahoudun'], 'luoyang')).toEqual({
      ok: false,
      reason: '夏侯惇 本回合已行动',
    })

    advanceTurn(state)

    expect(hasActedThisTurn(state, 'xiahoudun')).toBe(false)
    expect(transfer(state, ['xiahoudun'], 'luoyang').ok).toBe(true)
  })

  it('行动力不足时拒绝，状态不变', () => {
    const state = caocaoTurn()
    state.actionPoints[state.playerFaction] = 0

    expect(transfer(state, ['xiahoudun'], 'hulao')).toEqual({ ok: false, reason: '行动力不足' })
    expect(characterOf(state, 'xiahoudun').stationedSiteId).toBe('luoyang')
  })

  it('退场者不在调动候选之列，也不计入势力兵力', () => {
    const state = caocaoTurn()
    const xiahoudun = characterOf(state, 'xiahoudun')
    const before = factionTroops(state, 'caocao')
    const hisTroops = xiahoudun.troops

    expect(transferCandidates(state, 'hulao').map((item) => item.id)).toContain('xiahoudun')

    xiahoudun.status = 'retired'
    xiahoudun.factionId = null
    xiahoudun.stationedSiteId = null
    xiahoudun.troops = 0

    expect(transferCandidates(state, 'hulao').map((item) => item.id)).not.toContain('xiahoudun')
    expect(factionTroops(state, 'caocao')).toBe(before - hisTroops)
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

    recruit(state, 'guanyu')

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
