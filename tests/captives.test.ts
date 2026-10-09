import { describe, expect, it } from 'vitest'
import {
  absorbCaptives,
  attitudeOf,
  captivesOf,
  captorOf,
  executeCaptive,
  initialWill,
  joinLoyalty,
  persuade,
  releaseCaptive,
  takeCaptive,
  WILLING_THRESHOLD,
} from '../src/core/captives'
import { createInitialState } from '../src/core/createInitialState'
import { CHARACTER_LIMIT, countServing } from '../src/core/characters'
import type { Character, GameState, Scenario } from '../src/core/model'
import { createRandom } from '../src/core/random'

function officer(overrides: Partial<Character> = {}): Character {
  return {
    id: 'a',
    name: '甲',
    status: 'serving',
    factionId: 'caocao',
    provinceId: 'jing',
    might: 70,
    command: 70,
    intellect: 70,
    politics: 70,
    age: 40,
    personality: 'steady',
    affinities: { caocao: 90 },
    loyalty: 90,
    isMonarch: false,
    stationedSiteId: 'b',
    troops: 500,
    tier: null,
    ...overrides,
  }
}

function characterOf(state: GameState, id: string): Character {
  const character = state.characters.find((item) => item.id === id)
  if (character === undefined) {
    throw new Error(`武将不存在：${id}`)
  }

  return character
}

/** 两家势力、两个战略点；人物由用例给定。 */
function scene(characters: Character[]): GameState {
  const scenario: Scenario = {
    id: 'captives-test',
    name: '俘虏测试',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', grain: 1000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', grain: 1000 },
      { id: 'sunquan', name: '孙权', color: '#a83d3d', grain: 1000 },
    ],
    geography: {
      provinces: [{ id: 'jing', name: '荆州', owner: null }],
      sites: [
        { id: 'a', name: '甲城', type: 'city', provinceId: 'jing', owner: 'liubei', neighbors: ['b'] },
        { id: 'b', name: '乙城', type: 'city', provinceId: 'jing', owner: 'caocao', neighbors: ['a'] },
      ],
    },
    characters,
  }

  return createInitialState({ scenario })
}

describe('劝降意愿与态度', () => {
  it('初始意愿取性格基准 × 偏好系数 × 忠诚折减，化为百分数', () => {
    // 沉稳 0.5 ×（偏好 50 → 1.0）×（忠诚 50 → 0.5）= 0.25 → 25。
    expect(initialWill(officer({ personality: 'steady', loyalty: 50, affinities: {} }), 'liubei')).toBe(25)
    // 豁达 0.7 ×（偏好 90 → 1.4）×（忠诚 20 → 0.8）= 0.784 → 78。
    expect(
      initialWill(officer({ personality: 'open', loyalty: 20, affinities: { liubei: 90 } }), 'liubei'),
    ).toBe(78)
    // 忠于原势力者的意愿为零。
    expect(
      initialWill(officer({ personality: 'proud', loyalty: 100, affinities: { liubei: 90 } }), 'liubei'),
    ).toBe(0)
  })

  it('意愿分五档，仅作展示', () => {
    expect(attitudeOf(0)).toBe('宁死不屈')
    expect(attitudeOf(19)).toBe('宁死不屈')
    expect(attitudeOf(20)).toBe('不卑不亢')
    expect(attitudeOf(40)).toBe('意有所动')
    expect(attitudeOf(60)).toBe('心动')
    expect(attitudeOf(WILLING_THRESHOLD)).toBe('愿降')
    expect(attitudeOf(100)).toBe('愿降')
  })

  it('归附者的忠诚初值跟着偏好走，不高也不至于一两场败仗就走', () => {
    expect(joinLoyalty(officer({ affinities: {} }), 'liubei')).toBe(60)
    expect(joinLoyalty(officer({ affinities: { liubei: 0 } }), 'liubei')).toBe(50)
    expect(joinLoyalty(officer({ affinities: { liubei: 100 } }), 'liubei')).toBe(70)
  })
})

describe('关押、劝降与斩杀', () => {
  it('关押：转为 captured、清空势力与驻地，并记入俘获方的俘虏营', () => {
    const state = scene([officer({ id: 'guanyu', name: '关羽' })])
    const prisoner = characterOf(state, 'guanyu')

    const record = takeCaptive(state, prisoner, 'liubei')

    expect(prisoner.status).toBe('captured')
    expect(prisoner.factionId).toBeNull()
    expect(prisoner.stationedSiteId).toBeNull()
    expect(prisoner.troops).toBe(0)
    expect(record.formerFactionId).toBe('caocao')
    expect(captorOf(state, 'guanyu')).toBe('liubei')
    expect(captivesOf(state, 'liubei')).toHaveLength(1)
  })

  it('已在愿降档者，再劝一次即归附：入仕俘获方并得到忠诚初值', () => {
    const state = scene([
      officer({ id: 'guanyu', name: '关羽', personality: 'open', loyalty: 0, affinities: { liubei: 100 } }),
    ])
    const prisoner = characterOf(state, 'guanyu')
    takeCaptive(state, prisoner, 'liubei')

    expect(captivesOf(state, 'liubei')[0].attitude).toBe('愿降')
    const result = persuade(state, createRandom(1), 'guanyu', 'liubei')

    expect(result.ok).toBe(true)
    expect(prisoner.status).toBe('serving')
    expect(prisoner.factionId).toBe('liubei')
    expect(prisoner.loyalty).toBe(70)
    expect(captivesOf(state, 'liubei')).toHaveLength(0)
  })

  it('未到愿降档，劝降只抬升意愿，人仍留在营中', () => {
    const state = scene([
      officer({ id: 'guanyu', name: '关羽', personality: 'steady', loyalty: 90, affinities: {} }),
    ])
    const prisoner = characterOf(state, 'guanyu')
    takeCaptive(state, prisoner, 'liubei')
    const before = state.captives.liubei[0].will

    const result = persuade(state, createRandom(1), 'guanyu', 'liubei')

    expect(result.ok).toBe(true)
    expect(state.captives.liubei[0].will).toBeGreaterThan(before)
    expect(prisoner.status).toBe('captured')
  })

  it('君主不可劝降', () => {
    const state = scene([
      officer({
        id: 'caocao',
        name: '曹操',
        isMonarch: true,
        personality: 'open',
        loyalty: 0,
        affinities: { liubei: 100 },
      }),
    ])
    takeCaptive(state, characterOf(state, 'caocao'), 'liubei')

    expect(persuade(state, createRandom(1), 'caocao', 'liubei')).toEqual({
      ok: false,
      reason: '君主不可劝降，只能斩杀',
    })
  })

  it('斩杀俘虏：当即退场并移出营', () => {
    const state = scene([officer({ id: 'guanyu', name: '关羽' })])
    const prisoner = characterOf(state, 'guanyu')
    takeCaptive(state, prisoner, 'liubei')

    const result = executeCaptive(state, 'guanyu', 'liubei')

    expect(result.ok).toBe(true)
    expect(prisoner.status).toBe('retired')
    expect(captivesOf(state, 'liubei')).toHaveLength(0)
  })

  it('释放俘虏：转为在野、按能力定池，并移出营', () => {
    const state = scene([officer({ id: 'guanyu', name: '关羽', might: 97 })])
    const prisoner = characterOf(state, 'guanyu')
    takeCaptive(state, prisoner, 'liubei')

    const result = releaseCaptive(state, 'guanyu', 'liubei')

    expect(result.ok).toBe(true)
    expect(prisoner.status).toBe('wild')
    expect(prisoner.factionId).toBeNull()
    expect(prisoner.tier).toBe('second')
    expect(captivesOf(state, 'liubei')).toHaveLength(0)
  })

  it('君主不可释放', () => {
    const state = scene([officer({ id: 'caocao', name: '曹操', isMonarch: true })])
    takeCaptive(state, characterOf(state, 'caocao'), 'liubei')

    expect(releaseCaptive(state, 'caocao', 'liubei')).toEqual({
      ok: false,
      reason: '君主不可释放，只能斩杀',
    })
  })

  it('不在营中的人不能劝降，也不能斩杀', () => {
    const state = scene([officer({ id: 'guanyu', name: '关羽' })])

    expect(persuade(state, createRandom(1), 'guanyu', 'liubei')).toEqual({
      ok: false,
      reason: '此人不在你的俘虏营中',
    })
    expect(executeCaptive(state, 'guanyu', 'liubei')).toEqual({
      ok: false,
      reason: '此人不在你的俘虏营中',
    })
  })
})

describe('覆灭时营中俘虏的归处', () => {
  it('旧主正是攻方的直接回归，其余转入攻方的营', () => {
    const zhangfei = officer({ id: 'zhangfei', name: '张飞', factionId: 'liubei', stationedSiteId: 'a' })
    const guanyu = officer({ id: 'guanyu', name: '关羽' })
    const state = scene([zhangfei, guanyu])

    // 关羽为刘备所擒；张飞为曹操所擒。
    takeCaptive(state, characterOf(state, 'guanyu'), 'liubei')
    takeCaptive(state, characterOf(state, 'zhangfei'), 'caocao')

    const notes = absorbCaptives(state, 'caocao', 'liubei')

    // 张飞的旧主就是攻方，直接回归；曹操的营随之清空。
    expect(characterOf(state, 'zhangfei').status).toBe('serving')
    expect(characterOf(state, 'zhangfei').factionId).toBe('liubei')
    expect(captivesOf(state, 'caocao')).toHaveLength(0)
    // 刘备营中原有的关羽不受影响。
    expect(captivesOf(state, 'liubei').map((view) => view.character.id)).toEqual(['guanyu'])
    expect(notes).toHaveLength(1)
  })

  it('旧主并非攻方的，转入攻方的营、意愿沿用', () => {
    const simayi = officer({ id: 'simayi', name: '司马懿' })
    const state = scene([simayi])
    const prisoner = characterOf(state, 'simayi')

    // 司马懿为孙权所擒；孙权覆灭于刘备之手，他转入刘备营。
    takeCaptive(state, prisoner, 'sunquan')
    const will = state.captives.sunquan[0].will

    const notes = absorbCaptives(state, 'sunquan', 'liubei')

    expect(prisoner.status).toBe('captured')
    expect(captivesOf(state, 'liubei')).toHaveLength(1)
    expect(state.captives.liubei[0].will).toBe(will)
    expect(notes).toHaveLength(1)
  })
})

describe('麾下上限与俘虏归附', () => {
  /** 刘备麾下满员的在仕武将，驻守甲城。 */
  function fullRoster(): Character[] {
    return Array.from({ length: CHARACTER_LIMIT }, (_, index) =>
      officer({ id: `l${index}`, name: `刘将${index}`, factionId: 'liubei', stationedSiteId: 'a' }),
    )
  }

  it('麾下已满时，愿降者不得收，转为在野', () => {
    const guanyu = officer({
      id: 'guanyu',
      name: '关羽',
      personality: 'open',
      loyalty: 0,
      affinities: { liubei: 100 },
    })
    const state = scene([...fullRoster(), guanyu])

    takeCaptive(state, characterOf(state, 'guanyu'), 'liubei')
    expect(captivesOf(state, 'liubei')[0].attitude).toBe('愿降')
    expect(countServing(state.characters, 'liubei')).toBe(CHARACTER_LIMIT)

    const result = persuade(state, createRandom(1), 'guanyu', 'liubei')

    expect(result.ok).toBe(true)
    expect(characterOf(state, 'guanyu').status).toBe('wild')
    expect(characterOf(state, 'guanyu').factionId).toBeNull()
    expect(countServing(state.characters, 'liubei')).toBe(CHARACTER_LIMIT)
    expect(captivesOf(state, 'liubei')).toHaveLength(0)
  })

  it('覆灭时重归旧主者遇满员，转为在野', () => {
    const zhangfei = officer({ id: 'zhangfei', name: '张飞', factionId: 'liubei', stationedSiteId: 'a' })
    const state = scene([...fullRoster(), zhangfei])

    takeCaptive(state, characterOf(state, 'zhangfei'), 'caocao')
    expect(countServing(state.characters, 'liubei')).toBe(CHARACTER_LIMIT)

    const notes = absorbCaptives(state, 'caocao', 'liubei')

    expect(characterOf(state, 'zhangfei').status).toBe('wild')
    expect(characterOf(state, 'zhangfei').factionId).toBeNull()
    expect(notes).toHaveLength(1)
  })
})
