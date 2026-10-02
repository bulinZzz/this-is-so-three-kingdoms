import { describe, expect, it } from 'vitest'
import { validateGeography } from '../src/core/geography'
import { GEOGRAPHY_SANGUO } from '../src/core/geographySanguo'
import type { SiteId } from '../src/core/model'
import { SANGUO_207 } from '../src/core/scenarios'

const FACTION_IDS = SANGUO_207.factions.map((faction) => faction.id)

function sitesOwnedBy(owner: string): SiteId[] {
  return GEOGRAPHY_SANGUO.sites.filter((site) => site.owner === owner).map((site) => site.id)
}

describe('三国地理数据', () => {
  it('数据自洽', () => {
    expect(validateGeography(GEOGRAPHY_SANGUO, FACTION_IDS)).toEqual([])
  })

  it('覆盖十四个州、四十个战略点，州名不重复', () => {
    expect(GEOGRAPHY_SANGUO.provinces).toHaveLength(14)
    expect(GEOGRAPHY_SANGUO.sites).toHaveLength(40)
    expect(new Set(GEOGRAPHY_SANGUO.provinces.map((province) => province.name)).size).toBe(14)
  })

  it('长安隶属雍州', () => {
    const changan = GEOGRAPHY_SANGUO.sites.find((site) => site.id === 'changan')

    expect(changan?.provinceId).toBe('yong')
  })

  it('每个战略点都有对应的州', () => {
    const provinceIds = new Set(GEOGRAPHY_SANGUO.provinces.map((province) => province.id))

    for (const site of GEOGRAPHY_SANGUO.sites) {
      expect(provinceIds.has(site.provinceId)).toBe(true)
    }
  })

  it('城市、关隘、野地三类都有实例', () => {
    const types = new Set(GEOGRAPHY_SANGUO.sites.map((site) => site.type))

    expect(types).toEqual(new Set(['city', 'pass', 'field']))
  })

  it('刘备开局只据新野，且新野有可进军的相邻点', () => {
    expect(sitesOwnedBy('liubei')).toEqual(['xinye'])

    const xinye = GEOGRAPHY_SANGUO.sites.find((site) => site.id === 'xinye')
    expect(xinye?.neighbors.length).toBeGreaterThan(0)
  })

  it('曹操占地最多，孙权次之，仍有未归属之地', () => {
    const caocao = sitesOwnedBy('caocao')
    const sunquan = sitesOwnedBy('sunquan')
    const unowned = GEOGRAPHY_SANGUO.sites.filter((site) => site.owner === null)

    expect(caocao.length).toBeGreaterThan(sunquan.length)
    expect(sunquan.length).toBeGreaterThan(0)
    expect(unowned.length).toBeGreaterThan(0)
  })

  it('从新野出发可以走遍所有战略点', () => {
    const sitesById = new Map(GEOGRAPHY_SANGUO.sites.map((site) => [site.id, site]))
    const visited = new Set<SiteId>(['xinye'])
    const queue: SiteId[] = ['xinye']

    while (queue.length > 0) {
      const current = queue.shift() as SiteId
      for (const neighborId of sitesById.get(current)?.neighbors ?? []) {
        if (!visited.has(neighborId)) {
          visited.add(neighborId)
          queue.push(neighborId)
        }
      }
    }

    expect(visited.size).toBe(GEOGRAPHY_SANGUO.sites.length)
  })
})
