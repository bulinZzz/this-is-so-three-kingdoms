import { describe, expect, it } from 'vitest'
import {
  affinityToward,
  isValidAffinity,
  NEUTRAL_AFFINITY,
  recruitmentFactor,
} from '../src/core/affinity'
import type { Character } from '../src/core/model'

/** 倾向函数只读 affinities，构造这一片即可。 */
function someone(affinities: Character['affinities']): Pick<Character, 'affinities'> {
  return { affinities }
}

describe('势力倾向', () => {
  it('未记录的势力对按中性 50', () => {
    expect(affinityToward(someone({ liubei: 90 }), 'sunquan')).toBe(NEUTRAL_AFFINITY)
  })

  it('已记录的势力对取记录值', () => {
    expect(affinityToward(someone({ caocao: 20 }), 'caocao')).toBe(20)
  })

  it('偏好限定为 0–100 的整数', () => {
    expect(isValidAffinity(0)).toBe(true)
    expect(isValidAffinity(50)).toBe(true)
    expect(isValidAffinity(100)).toBe(true)
    expect(isValidAffinity(101)).toBe(false)
    expect(isValidAffinity(-1)).toBe(false)
    expect(isValidAffinity(50.5)).toBe(false)
    expect(isValidAffinity(undefined)).toBe(false)
  })
})

describe('寻访成功率系数', () => {
  it('中性偏好不增不减', () => {
    expect(recruitmentFactor(NEUTRAL_AFFINITY)).toBe(1)
  })

  it('偏好 90 为 +40%，偏好 20 为 −30%', () => {
    expect(recruitmentFactor(90)).toBeCloseTo(1.4)
    expect(recruitmentFactor(20)).toBeCloseTo(0.7)
  })
})
