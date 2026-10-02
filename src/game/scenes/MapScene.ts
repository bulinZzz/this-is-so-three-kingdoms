import Phaser from 'phaser'
import type { GameState } from '../../core/model'
import {
  landShapes,
  provinceShapes,
  SITE_LABEL_OFFSET,
  siteRegion,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from '../mapLayout'
import {
  clampScroll,
  clampZoom,
  fitZoom,
  scrollForCenter,
  zoomLimits,
  type Scroll,
  type ZoomLimits,
} from '../viewport'

/** 地图所需的状态来源，由装配层提供，地图只读不写。 */
export interface MapStateSource {
  getState(): GameState
  subscribe(listener: (state: GameState) => void): void
}

/** 开局视野中心，落在中原与荆襄。 */
const INITIAL_CENTER_LON = 112.5
const INITIAL_CENTER_LAT = 33
/**
 * 开局缩放相对「整幅可见」的倍数。
 * 1.65 相当于从 2.5 往回收三格滚轮（1.15 的三次方约 1.52）。
 */
const INITIAL_ZOOM_FACTOR = 1.65
/** 滚轮每格的缩放倍率。 */
const WHEEL_ZOOM_STEP = 1.15

const UNOWNED_COLOR = 0x95886e
const SITE_STROKE_COLOR = 0xf2e4c2
/** 州陆填充：暖色，与冷色海面在色相和明度上都拉开，海岸线才立得住。 */
const PROVINCE_FILL_COLOR = 0x5a4930
/**
 * 塞外陆地底衬：介于冷色海面与暖色州陆之间的中性橄榄。
 * 海是深青冷的，州陆是暖棕的，此处取中性偏暖的灰橄榄，明度居中，
 * 既不与海混淆，也不与州陆抢眼。
 */
const LAND_FILL_COLOR = 0x33322a
const PROVINCE_STROKE_COLOR = 0x8f7550
const SITE_LABEL_COLOR = '#f2e4c2'
const PROVINCE_LABEL_COLOR = '#a8906a'
const LABEL_FONT = '"Noto Serif SC", "Songti SC", "SimSun", serif'

function toColorNumber(hexColor: string): number {
  return Number.parseInt(hexColor.replace('#', ''), 16)
}

/** 天下地图：先铺州轮廓，再按归属为战略点着色并标注名称。 */
export class MapScene extends Phaser.Scene {
  private readonly drawn: Phaser.GameObjects.GameObject[] = []
  private limits: ZoomLimits | null = null
  private viewReady = false
  private dragging = false
  private readonly dragFrom = { x: 0, y: 0 }

  constructor(private readonly source: MapStateSource) {
    super('Map')
  }

  create(): void {
    this.render(this.source.getState())
    this.source.subscribe((state) => this.render(state))
    this.setupCamera()
  }

  /** 相机只做平移与缩放：拖动平移、滚轮缩放，边界固定为整幅地图。 */
  private setupCamera(): void {
    const camera = this.cameras.main
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.beginDrag(pointer))
    this.input.on('pointerup', () => this.endDrag())
    this.input.on('pointerupoutside', () => this.endDrag())
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.moveDrag(pointer))
    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _objects: unknown, _deltaX: number, deltaY: number) =>
        this.zoomAt(pointer, deltaY),
    )
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.handleResize())

    this.focusInitialView()
  }

  /** 开局把视野对到中原与荆襄，缩放为整幅可见的若干倍。 */
  private focusInitialView(): void {
    const camera = this.cameras.main
    const limits = this.limitsFor(camera.width, camera.height)
    if (!(limits.min > 0)) {
      return
    }
    this.limits = limits
    const zoom = clampZoom(limits.min * INITIAL_ZOOM_FACTOR, limits)
    camera.setZoom(zoom)
    this.applyScroll(scrollForCenter(INITIAL_CENTER_LON, INITIAL_CENTER_LAT, zoom, camera.width, camera.height))
    this.viewReady = true
  }

  /** 窗口尺寸变化后重算缩放上下限，并把当前缩放与滚动量重新夹取。 */
  private handleResize(): void {
    if (!this.viewReady) {
      this.focusInitialView()
      return
    }
    const camera = this.cameras.main
    const limits = this.limitsFor(camera.width, camera.height)
    if (!(limits.min > 0)) {
      return
    }
    this.limits = limits
    camera.setZoom(clampZoom(camera.zoom, limits))
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    this.applyScroll({ x: camera.scrollX, y: camera.scrollY })
  }

  private limitsFor(viewWidth: number, viewHeight: number): ZoomLimits {
    return zoomLimits(fitZoom(viewWidth, viewHeight, WORLD_WIDTH, WORLD_HEIGHT))
  }

  /** 写入滚动量并夹在地图边界内。 */
  private applyScroll(scroll: Scroll): void {
    const camera = this.cameras.main
    camera.scrollX = clampScroll(scroll.x, camera.width, WORLD_WIDTH, camera.zoom)
    camera.scrollY = clampScroll(scroll.y, camera.height, WORLD_HEIGHT, camera.zoom)
  }

  private beginDrag(pointer: Phaser.Input.Pointer): void {
    this.dragging = true
    this.dragFrom.x = pointer.x
    this.dragFrom.y = pointer.y
  }

  private endDrag(): void {
    if (!this.dragging) {
      return
    }
    this.dragging = false
  }

  /** 屏幕位移除以缩放得到世界位移，反向施加到滚动量上。 */
  private moveDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) {
      return
    }
    const camera = this.cameras.main
    const dx = (pointer.x - this.dragFrom.x) / camera.zoom
    const dy = (pointer.y - this.dragFrom.y) / camera.zoom
    this.dragFrom.x = pointer.x
    this.dragFrom.y = pointer.y
    this.applyScroll({ x: camera.scrollX - dx, y: camera.scrollY - dy })
  }

  /** 以指针下的世界点为锚点缩放，并夹在缩放范围内。 */
  private zoomAt(pointer: Phaser.Input.Pointer, deltaY: number): void {
    const limits = this.limits
    if (limits === null) {
      return
    }
    const camera = this.cameras.main
    const step = deltaY > 0 ? 1 / WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP
    const zoom = clampZoom(camera.zoom * step, limits)
    if (zoom === camera.zoom) {
      return
    }
    const anchor = camera.getWorldPoint(pointer.x, pointer.y)
    camera.setZoom(zoom)
    this.applyScroll({
      x: anchor.x - (pointer.x - camera.width / 2) / zoom - camera.width / 2,
      y: anchor.y - (pointer.y - camera.height / 2) / zoom - camera.height / 2,
    })
  }

  private render(state: GameState): void {
    for (const object of this.drawn.splice(0)) {
      object.destroy()
    }

    this.drawLand()
    this.drawProvinces()

    const colorOf = new Map(
      state.factions.map((faction) => [faction.id, toColorNumber(faction.color)]),
    )

    const graphics = this.add.graphics()
    this.drawn.push(graphics)

    for (const site of state.geography.sites) {
      const region = siteRegion(site.id)
      if (region === null) {
        continue
      }

      const ownerColor = site.owner === null ? undefined : colorOf.get(site.owner)

      graphics.fillStyle(ownerColor ?? UNOWNED_COLOR, 1)
      graphics.fillCircle(region.x, region.y, region.radius)
      graphics.lineStyle(1.5, SITE_STROKE_COLOR, 0.45)
      graphics.strokeCircle(region.x, region.y, region.radius)

      const label = this.add
        .text(region.x, region.y + region.radius + SITE_LABEL_OFFSET, site.name, {
          fontFamily: LABEL_FONT,
          fontSize: '13px',
          color: SITE_LABEL_COLOR,
        })
        .setOrigin(0.5, 0)
      this.drawn.push(label)
    }
  }

  /** 塞外陆地底衬，先于州轮廓绘制，只填充不描边。 */
  private drawLand(): void {
    const graphics = this.add.graphics()
    this.drawn.push(graphics)
    graphics.fillStyle(LAND_FILL_COLOR, 1)

    for (const ring of landShapes()) {
      const points = ring.map((point) => new Phaser.Math.Vector2(point.x, point.y))
      graphics.fillPoints(points, true)
    }
  }

  private drawProvinces(): void {
    const shapes = provinceShapes()
    const graphics = this.add.graphics()
    this.drawn.push(graphics)

    for (const shape of shapes) {
      const points = shape.points.map((point) => new Phaser.Math.Vector2(point.x, point.y))
      graphics.fillStyle(PROVINCE_FILL_COLOR, 1)
      graphics.fillPoints(points, true)
    }

    for (const shape of shapes) {
      const points = shape.points.map((point) => new Phaser.Math.Vector2(point.x, point.y))
      graphics.lineStyle(1, PROVINCE_STROKE_COLOR, 0.9)
      graphics.strokePoints(points, true)
    }

    for (const shape of shapes) {
      const label = this.add
        .text(shape.label.x, shape.label.y, shape.name, {
          fontFamily: LABEL_FONT,
          fontSize: '18px',
          color: PROVINCE_LABEL_COLOR,
        })
        .setOrigin(0.5)
      this.drawn.push(label)
    }
  }
}
