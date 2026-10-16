import { describe, expect, it } from 'vitest'
import { attack } from '../src/core/battle'
import { createInitialState } from '../src/core/createInitialState'
import type { Character, FactionId, GameState, Scenario, SiteId } from '../src/core/model'
import { advanceTurn, endTurn } from '../src/core/turn'
import { evaluateOutcome, settleOutcome } from '../src/core/victory'

/** 让某势力失去全部战略点，从而满足覆灭判定。 */
function razeFaction(state: GameState, factionId: FactionId): void {
  for (const site of state.geography.sites) {
    if (site.owner === factionId) {
      site.owner = null
    }
  }
}

function siteOwner(state: GameState, siteId: SiteId): FactionId | null {
  return state.geography.sites.find((site) => site.id === siteId)?.owner ?? null
}

describe('结局判定', () => {
  it('开局仍在进行', () => {
    const state = createInitialState()

    expect(state.outcome).toBe('ongoing')
    expect(state.endedTurn).toBeNull()
    expect(evaluateOutcome(state)).toBe('ongoing')
    expect(settleOutcome(state)).toBe(false)
    expect(state.outcome).toBe('ongoing')
  })

  it('玩家失去全部战略点即失败', () => {
    const state = createInitialState()
    razeFaction(state, state.playerFaction)

    expect(settleOutcome(state)).toBe(true)
    expect(state.outcome).toBe('defeat')
    expect(state.endedTurn).toBe(state.currentTurn)
  })

  it('其余势力全部覆灭即统一', () => {
    const state = createInitialState()
    for (const faction of state.factions) {
      if (faction.id !== state.playerFaction) {
        razeFaction(state, faction.id)
      }
    }

    expect(settleOutcome(state)).toBe(true)
    expect(state.outcome).toBe('victory')
  })

  it('玩家与对手同时覆灭时以失败论', () => {
    const state = createInitialState()
    for (const faction of state.factions) {
      razeFaction(state, faction.id)
    }

    expect(evaluateOutcome(state)).toBe('defeat')
  })

  it('已结束的局不再被覆写', () => {
    const state = createInitialState()
    razeFaction(state, state.playerFaction)

    expect(settleOutcome(state)).toBe(true)
    const endedTurn = state.endedTurn

    // 此时把玩家重新变成进行中也不可能——结局一旦写入即不再变更。
    state.outcome = 'victory'
    expect(settleOutcome(state)).toBe(false)
    expect(state.outcome).toBe('victory')
    expect(state.endedTurn).toBe(endedTurn)
  })

  it('回合推进时自动结算，终局记在真正结束的那一季', () => {
    const state = createInitialState()
    for (const faction of state.factions) {
      if (faction.id !== state.playerFaction) {
        razeFaction(state, faction.id)
      }
    }

    advanceTurn(state)

    expect(state.outcome).toBe('victory')
    // 其余势力在第一季就被清空，终局即第一季，翻季不改变这个记录。
    expect(state.endedTurn).toBe(1)
    expect(state.currentTurn).toBe(2)
  })
})

/**
 * 一州两城的残局：甲城属玩家、乙城属曹操，两家开局即敌对——只有宣战过的领地才打得进去。
 * 兵力对比定下这局的走向：我方碾压则一仗统一，敌方碾压则一季覆灭，两条路都不留变数，
 * 好让随机起伏、单挑与守军去向不至于翻盘。
 */
function lastStandScenario(ourTroops: number, theirTroops: number): Scenario {
  const serving = (
    id: string,
    name: string,
    factionId: FactionId,
    stationedSiteId: SiteId,
    troops: number,
  ): Character => ({
    id,
    name,
    status: 'serving',
    factionId,
    provinceId: 'p1',
    might: 70,
    command: 70,
    intellect: 50,
    politics: 50,
    age: 40,
    personality: 'steady',
    affinities: {},
    loyalty: 90,
    isMonarch: false,
    stationedSiteId,
    troops,
    tier: null,
  })

  return {
    id: 'last-stand',
    name: '残局',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', money: 0, grain: 100000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', money: 0, grain: 100000 },
    ],
    relations: [{ factions: ['liubei', 'caocao'], kind: 'hostile', favor: 25 }],
    geography: {
      provinces: [{ id: 'p1', name: '州一', owner: null }],
      sites: [
        { id: 'a', name: '甲城', type: 'city', population: 50000, provinceId: 'p1', owner: 'liubei', neighbors: ['b'] },
        { id: 'b', name: '乙城', type: 'city', population: 50000, provinceId: 'p1', owner: 'caocao', neighbors: ['a'] },
      ],
    },
    characters: [
      serving('ours', '我将', 'liubei', 'a', ourTroops),
      serving('theirs', '敌将', 'caocao', 'b', theirTroops),
    ],
  }
}

describe('通关小局（固定种子）', () => {
  /** 我方压倒敌方：出一次兵夺尽敌方据点，收尾即告统一。 */
  function runToVictory(): GameState {
    const state = createInitialState({ scenario: lastStandScenario(20000, 500), seed: 208 })
    attack(state, { commander: 'ours' }, 'b')
    endTurn(state)

    return state
  }

  /** 敌方压倒我方：推一季任他方来攻，仅有的一处据点易手，收尾即告覆灭。 */
  function runToDefeat(): GameState {
    const state = createInitialState({ scenario: lastStandScenario(500, 20000), seed: 208 })
    endTurn(state)

    return state
  }

  /** 一局走完的指纹：结局、终局回合与版图归属。 */
  function fingerprint(state: GameState): unknown[] {
    return [
      state.outcome,
      state.endedTurn,
      state.geography.sites.map((site) => site.owner),
      state.history.map((record) => record.kind),
    ]
  }

  it('夺尽敌方据点即统一，并触发结算', () => {
    const state = runToVictory()

    expect(siteOwner(state, 'b')).toBe('liubei')
    expect(state.outcome).toBe('victory')
    expect(state.endedTurn).toBe(1)
  })

  it('失尽己方据点即覆灭，并触发结算', () => {
    const state = runToDefeat()

    expect(siteOwner(state, 'a')).toBe('caocao')
    expect(state.outcome).toBe('defeat')
    expect(state.endedTurn).toBe(1)
  })

  it('两条通关路径在固定种子下都可复现', () => {
    expect(fingerprint(runToVictory())).toEqual(fingerprint(runToVictory()))
    expect(fingerprint(runToDefeat())).toEqual(fingerprint(runToDefeat()))
  })
})
