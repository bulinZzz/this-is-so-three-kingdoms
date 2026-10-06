import { describe, expect, it } from 'vitest'
import { ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { isTierAvailable, provinceControl } from '../src/core/cardPool'
import { createInitialState } from '../src/core/createInitialState'
import type { Character, CharacterTier, GameState, Scenario } from '../src/core/model'
import { createRandom } from '../src/core/random'
import { seekTalent } from '../src/core/seekTalent'

function wild(id: string, name: string, tier: CharacterTier): Character {
  return {
    id,
    name,
    status: 'wild',
    factionId: null,
    provinceId: 'p',
    might: 50,
    command: 50,
    intellect: 50,
    politics: 50,
    factionAffinity: null,
    loyalty: 0,
    isMonarch: false,
    stationedSiteId: null,
    troops: 0,
    morale: 100,
    tier,
  }
}

/** 玩家在州 p 占 owned 个战略点（共 3 个），用于检验控制分级与卡池。 */
function poolScene(owned: 1 | 2 | 3): GameState {
  const scenario: Scenario = {
    id: 'pool-test',
    name: '卡池测试',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 1000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 1000 },
    ],
    geography: {
      provinces: [{ id: 'p', name: '州', owner: owned >= 2 ? 'liubei' : 'caocao' }],
      sites: [
        { id: 'a', name: '甲城', type: 'city', provinceId: 'p', owner: 'liubei', neighbors: ['b'] },
        {
          id: 'b',
          name: '乙城',
          type: 'city',
          provinceId: 'p',
          owner: owned >= 2 ? 'liubei' : 'caocao',
          neighbors: ['a', 'c'],
        },
        {
          id: 'c',
          name: '丙城',
          type: 'city',
          provinceId: 'p',
          owner: owned >= 3 ? 'liubei' : 'caocao',
          neighbors: ['b'],
        },
      ],
    },
    characters: [
      wild('basic-1', '基础客', 'basic'),
      wild('second-1', '二级客', 'second'),
      wild('third-1', '三级客', 'third'),
    ],
  }

  return createInitialState({ scenario, seed: 208 })
}

/** 连续寻访到无可寻之人，返回招募到的武将 id。每次补满行动力，只看卡池不看预算。 */
function recruitAll(state: GameState): string[] {
  const random = createRandom(7)
  const recruited: string[] = []

  while (true) {
    state.actionPoints = ACTION_POINTS_PER_TURN
    if (!seekTalent(state, random, 'a').ok) {
      break
    }

    const latest = state.characters.find(
      (character) => character.status === 'serving' && !recruited.includes(character.id),
    )
    if (latest !== undefined) {
      recruited.push(latest.id)
    }
  }

  return recruited
}

describe('provinceControl', () => {
  it('不占地为无，占一角为基础，成为归属势力为二级，占全境为三级', () => {
    expect(provinceControl(poolScene(1), 'p')).toBe('basic')
    expect(provinceControl(poolScene(2), 'p')).toBe('second')
    expect(provinceControl(poolScene(3), 'p')).toBe('third')
  })

  it('玩家未占任何战略点的州为无', () => {
    expect(provinceControl(createInitialState({ seed: 208 }), 'yi')).toBe('none')
  })
})

describe('isTierAvailable', () => {
  it('低层不会放出高层人物', () => {
    expect(isTierAvailable('basic', 'basic')).toBe(true)
    expect(isTierAvailable('second', 'basic')).toBe(false)
    expect(isTierAvailable('third', 'second')).toBe(false)
    expect(isTierAvailable('third', 'third')).toBe(true)
  })

  it('无法控制的州不放出任何人物', () => {
    expect(isTierAvailable('basic', 'none')).toBe(false)
  })

  it('没有层级的人物不进入任何卡池', () => {
    expect(isTierAvailable(null, 'third')).toBe(false)
  })
})

describe('寻访卡池', () => {
  it('仅占一角时只能寻得基础池', () => {
    expect(recruitAll(poolScene(1))).toEqual(['basic-1'])
  })

  it('成为归属势力时可寻得二级池，仍寻不到三级', () => {
    const state = poolScene(2)
    const recruited = recruitAll(state)

    expect(recruited).toHaveLength(2)
    expect(recruited).toContain('basic-1')
    expect(recruited).toContain('second-1')
    expect(state.characters.find((character) => character.id === 'third-1')?.status).toBe('wild')
  })

  it('占全境时可寻得三级池', () => {
    expect(recruitAll(poolScene(3))).toHaveLength(3)
  })
})
