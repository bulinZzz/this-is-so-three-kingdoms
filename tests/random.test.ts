import { describe, expect, it } from 'vitest'
import { createRandom, createSeed, type Random } from '../src/core/random'

function take(random: Random, count: number): number[] {
  return Array.from({ length: count }, () => random.next())
}

describe('createRandom', () => {
  it('相同种子产生相同序列', () => {
    expect(take(createRandom(208), 5)).toEqual(take(createRandom(208), 5))
  })

  it('不同种子产生不同序列', () => {
    expect(take(createRandom(208), 5)).not.toEqual(take(createRandom(209), 5))
  })

  it('取数结果落在 [0, 1) 区间', () => {
    const values = take(createRandom(208), 1000)

    expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
  })

  it('导出状态后重建，序列与原序列接得上', () => {
    const random = createRandom(208)
    take(random, 3)

    const resumed = createRandom(random.getState())

    expect(take(resumed, 5)).toEqual(take(random, 5))
  })
})

describe('createSeed', () => {
  it('返回无符号 32 位范围内的正整数', () => {
    for (let i = 0; i < 50; i += 1) {
      const seed = createSeed()

      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThan(0)
      expect(seed).toBeLessThanOrEqual(0xffffffff)
    }
  })
})
