import { describe, expect, it } from 'vitest'
import {
  CHARACTER_LIMIT,
  cloneCharacters,
  countServing,
  isRecruitable,
  validateCharacters,
} from '../src/core/characters'
import type { Character, Geography } from '../src/core/model'

const FACTION_IDS = ['liubei', 'caocao', 'sunquan']
const GEOGRAPHY: Geography = {
  provinces: [
    { id: 'jing', name: '荆州', owner: null },
    { id: 'yu', name: '豫州', owner: null },
  ],
  sites: [
    { id: 'jiangxia', name: '江夏', type: 'city', provinceId: 'jing', owner: 'liubei', neighbors: [] },
    { id: 'xudu', name: '许都', type: 'city', provinceId: 'yu', owner: 'caocao', neighbors: [] },
  ],
}

function character(overrides: Partial<Character> = {}): Character {
  return {
    id: 'a',
    name: '甲',
    status: 'wild',
    factionId: null,
    provinceId: 'jing',
    might: 50,
    command: 50,
    intellect: 50,
    politics: 50,
    age: 40,
    personality: 'steady',
    affinities: {},
    loyalty: 0,
    isMonarch: false,
    stationedSiteId: null,
    troops: 0,
    tier: 'basic',
    ...overrides,
  }
}

describe('validateCharacters', () => {
  it('自洽数据没有问题', () => {
    const characters = [
      character({ id: 'a' }),
      character({
        id: 'b',
        status: 'serving',
        factionId: 'liubei',
        stationedSiteId: 'jiangxia',
      }),
    ]

    expect(validateCharacters(characters, FACTION_IDS, GEOGRAPHY)).toEqual([])
  })

  it('标识重复会被指出', () => {
    expect(validateCharacters([character(), character()], FACTION_IDS, GEOGRAPHY)).toContain(
      '武将 id 重复：a',
    )
  })

  it('所在州不存在会被指出', () => {
    expect(
      validateCharacters([character({ provinceId: 'unknown' })], FACTION_IDS, GEOGRAPHY),
    ).toContain('武将 a 的所在州不存在：unknown')
  })

  it('能力数值超出范围会被指出', () => {
    expect(validateCharacters([character({ might: 120 })], FACTION_IDS, GEOGRAPHY)).toContain(
      '武将 a 的武力超出范围：120',
    )
    expect(validateCharacters([character({ loyalty: 0.5 })], FACTION_IDS, GEOGRAPHY)).toContain(
      '武将 a 的忠诚超出范围：0.5',
    )
    expect(validateCharacters([character({ politics: 120 })], FACTION_IDS, GEOGRAPHY)).toContain(
      '武将 a 的内政超出范围：120',
    )
  })

  it('势力倾向指向不存在的势力会被指出', () => {
    expect(
      validateCharacters([character({ affinities: { unknown: 90 } })], FACTION_IDS, GEOGRAPHY),
    ).toContain('武将 a 的势力倾向指向不存在的势力：unknown')
  })

  it('势力倾向超出 0–100 会被指出', () => {
    expect(
      validateCharacters([character({ affinities: { liubei: 120 } })], FACTION_IDS, GEOGRAPHY),
    ).toContain('武将 a 的势力倾向超出范围：120')
  })

  it('性格不在既定标签内会被指出', () => {
    const invalid = 'mystery' as unknown as Character['personality']

    expect(
      validateCharacters([character({ personality: invalid })], FACTION_IDS, GEOGRAPHY),
    ).toContain('武将 a 的性格不合法：mystery')
  })

  it('年龄超出范围会被指出', () => {
    expect(validateCharacters([character({ age: 200 })], FACTION_IDS, GEOGRAPHY)).toContain(
      '武将 a 的年龄超出范围：200',
    )
  })

  it('尚未出生者记负年龄，属于合法数据', () => {
    expect(validateCharacters([character({ age: -5 })], FACTION_IDS, GEOGRAPHY)).toEqual([])
  })

  it('在野武将没有卡池层级会被指出', () => {
    expect(validateCharacters([character({ tier: null })], FACTION_IDS, GEOGRAPHY)).toContain(
      '在野武将 a 没有卡池层级',
    )
  })

  it('在仕武将缺少势力会被指出', () => {
    expect(
      validateCharacters([character({ status: 'serving' })], FACTION_IDS, GEOGRAPHY),
    ).toContain('在仕武将 a 没有所属势力')
  })

  it('在仕武将的势力不存在会被指出', () => {
    expect(
      validateCharacters(
        [character({ status: 'serving', factionId: 'unknown' })],
        FACTION_IDS,
        GEOGRAPHY,
      ),
    ).toContain('武将 a 的所属势力不存在：unknown')
  })

  it('在仕武将缺少驻地被指出', () => {
    expect(
      validateCharacters(
        [character({ status: 'serving', factionId: 'liubei' })],
        FACTION_IDS,
        GEOGRAPHY,
      ),
    ).toContain('在仕武将 a 没有驻地')
  })

  it('驻地不存在会被指出', () => {
    expect(
      validateCharacters(
        [character({ status: 'serving', factionId: 'liubei', stationedSiteId: 'unknown' })],
        FACTION_IDS,
        GEOGRAPHY,
      ),
    ).toContain('武将 a 的驻地不存在：unknown')
  })

  it('驻地不属于其势力会被指出', () => {
    expect(
      validateCharacters(
        [character({ status: 'serving', factionId: 'liubei', stationedSiteId: 'xudu' })],
        FACTION_IDS,
        GEOGRAPHY,
      ),
    ).toContain('武将 a 的驻地 xudu 不属于其势力')
  })

  it('在野或退场武将不应隶属势力', () => {
    expect(
      validateCharacters([character({ factionId: 'liubei' })], FACTION_IDS, GEOGRAPHY),
    ).toContain('非在仕武将 a 不应隶属势力：liubei')
  })

  it('非在仕武将不应有驻地', () => {
    expect(
      validateCharacters(
        [character({ stationedSiteId: 'jiangxia' })],
        FACTION_IDS,
        GEOGRAPHY,
      ),
    ).toContain('非在仕武将 a 不应有驻地：jiangxia')
  })

  it('非在仕武将不应有部队', () => {
    expect(validateCharacters([character({ troops: 500 })], FACTION_IDS, GEOGRAPHY)).toContain(
      '非在仕武将 a 不应有部队：500',
    )
  })

  it('非在仕武将不应是君主', () => {
    expect(
      validateCharacters([character({ isMonarch: true })], FACTION_IDS, GEOGRAPHY),
    ).toContain('非在仕武将 a 不应是君主')
  })

  it('同一势力有多名君主会被指出', () => {
    const monarch = (id: string) =>
      character({
        id,
        status: 'serving',
        factionId: 'liubei',
        stationedSiteId: 'jiangxia',
        isMonarch: true,
      })

    expect(validateCharacters([monarch('a'), monarch('b')], FACTION_IDS, GEOGRAPHY)).toContain(
      '势力 liubei 有多名君主',
    )
  })
})

describe('武将判定', () => {
  it('只有在野武将可被寻访', () => {
    expect(isRecruitable(character({ status: 'wild' }))).toBe(true)
    expect(isRecruitable(character({ status: 'serving', factionId: 'liubei' }))).toBe(false)
    expect(isRecruitable(character({ status: 'retired' }))).toBe(false)
  })

  it('在仕数只统计在仕且从属该势力的武将', () => {
    const characters = [
      character({ id: 'a', status: 'serving', factionId: 'liubei' }),
      character({ id: 'b', status: 'serving', factionId: 'liubei' }),
      character({ id: 'c', status: 'wild' }),
      character({ id: 'd', status: 'serving', factionId: 'caocao' }),
    ]

    expect(countServing(characters, 'liubei')).toBe(2)
    expect(countServing(characters, 'sunquan')).toBe(0)
  })

  it('克隆人物后改动不影响原数据', () => {
    const source = [character()]
    const cloned = cloneCharacters(source)

    cloned[0].name = '改动'

    expect(source[0].name).toBe('甲')
  })

  it('上限为正整数', () => {
    expect(Number.isInteger(CHARACTER_LIMIT)).toBe(true)
    expect(CHARACTER_LIMIT).toBeGreaterThan(0)
  })
})
