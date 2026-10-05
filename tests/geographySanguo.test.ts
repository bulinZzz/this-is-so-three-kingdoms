import { describe, expect, it } from 'vitest'
import { cloneGeography, resolveProvinceOwners, validateGeography } from '../src/core/geography'
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

/**
 * 几何规则之外的史实强制相邻边，与 tools/buildAdjacency.mjs 的 FORCED_EDGES 保持一致。
 * 赤壁之战为孙刘联军，柴桑是周瑜的前线基地；江陵与夷陵之间是长江水道；
 * 零陵与武陵同属荆南，湘江与沅水水道相通。
 */
const FORCED_EDGES: ReadonlyArray<readonly [SiteId, SiteId]> = [
  ['chibi', 'chaisang'],
  ['jiangling', 'yiling'],
  ['lingling', 'wuling'],
]

/**
 * 几何上无第三点阻挡、但史实上并无直接通道的点对，与 tools/buildAdjacency.mjs 的 EXCLUDED_EDGES 保持一致。
 * 长安在关中、白帝城在巴东，中隔秦岭与大巴山；临淄与小沛隔兖、徐二州；晋阳与蓟隔冀州。
 */
const EXCLUDED_EDGES: ReadonlyArray<readonly [SiteId, SiteId]> = [
  ['changan', 'baidicheng'],
  ['linzi', 'xiaopei'],
  ['jinyang', 'jicheng'],
]

const forcedEdgeKeys = new Set(FORCED_EDGES.map(([a, b]) => [a, b].sort().join('|')))

/** 该点对是否为已登记在案的强制相邻边（按点 id 判定，与顺序无关）。 */
function isForcedEdge(u: SiteId, v: SiteId): boolean {
  return forcedEdgeKeys.has([u, v].sort().join('|'))
}

describe('三国地理数据', () => {
  it('数据自洽', () => {
    expect(validateGeography(GEOGRAPHY_SANGUO, FACTION_IDS)).toEqual([])
  })

  it('覆盖十三个州、五十五个战略点，州名不重复', () => {
    expect(GEOGRAPHY_SANGUO.provinces).toHaveLength(13)
    expect(GEOGRAPHY_SANGUO.sites).toHaveLength(55)
    expect(new Set(GEOGRAPHY_SANGUO.provinces.map((province) => province.name)).size).toBe(13)
  })

  it('长安隶属司隶', () => {
    const changan = GEOGRAPHY_SANGUO.sites.find((site) => site.id === 'changan')

    expect(changan?.provinceId).toBe('sili')
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

    expect(caocao.length).toBe(26)
    expect(sunquan.length).toBe(7)
    expect(liubei.length).toBe(1)
    expect(unowned.length).toBe(21)
    expect(caocao.length).toBeGreaterThan(sunquan.length)
    expect(sunquan.length).toBeGreaterThan(0)
    expect(unowned.length).toBeGreaterThan(0)
  })

  it('州归属与占点多寡一致', () => {
    const geography = cloneGeography(GEOGRAPHY_SANGUO)
    const authors = geography.provinces.map((province) => province.owner)

    resolveProvinceOwners(geography)

    expect(geography.provinces.map((province) => province.owner)).toEqual(authors)
  })

  it('建安十三年：曹操据江北诸州，孙权据扬州，益、凉、交无归属', () => {
    const ownerOf = (provinceId: string) =>
      GEOGRAPHY_SANGUO.provinces.find((province) => province.id === provinceId)?.owner

    for (const provinceId of ['sili', 'yu', 'yan', 'xu', 'qing', 'ji', 'bing', 'you', 'jing']) {
      expect(ownerOf(provinceId)).toBe('caocao')
    }
    expect(ownerOf('yang')).toBe('sunquan')
    expect(ownerOf('yi')).toBeNull()
    expect(ownerOf('liang')).toBeNull()
    expect(ownerOf('jiao')).toBeNull()
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

  it('邻接按地理推导：相邻两点之间不存在第三个战略点（史实强制相邻除外）', () => {
    const allIds = GEOGRAPHY_SANGUO.sites.map((site) => site.id)
    let skipped = 0

    for (const site of GEOGRAPHY_SANGUO.sites) {
      for (const neighborId of site.neighbors) {
        if (isForcedEdge(site.id, neighborId)) {
          skipped += 1
          continue
        }

        for (const otherId of allIds) {
          if (otherId === site.id || otherId === neighborId) {
            continue
          }

          expect(insideDiameterCircle(otherId, site.id, neighborId)).toBe(false)
        }
      }
    }

    // 豁免必须恰好等于名单中的强制边（两端各计一次），除此之外的边一律照常校验。
    expect(skipped).toBe(FORCED_EDGES.length * 2)
  })

  it('史实强制相邻按名字豁免，几何判据本身未被削弱', () => {
    // 名单中的每条边都必须真实存在于邻接表，避免豁免落空。
    for (const [a, b] of FORCED_EDGES) {
      const siteA = GEOGRAPHY_SANGUO.sites.find((site) => site.id === a)
      const siteB = GEOGRAPHY_SANGUO.sites.find((site) => site.id === b)

      expect(siteA?.neighbors).toContain(b)
      expect(siteB?.neighbors).toContain(a)
    }

    // 只有名字被豁免：赤壁–柴桑的几何判据依旧判定江夏落在直径圆内。
    expect(insideDiameterCircle('jiangxia', 'chibi', 'chaisang')).toBe(true)
    // 反向对照：同一条直径圆上，江陵确在圆外，判据本身照常给出否定结果。
    expect(insideDiameterCircle('jiangling', 'chibi', 'chaisang')).toBe(false)
  })

  it('史实强制不相邻按名字排除', () => {
    for (const [a, b] of EXCLUDED_EDGES) {
      const siteA = GEOGRAPHY_SANGUO.sites.find((site) => site.id === a)
      const siteB = GEOGRAPHY_SANGUO.sites.find((site) => site.id === b)

      expect(siteA?.neighbors).not.toContain(b)
      expect(siteB?.neighbors).not.toContain(a)
    }

    // 该点对本身满足几何规则，只因史实无通道才排除。
    expect(insideDiameterCircle('hanzhong', 'changan', 'baidicheng')).toBe(false)
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

    expect(completeGraphEdgeCount).toBe(1485)
    expect(edgeCount).toBeLessThan(siteCount * 4)
  })
})
