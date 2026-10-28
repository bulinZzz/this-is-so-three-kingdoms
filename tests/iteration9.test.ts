import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import { build } from '../src/core/construction'
import { developmentLevel } from '../src/core/development'
import { declareWar, demand, gift } from '../src/core/diplomacy'
import { moneyYield, settleMoney } from '../src/core/economy'
import { granaryGrowth } from '../src/core/granary'
import type { Character, GameState } from '../src/core/model'
import { disband, dismiss, reward } from '../src/core/personnel'
import { favorBetween, relationBetween } from '../src/core/relations'
import { SANGUO_208 } from '../src/core/scenarios'
import { endTurn } from '../src/core/turn'

function officersOf(state: GameState): Character[] {
  return state.characters.filter(
    (character) =>
      character.status === 'serving' && character.factionId === 'liubei' && !character.isMonarch,
  )
}

function factionOf(state: GameState, id: string) {
  const faction = state.factions.find((item) => item.id === id)
  if (faction === undefined) {
    throw new Error(`势力不存在：${id}`)
  }
  return faction
}

/** 走完迭代 9 的一条链：建设 → 金钱结算 → 外交 → 人事 → 结束回合。 */
function runChain(): GameState {
  const state = createInitialState({ scenario: SANGUO_208, seed: 208 })
  // 给足行动力，专测各行动本身，不受一季预算所限。
  state.actionPoints[state.playerFaction] = 100
  const [first, second] = officersOf(state)
  if (first === undefined || second === undefined) {
    throw new Error('刘备麾下武将不足')
  }

  // 内政：由刘备主持，在公安建农田、市集与民居（每次动工都当作新的一季）。
  const builder = state.characters.find((character) => character.id === 'liubei')
  if (builder === undefined) {
    throw new Error('刘备不在名册')
  }
  builder.troops = 3000
  build(state, 'gongan', 'farm', builder.id)
  state.actedCharacterIds = []
  build(state, 'gongan', 'market', builder.id)
  state.actedCharacterIds = []
  build(state, 'gongan', 'housing', builder.id)

  // 金钱结算。
  settleMoney(state)

  // 外交：向曹操赠礼抬好感，向同盟的孙权宣战，再向曹操索取。
  gift(state, 'caocao')
  declareWar(state, 'sunquan')
  demand(state, 'caocao')

  // 人事：赏赐一人、遣散一人，再解任另一人。
  reward(state, first.id)
  disband(state, first.id, Math.floor(first.troops / 2))
  dismiss(state, second.id)

  endTurn(state)

  return state
}

describe('迭代 9 全链（无画面）', () => {
  it('建设、金钱、外交与人事依次走通，并推进一个回合', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })
    // 给足行动力，专测各行动本身，不受一季预算所限。
    state.actionPoints[state.playerFaction] = 100
    const [first, second] = officersOf(state)
    if (first === undefined || second === undefined) {
      throw new Error('刘备麾下武将不足')
    }
    const farmSite = state.geography.sites.find((site) => site.id === 'gongan')!
    const growthBefore = granaryGrowth(farmSite)
    const loyaltyBefore = first.loyalty
    const troopsBefore = first.troops

    const builder = state.characters.find((character) => character.id === 'liubei')
    if (builder === undefined) {
      throw new Error('刘备不在名册')
    }
    builder.troops = 3000
    build(state, 'gongan', 'farm', builder.id)
    expect(developmentLevel(farmSite, 'farm')).toBe(1)
    expect(granaryGrowth(farmSite)).toBeGreaterThan(growthBefore)

    state.actedCharacterIds = []
    build(state, 'gongan', 'market', builder.id)
    state.actedCharacterIds = []
    build(state, 'gongan', 'housing', builder.id)
    const moneyAfterBuilds = factionOf(state, 'liubei').money
    settleMoney(state)
    expect(moneyYield(state, 'liubei')).toBeGreaterThan(0)
    expect(factionOf(state, 'liubei').money).toBe(moneyAfterBuilds + moneyYield(state, 'liubei'))

    gift(state, 'caocao')
    declareWar(state, 'sunquan')
    expect(relationBetween(state, 'liubei', 'sunquan')).toBe('hostile')
    expect(favorBetween(state, 'liubei', 'caocao')).toBeGreaterThan(25)

    reward(state, first.id)
    expect(first.loyalty).toBeGreaterThan(loyaltyBefore)

    disband(state, first.id, Math.floor(troopsBefore / 2))
    expect(first.troops).toBeLessThan(troopsBefore)

    dismiss(state, second.id)
    expect(second.status).toBe('wild')

    endTurn(state)
    expect(state.currentTurn).toBe(2)
    const kinds = state.history.map((record) => record.kind)
    expect(kinds).toContain('build')
    expect(kinds).toContain('declareWar')
    expect(kinds).toContain('gift')
    expect(kinds).toContain('reward')
    expect(kinds).toContain('disband')
    expect(kinds).toContain('dismiss')
  })

  it('固定种子下整条链可复现', () => {
    const first = runChain()
    const second = runChain()

    expect(first.history).toEqual(second.history)
    expect(first.geography.sites.map((site) => site.owner)).toEqual(
      second.geography.sites.map((site) => site.owner),
    )
    expect(first.factions.map((faction) => faction.money)).toEqual(
      second.factions.map((faction) => faction.money),
    )
  })
})
