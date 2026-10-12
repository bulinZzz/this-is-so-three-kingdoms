import { describe, expect, it } from 'vitest'
import { ACTION_COSTS } from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'
import {
  alliance,
  declareWar,
  demand,
  DEMAND_FAVOR_PENALTY,
  DEMAND_GRAIN,
  DEMAND_REFUSE_PENALTY,
  gift,
  GIFT_FAVOR,
  GIFT_MONEY,
  makePeace,
  WAR_FAVOR_PENALTY,
} from '../src/core/diplomacy'
import type { GameState } from '../src/core/model'
import { createRandom } from '../src/core/random'
import { adjustFavor, favorBetween, relationBetween } from '../src/core/relations'
import { SANGUO_208 } from '../src/core/scenarios'

function state(): GameState {
  return createInitialState({ scenario: SANGUO_208, seed: 208 })
}

/** 把随机状态设成首个取值低于阈值的种子，用于稳定地走通「对方应允」。 */
function forceRollBelow(state: GameState, threshold: number): void {
  for (let seed = 1; ; seed += 1) {
    if (createRandom(seed).next() < threshold) {
      state.randomState = seed
      return
    }
  }
}

/** 把随机状态设成首个取值不低于阈值的种子，用于稳定地走通「对方拒绝」。 */
function forceRollAbove(state: GameState, threshold: number): void {
  for (let seed = 1; ; seed += 1) {
    if (createRandom(seed).next() >= threshold) {
      state.randomState = seed
      return
    }
  }
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
    const apBefore = game.actionPoints.liubei

    const result = declareWar(game, 'caocao')

    expect(result.ok).toBe(false)
    expect(game.actionPoints.liubei).toBe(apBefore)
  })
})

describe('赠礼', () => {
  it('花金钱提升好感', () => {
    const game = state()
    const moneyBefore = factionOf(game, 'liubei').money
    const favorBefore = favorBetween(game, 'liubei', 'caocao')

    const result = gift(game, 'caocao')

    expect(result.ok).toBe(true)
    expect(factionOf(game, 'liubei').money).toBe(moneyBefore - GIFT_MONEY)
    expect(favorBetween(game, 'liubei', 'caocao')).toBe(favorBefore + GIFT_FAVOR)
    expect(game.actionPoints.liubei).toBe(10 - ACTION_COSTS.gift)
  })

  it('金钱不足被拒且不扣行动力', () => {
    const game = state()
    factionOf(game, 'liubei').money = 0
    const apBefore = game.actionPoints.liubei

    const result = gift(game, 'caocao')

    expect(result.ok).toBe(false)
    expect(game.actionPoints.liubei).toBe(apBefore)
  })
})

describe('停战与结盟', () => {
  it('好感不足时不能停战', () => {
    const game = state()
    const apBefore = game.actionPoints.liubei

    const result = makePeace(game, 'caocao')

    expect(result.ok).toBe(false)
    expect(game.actionPoints.liubei).toBe(apBefore)
  })

  it('好感达标且对方应允时转为中立', () => {
    const game = state()
    adjustFavor(game, 'liubei', 'caocao', 75)
    forceRollBelow(game, 0.5)

    const result = makePeace(game, 'caocao')

    expect(result.ok).toBe(true)
    expect(relationBetween(game, 'liubei', 'caocao')).toBe('neutral')
  })

  it('好感不足时不能结盟', () => {
    const game = state()
    game.relations = []

    const result = alliance(game, 'caocao')

    expect(result.ok).toBe(false)
  })

  it('敌对时不能结盟', () => {
    const game = state()

    const result = alliance(game, 'caocao')

    expect(result.ok).toBe(false)
  })

  it('好感达标且对方应允时结为同盟', () => {
    const game = state()
    game.relations = []
    adjustFavor(game, 'liubei', 'caocao', 45)
    forceRollBelow(game, 0.5)

    const result = alliance(game, 'caocao')

    expect(result.ok).toBe(true)
    expect(relationBetween(game, 'liubei', 'caocao')).toBe('ally')
  })
})

describe('索取', () => {
  it('对方应允时得粮，好感下降', () => {
    const game = state()
    adjustFavor(game, 'liubei', 'caocao', 75)
    forceRollBelow(game, 0.5)
    const grainBefore = factionOf(game, 'liubei').grain
    const favorBefore = favorBetween(game, 'liubei', 'caocao')

    const result = demand(game, 'caocao')

    expect(result.ok).toBe(true)
    expect(factionOf(game, 'liubei').grain).toBe(grainBefore + DEMAND_GRAIN)
    expect(favorBetween(game, 'liubei', 'caocao')).toBe(favorBefore - DEMAND_FAVOR_PENALTY)
  })

  it('对方拒绝时索不到粮，好感小幅下降', () => {
    const game = state()
    forceRollAbove(game, 0.99)
    const grainBefore = factionOf(game, 'liubei').grain
    const favorBefore = favorBetween(game, 'liubei', 'caocao')

    const result = demand(game, 'caocao')

    expect(result.ok).toBe(true)
    expect(factionOf(game, 'liubei').grain).toBe(grainBefore)
    expect(favorBetween(game, 'liubei', 'caocao')).toBe(favorBefore - DEMAND_REFUSE_PENALTY)
  })

  it('固定随机源下结果可复现', () => {
    const run = (): string => {
      const game = state()
      const result = demand(game, 'caocao')
      return result.ok ? result.record.outcome : result.reason
    }

    expect(run()).toBe(run())
  })
})
