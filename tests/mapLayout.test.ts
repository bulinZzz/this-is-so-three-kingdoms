import { describe, expect, it } from 'vitest'
import { GEOGRAPHY_SANGUO } from '../src/core/geographySanguo'
import type { SiteId } from '../src/core/model'
import mapBounds from '../src/game/mapBounds.json'
import { MAP_VERTICES, PROVINCE_OUTLINES, RIVER_LINES } from '../src/game/mapData'
import {
  landShapes,
  MIN_SITE_DISTANCE,
  projectLonLat,
  provinceShapes,
  siteIdsWithLayout,
  siteRegion,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../src/game/mapLayout'

function regionOf(siteId: SiteId) {
  const region = siteRegion(siteId)
  if (region === null) {
    throw new Error(`缺少地理坐标：${siteId}`)
  }

  return region
}

/** 射线法判断点是否落在多边形内。 */
function isInside(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]
    const b = polygon[j]
    const crosses = a.y > point.y !== b.y > point.y
    const xAt = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x

    if (crosses && point.x < xAt) {
      inside = !inside
    }
  }

  return inside
}

/** 环上的无向边，端点按字母序排列，便于跨州比较。 */
function ringEdges(ring: readonly string[]): string[] {
  return ring.map((vertex, index) => {
    const next = ring[(index + 1) % ring.length]
    return vertex < next ? `${vertex}|${next}` : `${next}|${vertex}`
  })
}

/** 两个方向量的叉积符号。 */
function cross(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
}

/** c 是否落在线段 ab 的包围盒内（共线时判定是否在线段上）。 */
function onSegment(
  a: { x: number; y: number },
  b: { x: number; y: number },
  c: { x: number; y: number },
): boolean {
  const epsilon = 1e-9
  return (
    c.x >= Math.min(a.x, b.x) - epsilon &&
    c.x <= Math.max(a.x, b.x) + epsilon &&
    c.y >= Math.min(a.y, b.y) - epsilon &&
    c.y <= Math.max(a.y, b.y) + epsilon
  )
}

/** 两线段是否相交，含端点接触与共线重叠。 */
function segmentsIntersect(
  p: { x: number; y: number },
  q: { x: number; y: number },
  r: { x: number; y: number },
  s: { x: number; y: number },
): boolean {
  const d1 = cross(r, s, p)
  const d2 = cross(r, s, q)
  const d3 = cross(p, q, r)
  const d4 = cross(p, q, s)

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true
  }

  if (d1 === 0 && onSegment(r, s, p)) return true
  if (d2 === 0 && onSegment(r, s, q)) return true
  if (d3 === 0 && onSegment(p, q, r)) return true
  if (d4 === 0 && onSegment(p, q, s)) return true

  return false
}

/** 共同顶点在环上是否连成一段。 */
function isContiguous(ring: readonly string[], common: ReadonlySet<string>): boolean {
  const flags = ring.map((vertex) => common.has(vertex))
  const count = flags.filter(Boolean).length

  if (count === 0 || count === flags.length) {
    return true
  }

  let transitions = 0
  for (let index = 0; index < flags.length; index += 1) {
    if (flags[index] !== flags[(index + 1) % flags.length]) {
      transitions += 1
    }
  }

  return transitions === 2
}

describe('地图布局', () => {
  it('剧本中每个战略点都有地理坐标，且没有多余坐标', () => {
    const expected = GEOGRAPHY_SANGUO.sites.map((site) => site.id).sort()

    expect(siteIdsWithLayout().sort()).toEqual(expected)
  })

  it('每个战略点都落在所属州的轮廓内', () => {
    const shapes = new Map(provinceShapes().map((shape) => [shape.id, shape]))

    for (const site of GEOGRAPHY_SANGUO.sites) {
      const shape = shapes.get(site.provinceId)
      expect(shape, `缺少 ${site.provinceId} 的轮廓`).toBeDefined()
      const inside = (shape?.polygons ?? []).some((polygon) => isInside(regionOf(site.id), polygon))
      expect(inside, `${site.name} 不在 ${site.provinceId} 内`).toBe(true)
    }
  })

  it('相邻州共用同一批顶点，边界不重叠也不留缝', () => {
    const pairs: string[] = []

    for (let i = 0; i < PROVINCE_OUTLINES.length; i += 1) {
      for (let j = i + 1; j < PROVINCE_OUTLINES.length; j += 1) {
        const a = PROVINCE_OUTLINES[i]
        const b = PROVINCE_OUTLINES[j]
        const verticesA = new Set(a.rings.flat())
        const verticesB = new Set(b.rings.flat())
        const common = new Set([...verticesA].filter((vertex) => verticesB.has(vertex)))

        if (common.size < 2) {
          continue
        }

        pairs.push(`${a.name}—${b.name}`)

        for (const ring of a.rings) {
          if (!ring.some((vertex) => common.has(vertex))) continue
          expect(
            isContiguous(ring, common),
            `${a.name} 与 ${b.name} 的共同顶点在 ${a.name} 上不连续`,
          ).toBe(true)
        }
        for (const ring of b.rings) {
          if (!ring.some((vertex) => common.has(vertex))) continue
          expect(
            isContiguous(ring, common),
            `${b.name} 与 ${a.name} 的共同顶点在 ${b.name} 上不连续`,
          ).toBe(true)
        }

        const edgesA = a.rings
          .flatMap((ring) => ringEdges(ring))
          .filter((edge) => edge.split('|').every((vertex) => verticesB.has(vertex)))
        const edgesB = b.rings
          .flatMap((ring) => ringEdges(ring))
          .filter((edge) => edge.split('|').every((vertex) => verticesA.has(vertex)))

        expect(new Set(edgesA), `${a.name} 与 ${b.name} 的边界线不一致`).toEqual(new Set(edgesB))
      }
    }

    expect(pairs.length).toBeGreaterThanOrEqual(10)
  })

  it('顶点表中没有游离的顶点', () => {
    const used = new Set(PROVINCE_OUTLINES.flatMap((outline) => outline.rings.flat()))

    expect(Object.keys(MAP_VERTICES).filter((vertex) => !used.has(vertex))).toEqual([])
  })

  it('州的轮廓与州名落在画布内，州名落在自己的轮廓内', () => {
    const shapes = provinceShapes()

    expect(shapes).toHaveLength(13)
    expect(new Set(shapes.map((shape) => shape.name)).size).toBe(13)

    for (const shape of shapes) {
      for (const polygon of shape.polygons) {
        for (const point of polygon) {
          expect(point.x).toBeGreaterThanOrEqual(0)
          expect(point.x).toBeLessThanOrEqual(WORLD_WIDTH)
          expect(point.y).toBeGreaterThanOrEqual(0)
          expect(point.y).toBeLessThanOrEqual(WORLD_HEIGHT)
        }
      }

      const labelInside = shape.polygons.some((polygon) => isInside(shape.label, polygon))
      expect(labelInside, `${shape.name} 的州名不在轮廓内`).toBe(true)
    }
  })

  it('每个州的每块轮廓都是简单多边形，不相邻的边互不相交', () => {
    for (const shape of provinceShapes()) {
      for (const points of shape.polygons) {
        const count = points.length

        for (let i = 0; i < count; i += 1) {
          for (let j = i + 1; j < count; j += 1) {
            if (j === i + 1) continue
            if (i === 0 && j === count - 1) continue

            const crosses = segmentsIntersect(
              points[i],
              points[(i + 1) % count],
              points[j],
              points[(j + 1) % count],
            )

            expect(crosses, `${shape.name} 的边 ${i} 与 ${j} 相交`).toBe(false)
          }
        }
      }
    }
  }, 60000)

  it('任意两个战略点的距离不小于布局下限', () => {
    const sites = GEOGRAPHY_SANGUO.sites

    for (let i = 0; i < sites.length; i += 1) {
      for (let j = i + 1; j < sites.length; j += 1) {
        const a = regionOf(sites[i].id)
        const b = regionOf(sites[j].id)
        const distance = Math.hypot(a.x - b.x, a.y - b.y)

        expect(
          distance,
          `${sites[i].name} 与 ${sites[j].name} 距离过近`,
        ).toBeGreaterThanOrEqual(MIN_SITE_DISTANCE)
      }
    }
  })

  it('未录入坐标的战略点没有位置', () => {
    expect(siteRegion('unknown')).toBeNull()
  })
})

/** 一条折线上距目标经纬度最近的点距（度）。 */
function nearestDegree(
  line: readonly (readonly [number, number])[],
  target: readonly [number, number],
): number {
  let best = Number.POSITIVE_INFINITY
  for (const [lon, lat] of line) {
    best = Math.min(best, Math.hypot(lon - target[0], lat - target[1]))
  }
  return best
}

/** 全部河流折线上距目标经纬度最近的点距（度）。 */
function nearestAcrossRivers(target: readonly [number, number]): number {
  let best = Number.POSITIVE_INFINITY
  for (const line of RIVER_LINES) {
    best = Math.min(best, nearestDegree(line, target))
  }
  return best
}

/** 一条折线上相邻顶点的地球表面距离之和（公里）。 */
function lineLengthKm(line: readonly (readonly [number, number])[]): number {
  const radius = 6371
  const toRad = (degree: number) => (degree * Math.PI) / 180
  let total = 0
  for (let i = 0; i + 1 < line.length; i += 1) {
    const [lon1, lat1] = line[i]
    const [lon2, lat2] = line[i + 1]
    const dLat = toRad(lat2 - lat1)
    const dLon = toRad(lon2 - lon1)
    const h =
      Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2
    total += 2 * radius * Math.asin(Math.sqrt(h))
  }
  return total
}

/** 全部河流折线的总长度（公里）。 */
function riversLengthKm(): number {
  return RIVER_LINES.reduce((sum, line) => sum + lineLengthKm(line), 0)
}

describe('河流', () => {
  const WUHAN = [114.3, 30.6] as const
  const NANJING = [118.8, 32.1] as const
  const LANZHOU = [103.8, 36.06] as const
  const ZHENGZHOU = [113.6, 34.8] as const
  // 长江上源金沙江段的两个锚点：石鼓/丽江与宜宾，此前按 name 精确匹配时整段缺失。
  const SHIGU = [100.2, 26.9] as const
  const YIBIN = [104.6, 28.77] as const
  const YANGTZE_ANCHORS = [WUHAN, NANJING] as const
  const YELLOW_ANCHORS = [LANZHOU, ZHENGZHOU] as const

  it('图上恰有长江与黄河两条河流，每段折线至少两个点', () => {
    expect(RIVER_LINES.length).toBeGreaterThan(0)

    // 每条折线归入最近锚点城市所在的河流；恰好归入两种，即图上只有这两条河流。
    const rivers = new Set(
      RIVER_LINES.map((line) => {
        const yangtze = Math.min(...YANGTZE_ANCHORS.map((anchor) => nearestDegree(line, anchor)))
        const yellow = Math.min(...YELLOW_ANCHORS.map((anchor) => nearestDegree(line, anchor)))
        return yangtze <= yellow ? 'yangtze' : 'yellow'
      }),
    )
    expect([...rivers].sort()).toEqual(['yangtze', 'yellow'])

    for (const line of RIVER_LINES) {
      expect(line.length).toBeGreaterThanOrEqual(2)
    }
  })

  it('折线与顶点规模覆盖长江与黄河全段', () => {
    // 长江上源按 name 匹配时会整体漏掉，折线仅 6 条；覆盖 Jinsha、Tongtian、Tuotuo 后应达到 13 条以上。
    const vertices = RIVER_LINES.reduce((sum, line) => sum + line.length, 0)
    expect(RIVER_LINES.length).toBeGreaterThanOrEqual(13)
    expect(vertices).toBeGreaterThanOrEqual(400)
    // 长江约 4650 km 加黄河约 4250 km，合计应超过 8800 km；漏掉上源时合计不足 6400 km。
    expect(riversLengthKm()).toBeGreaterThan(8800)
  })

  it('河流的每个点都落在图幅经纬范围内', () => {
    for (const line of RIVER_LINES) {
      for (const [lon, lat] of line) {
        expect(lon).toBeGreaterThanOrEqual(mapBounds.minLon)
        expect(lon).toBeLessThanOrEqual(mapBounds.maxLon)
        expect(lat).toBeGreaterThanOrEqual(mapBounds.minLat)
        expect(lat).toBeLessThanOrEqual(mapBounds.maxLat)
      }
    }
  })

  it('长江与黄河分别经过各自的名城附近', () => {
    const tolerance = 0.5

    expect(nearestAcrossRivers(WUHAN), '长江距武汉').toBeLessThan(tolerance)
    expect(nearestAcrossRivers(NANJING), '长江距南京').toBeLessThan(tolerance)
    expect(nearestAcrossRivers(LANZHOU), '黄河距兰州').toBeLessThan(tolerance)
    expect(nearestAcrossRivers(ZHENGZHOU), '黄河距郑州').toBeLessThan(tolerance)
  })

  it('长江上源金沙江段经过石鼓/丽江与宜宾', () => {
    const tolerance = 0.3

    expect(nearestAcrossRivers(SHIGU), '长江距石鼓/丽江').toBeLessThan(tolerance)
    expect(nearestAcrossRivers(YIBIN), '长江距宜宾').toBeLessThan(tolerance)
  })

  it('长江下游终点落在海面附近（约 10 公里以内）', () => {
    const referenceLatitude = 33
    const kmPerLatitudeDegree = 110.57
    const kmPerLongitudeDegree = 111.32 * Math.cos((referenceLatitude * Math.PI) / 180)
    const provinces = provinceShapes().map((shape) => shape.polygons)
    const lands = landShapes()
    const isLand = (lon: number, lat: number): boolean => {
      const point = projectLonLat([lon, lat])
      return (
        provinces.some((polygons) => polygons.some((polygon) => isInside(point, polygon))) ||
        lands.some((ring) => isInside(point, ring))
      )
    }

    // 下游终点取自数据：归入长江的折线中，经度最大的一条的下游端。
    let endpoint: readonly [number, number] | null = null
    let endpointLon = Number.NEGATIVE_INFINITY
    for (const line of RIVER_LINES) {
      const yangtze = Math.min(...YANGTZE_ANCHORS.map((anchor) => nearestDegree(line, anchor)))
      const yellow = Math.min(...YELLOW_ANCHORS.map((anchor) => nearestDegree(line, anchor)))
      if (yangtze > yellow) continue
      const first = line[0]
      const last = line[line.length - 1]
      const downstream = first[0] > last[0] ? first : last
      if (downstream[0] > endpointLon) {
        endpointLon = downstream[0]
        endpoint = downstream
      }
    }
    expect(endpoint, '缺少长江下游折线').not.toBeNull()

    const [lon, lat] = endpoint as readonly [number, number]
    let distanceKm = Number.POSITIVE_INFINITY
    if (!isLand(lon, lat)) {
      distanceKm = 0
    } else {
      for (let degree = 0; degree < 360; degree += 1) {
        const radians = (degree * Math.PI) / 180
        const stepLon = Math.cos(radians) / kmPerLongitudeDegree
        const stepLat = Math.sin(radians) / kmPerLatitudeDegree
        for (let km = 0.25; km <= 30; km += 0.25) {
          if (!isLand(lon + stepLon * km, lat + stepLat * km)) {
            distanceKm = Math.min(distanceKm, km)
            break
          }
        }
      }
    }

    expect(distanceKm).toBeLessThanOrEqual(10)
  })
})
