import { describe, expect, it } from 'vitest'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'
import {
  factionTroops,
  hasActedThisTurn,
  RECRUIT_GRAIN_COST,
  recruit,
  TROOPS_PER_RECRUIT,
  transfer,
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
  it('在驻地补兵，兵力增加、粮食减少、扣行动力并写记录', () => {
    const state = createInitialState({ seed: 208 })
    const guanyu = characterOf(state, 'guanyu')
    const grainBefore = factionOf(state, 'liubei').grain

    const result = recruit(state, 'guanyu')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.kind).toBe('recruit')
      expect(result.record.targetId).toBe('jiangxia')
    }
    expect(guanyu.troops).toBe(8000 + TROOPS_PER_RECRUIT)
    expect(factionOf(state, 'liubei').grain).toBe(grainBefore - RECRUIT_GRAIN_COST)
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.recruit)
    expect(state.history).toHaveLength(1)
  })

  it('粮食不足时拒绝，不扣行动力也不改兵力', () => {
    const state = createInitialState({ seed: 208 })
    factionOf(state, 'liubei').grain = RECRUIT_GRAIN_COST - 1

    const result = recruit(state, 'guanyu')

    expect(result).toEqual({ ok: false, reason: '粮食不足' })
    expect(characterOf(state, 'guanyu').troops).toBe(8000)
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN)
    expect(state.history).toEqual([])
  })

  it('他势力武将不可征兵', () => {
    const state = createInitialState({ seed: 208 })

    expect(recruit(state, 'zhangliao')).toEqual({ ok: false, reason: '该武将不在此势力' })
    expect(recruit(state, 'unknown')).toEqual({ ok: false, reason: '武将不存在' })
  })

  it('征兵不占用调动与进攻的每回合行动次数', () => {
    const state = createInitialState({ seed: 208 })

    recruit(state, 'guanyu')

    expect(hasActedThisTurn(state, 'guanyu')).toBe(false)
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
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.transfer)
    expect(hasActedThisTurn(state, 'xiahoudun')).toBe(true)
  })

  it('一次可调多人，按人数消耗行动力', () => {
    const state = caocaoTurn()

    const result = transfer(state, ['xiahoudun', 'xiahouyuan'], 'hulao')

    expect(result.ok).toBe(true)
    expect(characterOf(state, 'xiahoudun').stationedSiteId).toBe('hulao')
    expect(characterOf(state, 'xiahouyuan').stationedSiteId).toBe('hulao')
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.transfer * 2)
  })

  it('超过三人时拒绝', () => {
    const state = caocaoTurn()

    expect(transfer(state, ['xiahoudun', 'xiahouyuan', 'jiaxu', 'caocao'], 'hulao')).toEqual({
      ok: false,
      reason: '一次至多调动 3 名武将',
    })
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN)
  })

  it('目标非自有战略点时拒绝', () => {
    const state = caocaoTurn()

    expect(transfer(state, ['xiahoudun'], 'tongguan')).toEqual({
      ok: false,
      reason: '目标不是自有战略点',
    })
    expect(state.actionPoints).toBe(ACTION_POINTS_PER_TURN)
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
    state.actionPoints = 0

    expect(transfer(state, ['xiahoudun'], 'hulao')).toEqual({ ok: false, reason: '行动力不足' })
    expect(characterOf(state, 'xiahoudun').stationedSiteId).toBe('luoyang')
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
