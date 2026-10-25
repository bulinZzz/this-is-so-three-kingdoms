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

function siteOf(id: SiteId) {
  const site = GEOGRAPHY_SANGUO.sites.find((item) => item.id === id)
  if (site === undefined) {
    throw new Error(`战略点不存在：${id}`)
  }
  return site
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
 * 这些点对之间隔着一个落在直径圆内的战略点，仅凭几何会误判为不相邻，故按史实补回。
 */
const FORCED_EDGES: ReadonlyArray<readonly [SiteId, SiteId]> = [
  ['lingling', 'wuling'],
  ['gongan', 'yiling'],
  ['gongan', 'changsha'],
  ['chibi', 'jiangling'],
  ['chengdu', 'mianzhu'],
  ['nanzheng', 'yangpingguan'],
  ['dingjunshan', 'jiamengguan'],
  ['shouchun', 'guangling'],
  ['chibi', 'chaisang'],
  ['chengdu', 'lushui'],
  ['chencang', 'yangpingguan'],
  ['changan', 'zhiwugu'],
  ['tianshui', 'jincheng'],
  ['chaisang', 'jianye'],
  ['xudu', 'qiao'],
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

  it('覆盖十三个州、六十六个战略点，州名不重复', () => {
    expect(GEOGRAPHY_SANGUO.provinces).toHaveLength(13)
    expect(GEOGRAPHY_SANGUO.sites).toHaveLength(66)
    expect(new Set(GEOGRAPHY_SANGUO.provinces.map((province) => province.name)).size).toBe(13)
  })

  it('长安隶属司隶', () => {
    expect(siteOf('changan').provinceId).toBe('sili')
  })

  it('每个战略点都有对应的州', () => {
    const provinceIds = new Set(GEOGRAPHY_SANGUO.provinces.map((province) => province.id))

    for (const site of GEOGRAPHY_SANGUO.sites) {
      expect(provinceIds.has(site.provinceId)).toBe(true)
    }
  })

  it('都会、大城、小城、关隘、野地五类都有实例', () => {
    const types = new Set(GEOGRAPHY_SANGUO.sites.map((site) => site.type))

    expect(types).toEqual(new Set(['metropolis', 'city', 'town', 'pass', 'field']))
  })

  it('野地无人烟，但同样有归属、并入行军图', () => {
    const fields = GEOGRAPHY_SANGUO.sites.filter((site) => site.type === 'field')

    expect(fields).toHaveLength(8)
    for (const site of fields) {
      expect(site.owner).not.toBeNull()
      expect(site.population).toBe(0)
      expect(site.neighbors.length).toBeGreaterThan(0)
    }
  })

  it('可占战略点都有人口，为合理的正整数', () => {
    const owned = GEOGRAPHY_SANGUO.sites.filter((site) => site.type !== 'field')

    expect(owned).toHaveLength(58)
    for (const site of owned) {
      expect(Number.isInteger(site.population)).toBe(true)
      expect(site.population).toBeGreaterThan(0)
    }
  })

  it('人口与类型解耦：同为城，人口可以悬殊', () => {
    // 三江城虽作大城入图，人烟却只抵一座小县；零陵只是小城，人口六万反过三江城。
    expect(siteOf('sancheng').type).toBe('city')
    expect(siteOf('sancheng').population).toBe(30000)
    expect(siteOf('lingling').type).toBe('town')
    expect(siteOf('lingling').population).toBe(60000)
  })

  it('刘备开局据公安与江夏，且公安有可进军的相邻点', () => {
    expect(sitesOwnedBy('liubei')).toEqual(['gongan', 'jiangxia'])
    expect(siteOf('gongan').neighbors.length).toBeGreaterThan(0)
  })

  it('曹操占地最多，孙权次之，全图再无无主之地', () => {
    const caocao = sitesOwnedBy('caocao')
    const sunquan = sitesOwnedBy('sunquan')
    const unowned = GEOGRAPHY_SANGUO.sites.filter((site) => site.owner === null)

    expect(caocao.length).toBe(22)
    expect(sunquan.length).toBe(8)
    expect(sitesOwnedBy('liubei')).toHaveLength(2)
    // 陈仓归马腾后，马腾据槐里、陈仓、街亭、天水、西平关与金城六点。
    expect(sitesOwnedBy('mateng')).toHaveLength(6)
    // 城池、关隘与野地皆有所属。
    expect(unowned).toHaveLength(0)
    expect(caocao.length).toBeGreaterThan(sunquan.length)
  })

  it('州归属与占点多寡一致', () => {
    const geography = cloneGeography(GEOGRAPHY_SANGUO)
    const authors = geography.provinces.map((province) => province.owner)

    resolveProvinceOwners(geography)

    expect(geography.provinces.map((province) => province.owner)).toEqual(authors)
  })

  it('建安十三年：曹操据司隶与中原四州，孙权据扬州，益、凉、交各归新主', () => {
    const ownerOf = (provinceId: string) =>
      GEOGRAPHY_SANGUO.provinces.find((province) => province.id === provinceId)?.owner

    for (const provinceId of ['sili', 'yu', 'yan', 'xu', 'ji', 'jing']) {
      expect(ownerOf(provinceId)).toBe('caocao')
    }
    expect(ownerOf('you')).toBe('gongsunkang')
    expect(ownerOf('yang')).toBe('sunquan')
    expect(ownerOf('yi')).toBe('liuzhang')
    // 凉州马腾与张鲁各据三点，并列时保留原归属者张鲁。
    expect(ownerOf('liang')).toBe('zhanglu')
    expect(ownerOf('jiao')).toBe('shixie')
    // 青、并二州尚未设点，无归属。
    expect(ownerOf('qing')).toBeNull()
    expect(ownerOf('bing')).toBeNull()
  })

  it('从公安出发可以走遍全图，野地也在行军图中', () => {
    const sitesById = new Map(GEOGRAPHY_SANGUO.sites.map((site) => [site.id, site]))
    const visited = new Set<SiteId>(['gongan'])
    const queue: SiteId[] = ['gongan']

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
    for (const [a, b] of FORCED_EDGES) {
      expect(siteOf(a).neighbors).toContain(b)
      expect(siteOf(b).neighbors).toContain(a)
    }

    // 判据本身未被放宽：南郑与阳平关之间，定军山依旧落在直径圆内。
    expect(insideDiameterCircle('dingjunshan', 'nanzheng', 'yangpingguan')).toBe(true)
    // 反向对照：同一判据下，长安与潼关之间确无第三点阻挡。
    expect(insideDiameterCircle('luoyang', 'changan', 'tongguan')).toBe(false)
  })

  it('史实不相邻的点对已从邻接表中排除', () => {
    // 关中与汉中、夷陵与荆南、泸水与江州，几何上可直连，史实无通道。
    for (const [a, b] of [
      ['changan', 'baidicheng'],
      ['dingjunshan', 'yangpingguan'],
      ['yiling', 'wuling'],
      ['lushui', 'jiangzhou'],
      ['tongguan', 'xiangyang'],
    ] as const) {
      expect(siteOf(a).neighbors).not.toContain(b)
      expect(siteOf(b).neighbors).not.toContain(a)
    }
  })

  it('相邻列表按距离升序排列', () => {
    for (const site of GEOGRAPHY_SANGUO.sites) {
      const distances = site.neighbors.map((neighborId) => projectedDistance(site.id, neighborId))

      expect(distances).toEqual([...distances].sort((a, b) => a - b))
    }
  })

  it('邻接远少于完全图，绝非两两相连', () => {
    const siteCount = GEOGRAPHY_SANGUO.sites.length
    const edgeCount =
      GEOGRAPHY_SANGUO.sites.reduce((sum, site) => sum + site.neighbors.length, 0) / 2
    const completeGraphEdgeCount = (siteCount * (siteCount - 1)) / 2

    expect(completeGraphEdgeCount).toBe(2145)
    expect(edgeCount).toBeLessThan(siteCount * 4)
  })
})
