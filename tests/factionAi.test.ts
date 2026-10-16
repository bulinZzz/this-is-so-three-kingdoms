import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import { declareWar } from '../src/core/diplomacy'
import { runFactionTurns } from '../src/core/factionAi'
import { factionTroops } from '../src/core/military'
import type { Scenario } from '../src/core/model'
import { relationBetween } from '../src/core/relations'
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

/** 两家相邻、无无主之地的最小对局：他方只有在敌对时才可能对玩家用兵。 */
function warScene() {
  const scenario: Scenario = {
    id: 'war-ai',
    name: '宣战接入',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', money: 0, grain: 10000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', money: 0, grain: 10000 },
    ],
    geography: {
      provinces: [{ id: 'p', name: '州', owner: null }],
      sites: [
        { id: 'a', name: '甲城', type: 'city', population: 50000, provinceId: 'p', owner: 'liubei', neighbors: ['b'] },
        { id: 'b', name: '乙城', type: 'city', population: 50000, provinceId: 'p', owner: 'caocao', neighbors: ['a'] },
      ],
    },
    characters: [
      {
        id: 'lord', name: '甲将', status: 'serving', factionId: 'liubei', provinceId: 'p',
        might: 60, command: 60, intellect: 50, politics: 50, age: 40, personality: 'steady',
        affinities: {}, loyalty: 90, isMonarch: true, stationedSiteId: 'a', troops: 500, tier: null,
      },
      {
        id: 'raider', name: '乙将', status: 'serving', factionId: 'caocao', provinceId: 'p',
        might: 70, command: 70, intellect: 60, politics: 50, age: 40, personality: 'steady',
        affinities: {}, loyalty: 90, isMonarch: true, stationedSiteId: 'b', troops: 20000, tier: null,
      },
    ],
  }

  return createInitialState({ scenario, seed: 208 })
}

describe('外交接入他方决策', () => {
  it('开局无战事：多季推进他方也不自行宣战、不夺有主之地', () => {
    const state = createInitialState({ scenario: SANGUO_208, seed: 208 })
    const ownedBefore = state.geography.sites
      .filter((site) => site.owner !== null)
      .map((site) => ({ id: site.id, owner: site.owner }))

    for (let season = 0; season < 6; season += 1) {
      runFactionTurns(state)
      advanceTurn(state)
    }

    expect(state.history.filter((record) => record.kind === 'declareWar')).toEqual([])
    expect(state.relations.every((relation) => relation.kind !== 'hostile')).toBe(true)
    for (const { id, owner } of ownedBefore) {
      expect(state.geography.sites.find((site) => site.id === id)?.owner).toBe(owner)
    }
  })

  it('中立时不出兵，玩家宣战后该势力即把玩家城池计入可攻目标', () => {
    // 中立：无无主之地，他方无兵可出。
    const neutral = warScene()
    runFactionTurns(neutral)

    expect(neutral.history.filter((record) => record.kind === 'attack')).toEqual([])
    expect(neutral.geography.sites.find((site) => site.id === 'a')?.owner).toBe('liubei')

    // 玩家宣战：曹操随即来攻，甲城易手。
    const atWar = warScene()
    const result = declareWar(atWar, 'caocao')
    expect(result.ok).toBe(true)
    expect(relationBetween(atWar, 'liubei', 'caocao')).toBe('hostile')

    runFactionTurns(atWar)

    const attacks = atWar.history.filter(
      (record) => record.kind === 'attack' && record.factionId === 'caocao',
    )
    expect(attacks.length).toBeGreaterThan(0)
    expect(atWar.geography.sites.find((site) => site.id === 'a')?.owner).toBe('caocao')
  })
})
