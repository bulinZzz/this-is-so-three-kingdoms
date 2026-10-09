import { describe, expect, it } from 'vitest'
import { createInitialState } from '../src/core/createInitialState'
import {
  DEFECT_THRESHOLD,
  defectThresholdFor,
  LOYALTY_LOSS,
  loseLoyalty,
  loyaltyHint,
  maybeDefect,
  wildTierFor,
} from '../src/core/loyalty'
import type { Character, GameState, Scenario } from '../src/core/model'

function officer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'a',
    name: '甲',
    status: 'serving',
    factionId: 'liubei',
    provinceId: 'jing',
    might: 70,
    command: 70,
    intellect: 70,
    politics: 70,
    age: 40,
    personality: 'steady',
    affinities: { liubei: 80 },
    loyalty: 80,
    isMonarch: false,
    stationedSiteId: 'a',
    troops: 500,
    tier: null,
    ...overrides,
  }
}

/** 一个州两个战略点，均归玩家；人物由用例给定。 */
function scene(characters: Character[]): GameState {
  const scenario: Scenario = {
    id: 'loyalty-test',
    name: '忠诚测试',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 1000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 1000 },
    ],
    geography: {
      provinces: [{ id: 'jing', name: '荆州', owner: 'liubei' }],
      sites: [
        { id: 'a', name: '甲城', type: 'city', provinceId: 'jing', owner: 'liubei', neighbors: ['b'] },
        { id: 'b', name: '乙城', type: 'city', provinceId: 'jing', owner: 'liubei', neighbors: ['a'] },
      ],
    },
    characters,
  }

  return createInitialState({ scenario })
}

describe('忠诚升降', () => {
  it('在仕者按挫折下降，且夹在 0 以上', () => {
    const state = scene([officer({ loyalty: 15 })])

    loseLoyalty(state.characters[0], LOYALTY_LOSS.siteLost)
    expect(state.characters[0].loyalty).toBe(5)

    loseLoyalty(state.characters[0], LOYALTY_LOSS.siteLost)
    expect(state.characters[0].loyalty).toBe(0)
  })

  it('君主的忠诚不参与升降', () => {
    const state = scene([officer({ isMonarch: true, loyalty: 80 })])

    loseLoyalty(state.characters[0], 10)

    expect(state.characters[0].loyalty).toBe(80)
  })

  it('在野者不受影响', () => {
    const state = scene([
      officer({ status: 'wild', factionId: null, stationedSiteId: null, troops: 0, tier: 'basic', loyalty: 0 }),
    ])

    loseLoyalty(state.characters[0], 10)

    expect(state.characters[0].loyalty).toBe(0)
  })
})

describe('忠诚提示', () => {
  it('低于阈值作离心，未到阈值二十点作不满，忠心不标', () => {
    expect(loyaltyHint(DEFECT_THRESHOLD - 1)).toBe('离心')
    expect(loyaltyHint(DEFECT_THRESHOLD)).toBe('不满')
    expect(loyaltyHint(DEFECT_THRESHOLD + 19)).toBe('不满')
    expect(loyaltyHint(DEFECT_THRESHOLD + 20)).toBeNull()
  })

  it('门槛随偏好浮动：同一个忠诚值，疏离者报离心、亲附者不报', () => {
    expect(loyaltyHint(44, 46)).toBe('离心')
    expect(loyaltyHint(44, 36)).toBe('不满')
  })
})

describe('回归在野的卡池层级', () => {
  it('能力高者二级，其余基础池', () => {
    expect(wildTierFor(officer({ might: 90 }))).toBe('second')
    expect(wildTierFor(officer({ intellect: 85 }))).toBe('second')
    expect(wildTierFor(officer({ command: 84 }))).toBe('basic')
  })
})

describe('叛离判定', () => {
  it('忠诚低于阈值者在受挫时离开：转为在野、按能力定池、对原势力偏好下降、清出接触名单、写入记录', () => {
    const defector = officer({
      id: 'guanyu',
      name: '关羽',
      might: 97,
      provinceId: 'yu',
      loyalty: 30,
      affinities: { liubei: 80 },
    })
    const state = scene([defector])
    state.contactedCandidates.liubei = [{ characterId: 'guanyu', siteId: 'a' }]

    const outcome = maybeDefect(state, defector, '败绩')

    expect(outcome).toContain('关羽')
    expect(defector.status).toBe('wild')
    expect(defector.factionId).toBeNull()
    expect(defector.stationedSiteId).toBeNull()
    expect(defector.troops).toBe(0)
    expect(defector.loyalty).toBe(0)
    expect(defector.tier).toBe('second')
    expect(defector.provinceId).toBe('jing')
    expect(defector.affinities.liubei).toBe(50)
    expect(state.contactedCandidates.liubei).toEqual([])
    expect(state.history).toHaveLength(1)
    expect(state.history[0].kind).toBe('defect')
    expect(state.history[0].factionId).toBe('liubei')
  })

  it('忠诚未低于阈值者不离开', () => {
    const loyal = officer({ loyalty: DEFECT_THRESHOLD })
    const state = scene([loyal])

    expect(maybeDefect(state, loyal, '败绩')).toBeNull()
    expect(loyal.status).toBe('serving')
    expect(state.history).toEqual([])
  })

  it('君主即使忠诚很低也不离开', () => {
    const monarch = officer({ isMonarch: true, loyalty: 10 })
    const state = scene([monarch])

    expect(maybeDefect(state, monarch, '失守')).toBeNull()
    expect(monarch.status).toBe('serving')
  })
})

describe('叛离阈值随偏好浮动', () => {
  it('以 40 为基准、两端不超过 ±6：亲附者更低、疏离者更高', () => {
    expect(defectThresholdFor(officer({ affinities: { liubei: 100 } }), 'liubei')).toBe(34)
    expect(defectThresholdFor(officer({ affinities: { liubei: 90 } }), 'liubei')).toBe(35)
    expect(defectThresholdFor(officer({ affinities: { liubei: 50 } }), 'liubei')).toBe(40)
    expect(defectThresholdFor(officer({ affinities: {} }), 'liubei')).toBe(40)
    expect(defectThresholdFor(officer({ affinities: { liubei: 10 } }), 'liubei')).toBe(45)
    expect(defectThresholdFor(officer({ affinities: { liubei: 0 } }), 'liubei')).toBe(46)
  })

  it('同一个忠诚值：疏离者受挫即走，亲附者留得下', () => {
    const aloof = officer({ affinities: { liubei: 0 }, loyalty: 42 })
    const devoted = officer({ affinities: { liubei: 100 }, loyalty: 38 })

    expect(maybeDefect(scene([aloof]), aloof, '败绩')).not.toBeNull()
    expect(aloof.status).toBe('wild')

    expect(maybeDefect(scene([devoted]), devoted, '败绩')).toBeNull()
    expect(devoted.status).toBe('serving')
  })
})
