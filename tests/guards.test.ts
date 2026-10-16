import { describe, expect, it } from 'vitest'
import { guardFor } from '../src/core/guards'
import type { Site, SiteType } from '../src/core/model'

function site(over: Partial<Site> & { id: string; type: SiteType; population: number }): Site {
  return {
    name: over.id,
    provinceId: 'p',
    owner: null,
    neighbors: [],
    ...over,
  }
}

describe('无主战略点守军', () => {
  it('兵力按人口比例推导，并受类型上限约束', () => {
    expect(guardFor(site({ id: 'a', type: 'field', population: 10000 })).troops).toBe(500)
    expect(guardFor(site({ id: 'b', type: 'city', population: 80000 })).troops).toBe(4000)
    // 人口再高也不超类型上限。
    expect(guardFor(site({ id: 'c', type: 'metropolis', population: 1000000 })).troops).toBe(6000)
  })

  it('能力按类型给定', () => {
    const city = guardFor(site({ id: 'b', type: 'city', population: 80000 }))
    const field = guardFor(site({ id: 'a', type: 'field', population: 10000 }))

    expect(city.intellect).toBeGreaterThan(field.intellect)
  })

  it('名号按类型给词表、按标识确定性选取，格式为「名称·头衔」', () => {
    const first = guardFor(site({ id: 'chibi', type: 'field', population: 10000 }))
    const again = guardFor(site({ id: 'chibi', type: 'field', population: 10000 }))

    expect(first.name).toBe(again.name)
    expect(first.name).toMatch(/^(山贼|流寇|海盗)·头目$/)
    expect(guardFor(site({ id: 'x', type: 'city', population: 80000 })).name).toMatch(/^(义军|民兵)·领袖$/)
    expect(guardFor(site({ id: 'y', type: 'pass', population: 20000 })).name).toMatch(/^(戍卒|关卒)·校尉$/)
  })
})
