import { describe, expect, it } from 'vitest'
import {
  CHARACTER_LIMIT,
  cloneCharacters,
  countServing,
  isRecruitable,
  validateCharacters,
} from '../src/core/characters'
import type { Character } from '../src/core/model'

const FACTION_IDS = ['liubei', 'caocao', 'sunquan']
const PROVINCE_IDS = ['jing', 'yu']

function character(overrides: Partial<Character> = {}): Character {
  return { id: 'a', name: '甲', status: 'wild', factionId: null, provinceId: 'jing', ...overrides }
}

describe('validateCharacters', () => {
  it('自洽数据没有问题', () => {
    const characters = [
      character({ id: 'a' }),
      character({ id: 'b', status: 'serving', factionId: 'liubei' }),
    ]

    expect(validateCharacters(characters, FACTION_IDS, PROVINCE_IDS)).toEqual([])
  })

  it('标识重复会被指出', () => {
    expect(validateCharacters([character(), character()], FACTION_IDS, PROVINCE_IDS)).toContain(
      '武将 id 重复：a',
    )
  })

  it('所在州不存在会被指出', () => {
    expect(
      validateCharacters([character({ provinceId: 'unknown' })], FACTION_IDS, PROVINCE_IDS),
    ).toContain('武将 a 的所在州不存在：unknown')
  })

  it('在仕武将缺少势力会被指出', () => {
    expect(
      validateCharacters([character({ status: 'serving' })], FACTION_IDS, PROVINCE_IDS),
    ).toContain('在仕武将 a 没有所属势力')
  })

  it('在仕武将的势力不存在会被指出', () => {
    expect(
      validateCharacters(
        [character({ status: 'serving', factionId: 'unknown' })],
        FACTION_IDS,
        PROVINCE_IDS,
      ),
    ).toContain('武将 a 的所属势力不存在：unknown')
  })

  it('在野或退场武将不应隶属势力', () => {
    expect(
      validateCharacters([character({ factionId: 'liubei' })], FACTION_IDS, PROVINCE_IDS),
    ).toContain('非在仕武将 a 不应隶属势力：liubei')
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
