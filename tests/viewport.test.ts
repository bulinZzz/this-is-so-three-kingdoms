import { describe, expect, it } from 'vitest'
import { projectLonLat } from '../src/game/mapLayout'
import {
  clampScroll,
  clampZoom,
  coverZoom,
  fitZoom,
  scrollForCenter,
  zoomLimits,
} from '../src/game/viewport'

const WORLD_WIDTH = 1800
const WORLD_HEIGHT = 1200

/** 可见世界区域在某一轴上的左上角坐标。 */
function viewLeft(scroll: number, viewSize: number, zoom: number): number {
  return scroll + viewSize / 2 - viewSize / (2 * zoom)
}

describe('视口相机运算', () => {
  it('整幅地图纳入视口时按受限的一边取缩放', () => {
    expect(fitZoom(2000, 900, WORLD_WIDTH, WORLD_HEIGHT)).toBeCloseTo(900 / WORLD_HEIGHT)
    expect(fitZoom(900, 2000, WORLD_WIDTH, WORLD_HEIGHT)).toBeCloseTo(900 / WORLD_WIDTH)
  })

  it('铺满视口时按受限的一边取缩放', () => {
    expect(coverZoom(2000, 900, WORLD_WIDTH, WORLD_HEIGHT)).toBeCloseTo(2000 / WORLD_WIDTH)
    expect(coverZoom(900, 2000, WORLD_WIDTH, WORLD_HEIGHT)).toBeCloseTo(2000 / WORLD_HEIGHT)
  })

  it('缩放范围下限为铺满视口，上限为其五倍', () => {
    const cover = coverZoom(2000, 900, WORLD_WIDTH, WORLD_HEIGHT)
    const limits = zoomLimits(cover)
    expect(limits.min).toBeCloseTo(cover)
    expect(limits.max).toBeCloseTo(cover * 5)
  })

  it('缩放被夹在范围两端，范围之内保持原值', () => {
    const limits = zoomLimits(0.5)
    expect(clampZoom(0.1, limits)).toBeCloseTo(0.5)
    expect(clampZoom(9, limits)).toBeCloseTo(2.5)
    expect(clampZoom(1.25, limits)).toBeCloseTo(1.25)
  })

  it('居中把目标放到视口正中', () => {
    const zoom = 2
    const viewWidth = 900
    const viewHeight = 600
    const target = projectLonLat([112.5, 33])
    const scroll = scrollForCenter(112.5, 33, zoom, viewWidth, viewHeight)
    const centerX = viewLeft(scroll.x, viewWidth, zoom) + viewWidth / (2 * zoom)
    const centerY = viewLeft(scroll.y, viewHeight, zoom) + viewHeight / (2 * zoom)
    expect(centerX).toBeCloseTo(target.x)
    expect(centerY).toBeCloseTo(target.y)
  })

  it('滚动量在地图四角被夹住，可见区域不越界', () => {
    const zoom = 2
    const viewWidth = 800
    const viewHeight = 600
    const visibleWidth = viewWidth / zoom
    const visibleHeight = viewHeight / zoom
    const minX = (visibleWidth - viewWidth) / 2
    const maxX = WORLD_WIDTH - viewWidth / 2 - visibleWidth / 2
    const minY = (visibleHeight - viewHeight) / 2
    const maxY = WORLD_HEIGHT - viewHeight / 2 - visibleHeight / 2

    expect(clampScroll(-1e6, viewWidth, WORLD_WIDTH, zoom)).toBeCloseTo(minX)
    expect(clampScroll(1e6, viewWidth, WORLD_WIDTH, zoom)).toBeCloseTo(maxX)
    expect(clampScroll(-1e6, viewHeight, WORLD_HEIGHT, zoom)).toBeCloseTo(minY)
    expect(clampScroll(1e6, viewHeight, WORLD_HEIGHT, zoom)).toBeCloseTo(maxY)

    // 两个方向上可见区域的左上角与右下角都落在地图内。
    expect(viewLeft(minX, viewWidth, zoom)).toBeCloseTo(0)
    expect(viewLeft(maxX, viewWidth, zoom) + visibleWidth).toBeCloseTo(WORLD_WIDTH)
    expect(viewLeft(minY, viewHeight, zoom)).toBeCloseTo(0)
    expect(viewLeft(maxY, viewHeight, zoom) + visibleHeight).toBeCloseTo(WORLD_HEIGHT)
  })

  it('视口大于地图时滚动量被夹到边界，不再继续偏移', () => {
    const zoom = 1
    const viewWidth = 2000
    const min = (viewWidth / zoom - viewWidth) / 2
    expect(clampScroll(-999, viewWidth, 500, zoom)).toBeCloseTo(min)
    expect(clampScroll(999, viewWidth, 500, zoom)).toBeCloseTo(min)
  })

  it('缩放限制任意取值都落在范围之内', () => {
    const limits = zoomLimits(coverZoom(WORLD_WIDTH, WORLD_HEIGHT, WORLD_WIDTH, WORLD_HEIGHT))
    for (const zoom of [0, 0.4, 1, 99]) {
      const clamped = clampZoom(zoom, limits)
      expect(clamped).toBeGreaterThanOrEqual(limits.min)
      expect(clamped).toBeLessThanOrEqual(limits.max)
    }
  })

  it('最小缩放下地图在横竖两轴都铺满视口，可见区域不出现空边', () => {
    for (const [viewWidth, viewHeight] of [
      [1640, 1080],
      [2280, 1310],
      [787, 868],
    ]) {
      const limits = zoomLimits(coverZoom(viewWidth, viewHeight, WORLD_WIDTH, WORLD_HEIGHT))
      // 地图缩放后在两轴都不小于视口：视口内没有空边。
      expect(WORLD_WIDTH * limits.min).toBeGreaterThanOrEqual(viewWidth)
      expect(WORLD_HEIGHT * limits.min).toBeGreaterThanOrEqual(viewHeight)
      // 可见世界区域落在两轴的地图范围之内。
      expect(viewWidth / limits.min).toBeLessThanOrEqual(WORLD_WIDTH)
      expect(viewHeight / limits.min).toBeLessThanOrEqual(WORLD_HEIGHT)
    }
  })

  it('缩放范围上限恰为下限的五倍', () => {
    const limits = zoomLimits(coverZoom(787, 868, WORLD_WIDTH, WORLD_HEIGHT))
    expect(limits.max).toBeCloseTo(limits.min * 5)
  })

  it('开局缩放为整幅可见的 1.65 倍，且落在铺满范围之内', () => {
    const viewWidth = 2000
    const viewHeight = 900
    const fit = fitZoom(viewWidth, viewHeight, WORLD_WIDTH, WORLD_HEIGHT)
    const limits = zoomLimits(coverZoom(viewWidth, viewHeight, WORLD_WIDTH, WORLD_HEIGHT))
    const opening = clampZoom(fit * 1.65, limits)
    expect(opening).toBeCloseTo(fit * 1.65)
    expect(opening).toBeGreaterThanOrEqual(limits.min)
    expect(opening).toBeLessThanOrEqual(limits.max)
  })
})
