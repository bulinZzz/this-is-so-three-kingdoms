import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import { runFactionTurns } from '../src/core/factionAi'
import { SANGUO_ACCEPTANCE } from '../src/core/scenarios'
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
