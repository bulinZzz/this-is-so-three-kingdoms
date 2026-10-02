import { describe, expect, it } from 'vitest'
import { validateGeography } from '../src/core/geography'
import { GEOGRAPHY_SANGUO } from '../src/core/geographySanguo'
import type { SiteId } from '../src/core/model'
import { SANGUO_208 } from '../src/core/scenarios'
import { projectLonLat } from '../src/game/mapLayout'
import { SITE_COORDINATES } from '../src/game/mapData'

const FACTION_IDS = SANGUO_208.factions.map((faction) => faction.id)

function sitesOwnedBy(owner: string): SiteId[] {
  return GEOGRAPHY_SANGUO.sites.filter((site) => site.owner === owner).map((site) => site.id)
}

/** 战略点在制图投影下的坐标，用于复算邻接规则。 */
function projected(siteId: SiteId): { x: number; y: number } {
  return projectLonLat(SITE_COORDINATES[siteId])
}

/** w 是否落在以 u、v 为直径的圆内（等价于 u-w-v 为钝角或直角）。 */
function insideDiameterCircle(w: SiteId, u: SiteId, v: SiteId): boolean {
  const a = projected(w)
  const b = projected(u)
  const c = projected(v)

  return (a.x - b.x) * (a.x - c.x) + (a.y - b.y) * (a.y - c.y) < 0
}

/** 投影坐标系下的两点距离，用于校验邻接表按距离升序排列。 */
function projectedDistance(u: SiteId, v: SiteId): number {
  const a = projected(u)
  const b = projected(v)

  return Math.hypot(a.x - b.x, a.y - b.y)
}

describe('三国地理数据', () => {
  it('数据自洽', () => {
    expect(validateGeography(GEOGRAPHY_SANGUO, FACTION_IDS)).toEqual([])
  })

  it('覆盖十四个州、四十一个战略点，州名不重复', () => {
    expect(GEOGRAPHY_SANGUO.provinces).toHaveLength(14)
    expect(GEOGRAPHY_SANGUO.sites).toHaveLength(41)
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

  it('刘备开局只据江夏，且江夏有可进军的相邻点', () => {
    expect(sitesOwnedBy('liubei')).toEqual(['jiangxia'])

    const jiangxia = GEOGRAPHY_SANGUO.sites.find((site) => site.id === 'jiangxia')
    expect(jiangxia?.neighbors.length).toBeGreaterThan(0)
  })

  it('曹操占地最多，孙权次之，仍有未归属之地', () => {
    const caocao = sitesOwnedBy('caocao')
    const sunquan = sitesOwnedBy('sunquan')
    const liubei = sitesOwnedBy('liubei')
    const unowned = GEOGRAPHY_SANGUO.sites.filter((site) => site.owner === null)

    expect(caocao.length).toBe(27)
    expect(sunquan.length).toBe(5)
    expect(liubei.length).toBe(1)
    expect(unowned.length).toBe(8)
    expect(caocao.length).toBeGreaterThan(sunquan.length)
    expect(sunquan.length).toBeGreaterThan(0)
    expect(unowned.length).toBeGreaterThan(0)
  })

  it('从江夏出发可以走遍所有战略点', () => {
    const sitesById = new Map(GEOGRAPHY_SANGUO.sites.map((site) => [site.id, site]))
    const visited = new Set<SiteId>(['jiangxia'])
    const queue: SiteId[] = ['jiangxia']

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

  it('邻接按地理推导：相邻两点之间不存在第三个战略点', () => {
    const allIds = GEOGRAPHY_SANGUO.sites.map((site) => site.id)

    for (const site of GEOGRAPHY_SANGUO.sites) {
      for (const neighborId of site.neighbors) {
        for (const otherId of allIds) {
          if (otherId === site.id || otherId === neighborId) {
            continue
          }

          expect(insideDiameterCircle(otherId, site.id, neighborId)).toBe(false)
        }
      }
    }
  })

  it('相邻列表按距离升序排列', () => {
    for (const site of GEOGRAPHY_SANGUO.sites) {
      const distances = site.neighbors.map((neighborId) => projectedDistance(site.id, neighborId))

      expect(distances).toEqual([...distances].sort((a, b) => a - b))
    }
  })

  it('新野与宛相邻', () => {
    const xinye = GEOGRAPHY_SANGUO.sites.find((site) => site.id === 'xinye')
    const wancheng = GEOGRAPHY_SANGUO.sites.find((site) => site.id === 'wancheng')

    expect(xinye?.neighbors).toContain('wancheng')
    expect(wancheng?.neighbors).toContain('xinye')
  })

  it('邻接远少于完全图，绝非两两相连', () => {
    const siteCount = GEOGRAPHY_SANGUO.sites.length
    const edgeCount =
      GEOGRAPHY_SANGUO.sites.reduce((sum, site) => sum + site.neighbors.length, 0) / 2
    const completeGraphEdgeCount = (siteCount * (siteCount - 1)) / 2

    expect(completeGraphEdgeCount).toBe(820)
    expect(edgeCount).toBeLessThan(siteCount * 4)
  })
})
