import { describe, expect, it } from 'vitest'
import { ACTION_COSTS } from '../src/core/actions'
import { createInitialState } from '../src/core/createInitialState'
import type { Character, GameState } from '../src/core/model'
import { disband, dismiss, reward, REWARD_LOYALTY, REWARD_MONEY } from '../src/core/personnel'
import { SANGUO_208 } from '../src/core/scenarios'

function state(): GameState {
  return createInitialState({ scenario: SANGUO_208, seed: 208 })
}

/** 刘备麾下一名非君主的在仕武将。 */
function officer(state: GameState): Character {
  const found = state.characters.find(
    (character) =>
      character.status === 'serving' && character.factionId === 'liubei' && !character.isMonarch,
  )
  if (found === undefined) {
    throw new Error('刘备麾下没有可选武将')
  }
  return found
}

function factionOf(state: GameState, id: string) {
  const faction = state.factions.find((item) => item.id === id)
  if (faction === undefined) {
    throw new Error(`势力不存在：${id}`)
  }
  return faction
}

describe('赏赐', () => {
  it('花金钱把忠诚拉回', () => {
    const game = state()
    const target = officer(game)
    target.loyalty = 30
    const moneyBefore = factionOf(game, 'liubei').money
    const apBefore = game.actionPoints.liubei

    const result = reward(game, target.id)

    expect(result.ok).toBe(true)
    expect(target.loyalty).toBe(30 + REWARD_LOYALTY)
    expect(factionOf(game, 'liubei').money).toBe(moneyBefore - REWARD_MONEY)
    expect(game.actionPoints.liubei).toBe(apBefore - ACTION_COSTS.reward)
  })

  it('忠诚不超过上限', () => {
    const game = state()
    const target = officer(game)
    target.loyalty = 100

    reward(game, target.id)

    expect(target.loyalty).toBe(100)
  })

  it('金钱不足被拒且不扣行动力', () => {
    const game = state()
    const target = officer(game)
    factionOf(game, 'liubei').money = 0
    const apBefore = game.actionPoints.liubei

    const result = reward(game, target.id)

    expect(result.ok).toBe(false)
    expect(game.actionPoints.liubei).toBe(apBefore)
  })
})

describe('解任', () => {
  it('在仕武将转为在野，卸下驻地与部队', () => {
    const game = state()
    const target = officer(game)

    const result = dismiss(game, target.id)

    expect(result.ok).toBe(true)
    expect(target.status).toBe('wild')
    expect(target.factionId).toBeNull()
    expect(target.stationedSiteId).toBeNull()
    expect(target.troops).toBe(0)
    expect(target.tier).not.toBeNull()
  })

  it('君主不可解任', () => {
    const game = state()
    const monarch = game.characters.find(
      (character) => character.isMonarch && character.factionId === 'liubei',
    )
    if (monarch === undefined) {
      throw new Error('刘备势力没有君主')
    }
    const apBefore = game.actionPoints.liubei

    const result = dismiss(game, monarch.id)

    expect(result.ok).toBe(false)
    expect(game.actionPoints.liubei).toBe(apBefore)
    expect(monarch.status).toBe('serving')
  })
})

describe('遣散', () => {
  it('兵力减到指定数量，不耗行动力、不算已行动、不退还粮食', () => {
    const game = state()
    const target = officer(game)
    target.troops = 5000
    const apBefore = game.actionPoints.liubei
    const grainBefore = factionOf(game, 'liubei').grain
    const actedBefore = [...game.actedCharacterIds]

    const result = disband(game, target.id, 1000)

    expect(result.ok).toBe(true)
    expect(target.troops).toBe(1000)
    expect(game.actionPoints.liubei).toBe(apBefore)
    expect(factionOf(game, 'liubei').grain).toBe(grainBefore)
    expect(game.actedCharacterIds).toEqual(actedBefore)
    expect(game.history.at(-1)?.kind).toBe('disband')
  })

  it('数量夹在 0 与当前兵力之间', () => {
    const game = state()
    const target = officer(game)
    target.troops = 2000

    disband(game, target.id, -100)
    expect(target.troops).toBe(0)

    target.troops = 2000
    disband(game, target.id, 99999)
    expect(target.troops).toBe(2000)
  })
})
