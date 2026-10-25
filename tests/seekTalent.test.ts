import { describe, expect, it } from 'vitest'
import { ACTION_COSTS, ACTION_POINTS_PER_TURN } from '../src/core/actions'
import { joinLoyaltyFor } from '../src/core/affinity'
import { CHARACTER_LIMIT, countServing } from '../src/core/characters'
import { createInitialState } from '../src/core/createInitialState'
import type { Character, GameState, Personality, Scenario } from '../src/core/model'
import { createRandom, type Random } from '../src/core/random'
import { recruitChance, seekTalent, visit } from '../src/core/seekTalent'

/** 取一个 [0,1) 序列固定的随机源，供判定可控的用例。 */
function fixedRandom(values: number[]): Random {
  let index = 0

  return {
    next: () => values[index++] ?? 0,
    getState: () => 0,
  }
}

/** 一名在野候选，性格与对玩家（liubei）的偏好可调。 */
function candidate(personality: Personality, affinity: number): Character {
  return {
    id: 'candidate',
    name: '客',
    status: 'wild',
    factionId: null,
    provinceId: 'jing',
    scope: ['a'],
    might: 50,
    command: 50,
    intellect: 50,
    politics: 50,
    age: 30,
    personality,
    affinities: { liubei: affinity },
    loyalty: 0,
    isMonarch: false,
    armType: 'infantry',
    stationedSiteId: null,
    troops: 0,
    tier: 'basic',
  }
}

/** 一个州两个战略点：甲城归玩家，乙城归他方；在野候选置于荆州。 */
function seekScenario(character: Character, ...others: Character[]): Scenario {
  return {
    id: 'seek-test',
    name: '寻访测试',
    startDate: { era: '建安', year: 13, season: 'autumn' },
    playerFaction: 'liubei',
    factions: [
      { id: 'liubei', name: '刘备', color: '#3f7a5a', money: 0, grain: 1000 },
      { id: 'caocao', name: '曹操', color: '#3d6ea8', money: 0, grain: 1000 },
    ],
    geography: {
      provinces: [{ id: 'jing', name: '荆州', owner: null }],
      sites: [
        { id: 'a', name: '甲城', type: 'city', population: 50000, provinceId: 'jing', owner: 'liubei', neighbors: ['b'] },
        { id: 'b', name: '乙城', type: 'city', population: 50000, provinceId: 'jing', owner: 'caocao', neighbors: ['a'] },
      ],
    },
    characters: [character, ...others],
  }
}

function characterOf(state: GameState, id: string): Character {
  const character = state.characters.find((item) => item.id === id)
  if (character === undefined) {
    throw new Error(`武将不存在：${id}`)
  }
  return character
}

describe('招聘成功率', () => {
  it('性格决定起点，偏好决定加成，夹在 0–1 之间', () => {
    expect(recruitChance(candidate('open', 50), 'liubei')).toBeCloseTo(0.7)
    expect(recruitChance(candidate('open', 90), 'liubei')).toBeCloseTo(0.7 * 1.4)
    expect(recruitChance(candidate('open', 100), 'liubei')).toBe(1)
    expect(recruitChance(candidate('proud', 0), 'liubei')).toBeCloseTo(0.35 * 0.5)
  })
})

describe('seekTalent', () => {
  it('招到后入仕、归入名册，并扣行动力、写记录', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('open', 100)) })

    const result = seekTalent(state, createRandom(1), 'a')

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.record.kind).toBe('seekTalent')
    expect(result.record.targetId).toBe('a')
    const recruited = characterOf(state, 'candidate')
    expect(recruited.status).toBe('serving')
    expect(recruited.factionId).toBe('liubei')
    // 新入仕者直接入名册，不自动驻守。
    expect(recruited.stationedSiteId).toBeNull()
    // 入仕不带兵：兵力自零起，须自行征兵；带兵上限按统率给。
    expect(recruited.troops).toBe(0)
    // 入仕者的忠诚按其对主家的偏好定初值，不会一入仕就「离心」。
    expect(recruited.loyalty).toBe(joinLoyaltyFor(100))
    expect(state.actionPoints.liubei).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.seekTalent)
    expect(state.history).toEqual([result.record])
  })

  it('招聘未过时，人留在野、记入接触名单、行动力照扣', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('proud', 0)) })

    // 偏好 0 → 成功率 0.35 × 0.5 = 0.175；抽取用 0，判定用 0.99 → 必定失败。
    const result = seekTalent(state, fixedRandom([0, 0.99]), 'a')

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    expect(result.record.outcome).toContain('不愿出仕')
    expect(characterOf(state, 'candidate').status).toBe('wild')
    expect(state.contactedCandidates.liubei).toEqual([{ characterId: 'candidate', siteId: 'a' }])
    expect(state.actionPoints.liubei).toBe(ACTION_POINTS_PER_TURN - ACTION_COSTS.seekTalent)
  })

  it('非自有战略点无处寻访，不扣行动力', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('open', 100)) })

    const result = seekTalent(state, createRandom(1), 'b')

    expect(result).toEqual({ ok: false, reason: '此处不是自有战略点' })
    expect(state.actionPoints.liubei).toBe(ACTION_POINTS_PER_TURN)
    expect(state.history).toEqual([])
  })

  it('战略点不存在时拒绝', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('open', 100)) })

    expect(seekTalent(state, createRandom(1), 'unknown')).toEqual({
      ok: false,
      reason: '战略点不存在',
    })
  })

  it('该州没有在野之人时拒绝，不扣行动力也不写记录', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('open', 100)) })
    state.characters = []

    const result = seekTalent(state, createRandom(1), 'a')

    expect(result).toEqual({ ok: false, reason: '此处已无可寻之人' })
    expect(state.actionPoints.liubei).toBe(ACTION_POINTS_PER_TURN)
    expect(state.history).toEqual([])
  })

  it('麾下满员时拒绝，不扣行动力也不写记录', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('open', 100)) })
    let index = 0
    while (countServing(state.characters, state.playerFaction) < CHARACTER_LIMIT) {
      const filler = candidate('steady', 50)
      filler.id = `extra-${index}`
      filler.status = 'serving'
      filler.factionId = state.playerFaction
      filler.stationedSiteId = 'a'
      state.characters.push(filler)
      index += 1
    }

    const result = seekTalent(state, createRandom(1), 'a')

    expect(result).toEqual({ ok: false, reason: '麾下已满' })
    expect(state.actionPoints.liubei).toBe(ACTION_POINTS_PER_TURN)
    expect(state.history).toEqual([])
  })

  it('相同的抽卡源得到相同结果', () => {
    const run = () => {
      const state = createInitialState({ scenario: seekScenario(candidate('proud', 30)) })
      const result = seekTalent(state, createRandom(99), 'a')

      return result.ok ? result.record.outcome : null
    }

    expect(run()).toBe(run())
  })

  it('连续寻访推进抽卡源，不复现上一结果', () => {
    const first = candidate('proud', 0)
    first.id = 'c1'
    first.name = '甲客'
    const second = candidate('proud', 0)
    second.id = 'c2'
    second.name = '乙客'
    const state = createInitialState({ scenario: seekScenario(first, second) })

    // 抽取依次用 0 与 0.5：先抽中第一个人、再抽中第二个人，说明抽卡源在两次之间已推进。
    const random = fixedRandom([0, 0.99, 0.5, 0.99])

    const before = seekTalent(state, random, 'a')
    const after = seekTalent(state, random, 'a')

    expect(before.ok && after.ok).toBe(true)
    if (!before.ok || !after.ok) {
      return
    }

    expect(before.record.outcome).toContain('甲客')
    expect(after.record.outcome).toContain('乙客')
  })
})

describe('visit', () => {
  it('拜访提升目标对己方的偏好，并重新判定：成功则入仕', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('proud', 0)) })
    seekTalent(state, fixedRandom([0, 0.99]), 'a')

    // 增量用 0.5 → 5 + floor(0.5 × 11) = 10；判定用 0 → 必成。
    const result = visit(state, fixedRandom([0.5, 0]), 'candidate')

    expect(result.ok).toBe(true)
    const who = characterOf(state, 'candidate')
    expect(who.affinities.liubei).toBe(10)
    expect(who.status).toBe('serving')
    expect(who.stationedSiteId).toBeNull()
    expect(who.loyalty).toBe(joinLoyaltyFor(10))
    expect(state.contactedCandidates.liubei).toEqual([])
    expect(state.actionPoints.liubei).toBe(
      ACTION_POINTS_PER_TURN - ACTION_COSTS.seekTalent - ACTION_COSTS.visit,
    )
  })

  it('想再次拜访，但对方仍不应允时，人留在野、接触名单保留', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('proud', 0)) })
    seekTalent(state, fixedRandom([0, 0.99]), 'a')

    const result = visit(state, fixedRandom([0.5, 0.99]), 'candidate')

    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }
    expect(result.record.outcome).toContain('仍未应允')
    expect(characterOf(state, 'candidate').status).toBe('wild')
    expect(state.contactedCandidates.liubei).toEqual([{ characterId: 'candidate', siteId: 'a' }])
  })

  it('未接触过的人不能拜访，不扣行动力', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('open', 100)) })

    const result = visit(state, createRandom(1), 'candidate')

    expect(result).toEqual({ ok: false, reason: '尚未与此人接触' })
    expect(state.actionPoints.liubei).toBe(ACTION_POINTS_PER_TURN)
  })
})

describe('寻访与接触名单', () => {
  it('已接触过的人不再被寻访抽到，再争取只能登门拜访', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('proud', 0)) })
    seekTalent(state, fixedRandom([0, 0.99]), 'a')
    expect(state.contactedCandidates.liubei).toEqual([{ characterId: 'candidate', siteId: 'a' }])

    // 州中只剩他一名在野者；若还入池必被抽中，被拒说明他已在寻访范围之外。
    expect(seekTalent(state, fixedRandom([0, 0.99]), 'a')).toEqual({
      ok: false,
      reason: '此处已无可寻之人',
    })
  })

  it('会面之处易主后他重归寻访池，可在别处再遇上', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('proud', 0)) })
    seekTalent(state, fixedRandom([0, 0.99]), 'a')

    // 甲城失守，但本州另有丙城在手。
    const third = {
      id: 'c',
      name: '丙城',
      type: 'city' as const,
      population: 50000,
      provinceId: 'jing',
      owner: 'liubei',
      neighbors: ['a'],
    }
    state.geography.sites.push(third)
    const siteA = state.geography.sites.find((item) => item.id === 'a')
    if (siteA !== undefined) {
      siteA.owner = 'caocao'
    }

    const result = seekTalent(state, fixedRandom([0, 0.99]), 'c')

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.record.outcome).toContain('客')
    }
    expect(state.contactedCandidates.liubei).toEqual([{ characterId: 'candidate', siteId: 'c' }])
  })

  it('他方把人招走后，他从我的待招募里消失', () => {
    const state = createInitialState({ scenario: seekScenario(candidate('proud', 0)) })
    seekTalent(state, fixedRandom([0, 0.99]), 'a')
    expect(state.contactedCandidates.liubei).toHaveLength(1)

    // 曹操在自己的乙城寻访同一州的人才，抽中即入仕。
    const result = seekTalent(state, fixedRandom([0, 0]), 'b', 'caocao')

    expect(result.ok).toBe(true)
    expect(characterOf(state, 'candidate').factionId).toBe('caocao')
    expect(state.contactedCandidates.liubei ?? []).toEqual([])
  })
})
