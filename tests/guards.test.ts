import { describe, expect, it } from 'vitest'
import { guardFor } from '../src/core/guards'
import type { Site, SiteGuard, SiteType } from '../src/core/model'

function site(over: Partial<Site> & { id: string; type: SiteType; population: number }): Site {
  return {
    name: over.id,
    provinceId: 'p',
    owner: null,
    neighbors: [],
    ...over,
  }
}

/** 城池与关隘的守备；野地不设守备，另作断言。 */
function guardOf(
  over: Partial<Site> & { id: string; type: SiteType; population: number },
): SiteGuard {
  const guard = guardFor(site(over))
  if (guard === null) {
    throw new Error(`${over.type} 不设守备`)
  }

  return guard
}

describe('战略点守备', () => {
  it('野地无归属、无人烟，不设守备', () => {
    expect(guardFor(site({ id: 'chibi', type: 'field', population: 0 }))).toBeNull()
  })

  it('兵力按人口比例推导，并受类型上限约束', () => {
    expect(guardOf({ id: 'b', type: 'city', population: 80000 }).troops).toBe(4000)
    // 人口再高也不超类型上限。
    expect(guardOf({ id: 'c', type: 'metropolis', population: 1000000 }).troops).toBe(6000)
  })

  it('能力按类型递增', () => {
    const city = guardOf({ id: 'b', type: 'city', population: 80000 })
    const town = guardOf({ id: 'a', type: 'town', population: 50000 })

    expect(city.intellect).toBeGreaterThan(town.intellect)
  })

  it('名号按类型给词表、按标识确定性选取，格式为「名称·头衔」', () => {
    const first = guardOf({ id: 'changsha', type: 'city', population: 80000 })
    const again = guardOf({ id: 'changsha', type: 'city', population: 80000 })

    expect(first.name).toBe(again.name)
    expect(first.name).toMatch(/^(义军|民兵)·领袖$/)
    expect(guardOf({ id: 'y', type: 'pass', population: 20000 }).name).toMatch(
      /^(戍卒|关卒)·校尉$/,
    )
  })
})
