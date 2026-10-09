import { describe, expect, it } from 'vitest'
import {
  affinityAttitude,
  affinityToward,
  isValidAffinity,
  joinLoyaltyFor,
  NEUTRAL_AFFINITY,
  recruitmentFactor,
} from '../src/core/affinity'
import { DEFECT_THRESHOLD, LOYALTY_LOSS } from '../src/core/loyalty'
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

describe('倾向的定性态度', () => {
  it('按偏好分档：高者亲附、低者疏离、居中为中立', () => {
    expect(affinityAttitude(90)).toBe('亲附')
    expect(affinityAttitude(70)).toBe('亲附')
    expect(affinityAttitude(50)).toBe('中立')
    expect(affinityAttitude(31)).toBe('中立')
    expect(affinityAttitude(30)).toBe('疏离')
    expect(affinityAttitude(0)).toBe('疏离')
  })
})

describe('入仕的忠诚初值', () => {
  it('随偏好定档，落在 50–70', () => {
    expect(joinLoyaltyFor(0)).toBe(50)
    expect(joinLoyaltyFor(50)).toBe(60)
    expect(joinLoyaltyFor(100)).toBe(70)
  })

  it('给得足以挨过一次挫折，新入仕者不致一败即散', () => {
    for (let affinity = 0; affinity <= 100; affinity += 1) {
      expect(joinLoyaltyFor(affinity) - LOYALTY_LOSS.battleLost).toBeGreaterThanOrEqual(
        DEFECT_THRESHOLD,
      )
    }
  })
})
