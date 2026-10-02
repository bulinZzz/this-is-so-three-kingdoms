import { projectLonLat } from './mapLayout'

/** 相机缩放范围，下限为地图铺满视口。 */
export interface ZoomLimits {
  readonly min: number
  readonly max: number
}

/** 相机滚动量，单位为屏幕像素。 */
export interface Scroll {
  readonly x: number
  readonly y: number
}

/**
 * 整幅地图恰好纳入视口时的缩放。
 * 取宽高两个方向所需缩放的较小者，较长的一边因此留白。
 */
export function fitZoom(
  viewWidth: number,
  viewHeight: number,
  worldWidth: number,
  worldHeight: number,
): number {
  return Math.min(viewWidth / worldWidth, viewHeight / worldHeight)
}

/**
 * 地图恰好铺满视口时的缩放，两轴都不留空边。
 * 取宽高两个方向所需缩放的较大者，较短的一边被裁切，靠平移看到其余部分。
 */
export function coverZoom(
  viewWidth: number,
  viewHeight: number,
  worldWidth: number,
  worldHeight: number,
): number {
  return Math.max(viewWidth / worldWidth, viewHeight / worldHeight)
}

/** 缩放范围：下限为铺满视口，上限为其五倍。 */
export function zoomLimits(cover: number): ZoomLimits {
  return { min: cover, max: cover * 5 }
}

/** 把缩放限制在给定范围内。 */
export function clampZoom(zoom: number, limits: ZoomLimits): number {
  const min = Math.min(limits.min, limits.max)
  const max = Math.max(limits.min, limits.max)
  return Math.min(max, Math.max(min, zoom))
}

/**
 * 令给定经纬度落在视口正中时的相机滚动量。
 * Phaser 相机以视口中心为缩放锚点、滚动量以屏幕像素计，
 * 可见世界区域围绕视口中心对称，故缩放项在推导中相消。
 */
export function scrollForCenter(
  lon: number,
  lat: number,
  zoom: number,
  viewWidth: number,
  viewHeight: number,
): Scroll {
  const world = projectLonLat([lon, lat])
  const visibleWidth = viewWidth / zoom
  const visibleHeight = viewHeight / zoom
  const viewLeft = world.x - visibleWidth / 2
  const viewTop = world.y - visibleHeight / 2
  return {
    x: viewLeft - (viewWidth - visibleWidth) / 2,
    y: viewTop - (viewHeight - visibleHeight) / 2,
  }
}

/**
 * 把相机滚动量限制在地图内，与 Phaser 相机边界的夹取一致。
 * 可见世界区域为视口尺寸除以缩放，滚动量以屏幕像素计。
 */
export function clampScroll(
  scroll: number,
  viewSize: number,
  worldSize: number,
  zoom: number,
): number {
  const visible = viewSize / zoom
  const min = (visible - viewSize) / 2
  const max = worldSize - viewSize / 2 - visible / 2
  if (max <= min) return min
  return Math.min(max, Math.max(min, scroll))
}
