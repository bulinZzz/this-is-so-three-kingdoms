import { describe, expect, it } from 'vitest'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'
import {
  declareWar,
  makePeace,
  PEACE_TRIBUTE,
  WAR_FAVOR_PENALTY,
} from '../src/core/diplomacy'
import type { GameState } from '../src/core/model'
import { favorBetween, relationBetween } from '../src/core/relations'
import { SANGUO_208 } from '../src/core/scenarios'

function state(): GameState {
  return createInitialState({ scenario: SANGUO_208, seed: 208 })
}

function factionOf(state: GameState, id: string) {
  const faction = state.factions.find((item) => item.id === id)
  if (faction === undefined) {
    throw new Error(`势力不存在：${id}`)
  }
  return faction
}

describe('宣战', () => {
  it('把中立转为敌对，好感下降', () => {
    const game = state()
    game.relations = []

    const result = declareWar(game, 'sunquan')

    expect(result.ok).toBe(true)
    expect(relationBetween(game, 'liubei', 'sunquan')).toBe('hostile')
    expect(favorBetween(game, 'liubei', 'sunquan')).toBe(50 - WAR_FAVOR_PENALTY)
  })

  it('已经敌对时被拒且不扣行动力', () => {
    const game = state()
    game.relations = [{ factions: ['liubei', 'caocao'], kind: 'hostile', favor: 25 }]
    const apBefore = game.actionPoints.liubei

    const result = declareWar(game, 'caocao')

    expect(result.ok).toBe(false)
    expect(game.actionPoints.liubei).toBe(apBefore)
  })
})

describe('求和', () => {
  it('敌对转中立，赔款由己方转给对方', () => {
    const game = state()
    game.relations = [{ factions: ['liubei', 'caocao'], kind: 'hostile', favor: 25 }]
    const moneyBefore = factionOf(game, 'liubei').money
    const targetMoneyBefore = factionOf(game, 'caocao').money

    const result = makePeace(game, 'caocao')

    expect(result.ok).toBe(true)
    expect(relationBetween(game, 'liubei', 'caocao')).toBe('neutral')
    expect(factionOf(game, 'liubei').money).toBe(moneyBefore - PEACE_TRIBUTE)
    expect(factionOf(game, 'caocao').money).toBe(targetMoneyBefore + PEACE_TRIBUTE)
    expect(game.actionPoints.liubei).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.makePeace)
  })

  it('赔款不足时被拒且不扣行动力', () => {
    const game = state()
    game.relations = [{ factions: ['liubei', 'caocao'], kind: 'hostile', favor: 25 }]
    factionOf(game, 'liubei').money = PEACE_TRIBUTE - 1
    const apBefore = game.actionPoints.liubei

    const result = makePeace(game, 'caocao')

    expect(result.ok).toBe(false)
    expect(game.actionPoints.liubei).toBe(apBefore)
  })

  it('并不敌对时被拒且不扣行动力', () => {
    const game = state()
    const apBefore = game.actionPoints.liubei

    const result = makePeace(game, 'caocao')

    expect(result.ok).toBe(false)
    expect(game.actionPoints.liubei).toBe(apBefore)
  })

  it('宣战、进攻与求和无法在同一季内走完', () => {
    expect(
      ACTION_COSTS.declareWar + ACTION_COSTS.attack + ACTION_COSTS.makePeace,
    ).toBeGreaterThan(ACTION_POINTS_PER_TURN)
  })
})
