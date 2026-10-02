import type { ProvinceId, SiteId } from '../core/model'
import {
  LAND_OUTLINES,
  MAP_VERTICES,
  PROVINCE_OUTLINES,
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

/** 州的轮廓与州名位置。 */
export interface ProvinceShape {
  id: ProvinceId
  name: string
  points: MapPoint[]
  label: MapPoint
}

export const SITE_RADIUS = 13

/** 名称标注在圆下方的间距。 */
export const SITE_LABEL_OFFSET = 4

/** 无归属战略点的颜色，地图与侧栏图例共用这一处定义。 */
export const UNOWNED_SITE_COLOR = '#95886e'

/** 相邻战略点之间允许的最小距离。 */
export const MIN_SITE_DISTANCE = 2 * SITE_RADIUS

/** 制图经纬度范围，按郡级矢量数据自身范围加少量余量，完整覆盖十四州。 */
const BOUNDS = { minLon: 93.5, maxLon: 129.5, minLat: 16.3, maxLat: 43.1 }

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
 * 相邻州引用同一批顶点，边界完全重合。
 */
export function provinceShapes(): ProvinceShape[] {
  return PROVINCE_OUTLINES.map((outline) => ({
    id: outline.id,
    name: outline.name,
    points: outline.ring.map((vertexId) => projectLonLat(MAP_VERTICES[vertexId])),
    label: projectLonLat(outline.labelAt),
  }))
}

/**
 * 塞外陆地的轮廓，已投影到世界坐标。
 * 这些陆地区域不属于十四州，单独作为底衬绘制。
 */
export function landShapes(): MapPoint[][] {
  return LAND_OUTLINES.map((ring) => ring.map((point) => projectLonLat(point)))
}
