import type { ProvinceId, SiteId } from '../core/model'
import mapBounds from './mapBounds.json'
import {
  LAND_OUTLINES,
  MAP_VERTICES,
  PROVINCE_OUTLINES,
  RIVER_LINES,
  SITE_COORDINATES,
  SITE_DISPLAY_OFFSETS,
  type LonLat,
} from './mapData'

/** 地图上的一个点。 */
export interface MapPoint {
  x: number
  y: number
}

/** 战略点在屏幕上的区域。 */
export interface SiteRegion extends MapPoint {
  radius: number
}

/** 州的轮廓与州名位置。轮廓可能有多块（离岸沙洲自成一块）。 */
export interface ProvinceShape {
  id: ProvinceId
  name: string
  polygons: MapPoint[][]
  /** 与每条边一一对应：该边是否为与邻州相接的州界（海岸/无主地一侧为 false，不描边）。 */
  borderEdges: readonly (readonly boolean[])[]
  label: MapPoint
}

export const SITE_RADIUS = 13

/** 名称标注在圆下方的间距。 */
export const SITE_LABEL_OFFSET = 4

/** 无归属战略点的颜色，地图与侧栏图例共用这一处定义。 */
export const UNOWNED_SITE_COLOR = '#95886e'

/** 海面颜色，画布底色与河流共用这一处定义；河口因此与海面连成一片。 */
export const SEA_COLOR = '#172832'

/** 相邻战略点之间允许的最小距离。 */
export const MIN_SITE_DISTANCE = 2 * SITE_RADIUS

/**
 * 制图经纬度范围，唯一来源为 mapBounds.json，构建工具亦读取同一文件。
 * 纬度取郡级矢量数据自身范围，经度向东西两侧对称外扩，使画幅接近常用视口比例，
 * 并将西域、青藏、朝鲜半岛与日本列岛等塞外地形纳入底衬。
 */
const BOUNDS = mapBounds

/** 取中纬度做经度压缩，避免东西向被拉长。 */
const REFERENCE_LATITUDE = 33
const KM_PER_LATITUDE_DEGREE = 110.57
const KM_PER_LONGITUDE_DEGREE = 111.32 * Math.cos((REFERENCE_LATITUDE * Math.PI) / 180)
const PIXELS_PER_KILOMETER = 0.5
const PADDING = 32

/** 把经纬度投影到世界坐标。 */
export function projectLonLat([lon, lat]: LonLat): MapPoint {
  return {
    x: PADDING + (lon - BOUNDS.minLon) * KM_PER_LONGITUDE_DEGREE * PIXELS_PER_KILOMETER,
    y: PADDING + (BOUNDS.maxLat - lat) * KM_PER_LATITUDE_DEGREE * PIXELS_PER_KILOMETER,
  }
}

const CONTENT_WIDTH =
  (BOUNDS.maxLon - BOUNDS.minLon) * KM_PER_LONGITUDE_DEGREE * PIXELS_PER_KILOMETER
const CONTENT_HEIGHT =
  (BOUNDS.maxLat - BOUNDS.minLat) * KM_PER_LATITUDE_DEGREE * PIXELS_PER_KILOMETER

export const WORLD_WIDTH = Math.ceil(CONTENT_WIDTH + PADDING * 2)
export const WORLD_HEIGHT = Math.ceil(CONTENT_HEIGHT + PADDING * 2)

/** 查询战略点的屏幕区域；该点没有地理坐标时返回 null。 */
export function siteRegion(siteId: SiteId): SiteRegion | null {
  const coordinate = SITE_COORDINATES[siteId]
  if (coordinate === undefined) {
    return null
  }

  const point = projectLonLat(coordinate)
  const offset = SITE_DISPLAY_OFFSETS[siteId]

  return {
    x: point.x + (offset?.dx ?? 0),
    y: point.y + (offset?.dy ?? 0),
    radius: SITE_RADIUS,
  }
}

/** 已有地理坐标的全部战略点。 */
export function siteIdsWithLayout(): SiteId[] {
  return Object.keys(SITE_COORDINATES)
}

/**
 * 州的轮廓与州名位置，已投影到世界坐标。
 * 相邻州引用同一批顶点，边界完全重合；一块轮廓是一个闭合环。
 */
export function provinceShapes(): ProvinceShape[] {
  const shared = new Map<string, number>()
  for (const outline of PROVINCE_OUTLINES) {
    for (const ring of outline.rings) {
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        const key = a < b ? `${a}|${b}` : `${b}|${a}`
        shared.set(key, (shared.get(key) ?? 0) + 1)
      }
    }
  }
  return PROVINCE_OUTLINES.map((outline) => ({
    id: outline.id,
    name: outline.name,
    polygons: outline.rings.map((ring) => ring.map((vertexId) => projectLonLat(MAP_VERTICES[vertexId]))),
    borderEdges: outline.rings.map((ring) =>
      ring.map((vertex, i) => {
        const next = ring[(i + 1) % ring.length]
        const key = vertex < next ? `${vertex}|${next}` : `${next}|${vertex}`
        return (shared.get(key) ?? 0) > 1
      }),
    ),
    label: projectLonLat(outline.labelAt),
  }))
}

/**
 * 塞外陆地的轮廓，已投影到世界坐标。
 * 这些陆地区域不属于十三州，单独作为底衬绘制。
 */
export function landShapes(): MapPoint[][] {
  return LAND_OUTLINES.map((ring) => ring.map((point) => projectLonLat(point)))
}

/**
 * 长江与黄河的中心线，已投影到世界坐标。
 * 每条为一条开放折线，河流被拆成多个要素时各段独立保留。
 */
export function riverShapes(): MapPoint[][] {
  return RIVER_LINES.map((line) => line.map((point) => projectLonLat(point)))
}
