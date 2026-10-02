import { describe, expect, it } from 'vitest'
import { GEOGRAPHY_SANGUO } from '../src/core/geographySanguo'
import type { SiteId } from '../src/core/model'
import { MAP_VERTICES, PROVINCE_OUTLINES } from '../src/game/mapData'
import {
  MIN_SITE_DISTANCE,
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
      expect(
        isInside(regionOf(site.id), shape?.points ?? []),
        `${site.name} 不在 ${site.provinceId} 内`,
      ).toBe(true)
    }
  })

  it('相邻州共用同一批顶点，边界不重叠也不留缝', () => {
    const pairs: string[] = []

    for (let i = 0; i < PROVINCE_OUTLINES.length; i += 1) {
      for (let j = i + 1; j < PROVINCE_OUTLINES.length; j += 1) {
        const a = PROVINCE_OUTLINES[i]
        const b = PROVINCE_OUTLINES[j]
        const verticesA = new Set(a.ring)
        const verticesB = new Set(b.ring)
        const common = new Set([...verticesA].filter((vertex) => verticesB.has(vertex)))

        if (common.size < 2) {
          continue
        }

        pairs.push(`${a.name}—${b.name}`)

        expect(
          isContiguous(a.ring, common),
          `${a.name} 与 ${b.name} 的共同顶点在 ${a.name} 上不连续`,
        ).toBe(true)
        expect(
          isContiguous(b.ring, common),
          `${a.name} 与 ${b.name} 的共同顶点在 ${b.name} 上不连续`,
        ).toBe(true)

        const edgesA = ringEdges(a.ring).filter((edge) =>
          edge.split('|').every((vertex) => verticesB.has(vertex)),
        )
        const edgesB = ringEdges(b.ring).filter((edge) =>
          edge.split('|').every((vertex) => verticesA.has(vertex)),
        )

        expect(
          new Set(edgesA),
          `${a.name} 与 ${b.name} 的边界线不一致`,
        ).toEqual(new Set(edgesB))
      }
    }

    expect(pairs.length).toBeGreaterThanOrEqual(10)
  })

  it('顶点表中没有游离的顶点', () => {
    const used = new Set(PROVINCE_OUTLINES.flatMap((outline) => [...outline.ring]))

    expect(Object.keys(MAP_VERTICES).filter((vertex) => !used.has(vertex))).toEqual([])
  })

  it('州的轮廓与州名落在画布内，州名落在自己的轮廓内', () => {
    const shapes = provinceShapes()

    expect(shapes).toHaveLength(14)
    expect(new Set(shapes.map((shape) => shape.name)).size).toBe(14)

    for (const shape of shapes) {
      for (const point of shape.points) {
        expect(point.x).toBeGreaterThanOrEqual(0)
        expect(point.x).toBeLessThanOrEqual(WORLD_WIDTH)
        expect(point.y).toBeGreaterThanOrEqual(0)
        expect(point.y).toBeLessThanOrEqual(WORLD_HEIGHT)
      }

      expect(isInside(shape.label, shape.points), `${shape.name} 的州名不在轮廓内`).toBe(true)
    }
  })

  it('每个州的轮廓都是简单多边形，不相邻的边互不相交', () => {
    for (const shape of provinceShapes()) {
      const points = shape.points
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
