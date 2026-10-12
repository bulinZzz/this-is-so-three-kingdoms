import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import { runFactionTurns } from '../src/core/factionAi'
import { factionTroops } from '../src/core/military'
import { SANGUO_208, SANGUO_ACCEPTANCE } from '../src/core/scenarios'
import { advanceTurn } from '../src/core/turn'

/** 用验收开局跑若干季的「他方行动 + 结算」，返回该状态。 */
function runSeasons(seasons: number) {
  const state = createInitialState({ scenario: SANGUO_ACCEPTANCE, seed: 208 })
  for (let season = 0; season < seasons; season += 1) {
    runFactionTurns(state)
    advanceTurn(state)
  }

  return state
}

describe('势力自主行动', () => {
  it('他方会行动并写入历史，玩家势力不参与', () => {
    const state = createInitialState({ scenario: SANGUO_ACCEPTANCE, seed: 208 })

    runFactionTurns(state)

    const records = state.history
    expect(records.length).toBeGreaterThan(0)
    expect(records.every((record) => record.factionId !== state.playerFaction)).toBe(true)
  })

  it('他方会发起进攻', () => {
    const state = runSeasons(6)
    const attacks = state.history.filter(
      (record) => record.kind === 'attack' && record.factionId !== state.playerFaction,
    )

    expect(attacks.length).toBeGreaterThan(0)
  })

  it('他方征兵受驻地丁口约束：丁口枯竭则无人可征', () => {
    const state = createInitialState({ scenario: SANGUO_ACCEPTANCE, seed: 208 })
    // 各战略点人口清零，丁口随之枯竭。
    for (const site of state.geography.sites) {
      site.population = 0
    }

    runFactionTurns(state)

    expect(state.history.filter((record) => record.kind === 'recruit')).toEqual([])
  })

  it('他方粮尽时粮仓归零、部队一兵不减', () => {
    const state = createInitialState({ scenario: SANGUO_ACCEPTANCE, seed: 208 })
    const caocao = state.factions.find((faction) => faction.id === 'caocao')
    if (caocao === undefined) {
      throw new Error('势力不存在：caocao')
    }
    // 断掉粮源：人口与存粮皆为零，本季既运不回粮，也付不出军粮。
    for (const site of state.geography.sites) {
      site.population = 0
      site.granary = 0
    }
    caocao.grain = 0
    const troopsBefore = factionTroops(state, 'caocao')

    advanceTurn(state)

    expect(
      state.history.some((record) => record.kind === 'disband' && record.factionId === 'caocao'),
    ).toBe(false)
    expect(factionTroops(state, 'caocao')).toBe(troopsBefore)
    expect(caocao.grain).toBe(0)
  })

  it('固定种子下他方的行为序列可复现', () => {
    const first = runSeasons(4)
    const second = runSeasons(4)

    expect(first.history).toEqual(second.history)
    expect(first.geography.sites.map((site) => site.owner)).toEqual(
      second.geography.sites.map((site) => site.owner),
    )
  })

  it('行动力只扣发起行动的势力，玩家自己的预算不受影响', () => {
    const state = createInitialState({ scenario: SANGUO_ACCEPTANCE, seed: 208 })
    const playerBefore = state.actionPoints[state.playerFaction]

    runFactionTurns(state)

    expect(state.actionPoints[state.playerFaction]).toBe(playerBefore)
  })
})

describe('外交接入他方决策', () => {
  it('他方会对低好感的中立方宣战（己方明显占优）', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })
    // 曹刘、曹孙改判为中立且好感极低，曹操兵力远胜，应主动宣战。
    state.relations = [
      { factions: ['caocao', 'liubei'], kind: 'neutral', favor: 10 },
      { factions: ['caocao', 'sunquan'], kind: 'neutral', favor: 10 },
    ]

    runFactionTurns(state)

    const wars = state.history.filter((record) => record.kind === 'declareWar')
    expect(wars.length).toBeGreaterThan(0)
    expect(wars.every((record) => record.factionId === 'caocao')).toBe(true)
  })
})
