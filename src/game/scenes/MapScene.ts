import Phaser from 'phaser'
import type { SettingsSource } from '../../app/settingsStore'
import type { GameState, SiteId, SiteType } from '../../core/model'
import { SITE_COORDINATES } from '../mapData'
import {
  landShapes,
  provinceShapes,
  riverShapes,
  SITE_LABEL_OFFSET,
  siteRegion,
  UNOWNED_SITE_COLOR,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type SiteRegion,
} from '../mapLayout'
import {
  clampScroll,
  clampZoom,
  coverZoom,
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

/** 开局视野对准玩家所在的战略点，坐标直接取自战略点数据，不另存一份。 */
const FOCUS_SITE: SiteId = 'jiangxia'
/**
 * 开局缩放相对「整幅可见」的倍数。
 * 开局视野以整幅可见为基准，再夹进铺满视口的缩放范围。
 * 1.65 相当于从 2.5 往回收三格滚轮（1.15 的三次方约 1.52）。
 */
const INITIAL_ZOOM_FACTOR = 1.65
/** 滚轮每格的缩放倍率。 */
const WHEEL_ZOOM_STEP = 1.15

const UNOWNED_COLOR = toColorNumber(UNOWNED_SITE_COLOR)
const SITE_STROKE_COLOR = 0xf2e4c2
/** 玩家所辖战略点在圆外多出一圈光晕，用以强调。 */
const PLAYER_HALO_RADIUS = 6
/** 州陆填充：暖色，与冷色海面在色相和明度上都拉开，海岸线才立得住。 */
const PROVINCE_FILL_COLOR = 0x5a4930
/**
 * 塞外陆地底衬：介于冷色海面与暖色州陆之间的中性橄榄。
 * 海是深青冷的，州陆是暖棕的，此处取中性偏暖的灰橄榄，明度居中，
 * 既不与海混淆，也不与州陆抢眼。
 */
const LAND_FILL_COLOR = 0x33322a
const PROVINCE_STROKE_COLOR = 0x8f7550
/**
 * 河流：冷色海面同一色系里提亮一档的钢蓝，压在暖棕州陆上读作水，
 * 与暖色的州界、邻接连边都不撞色。单色、细线，不与战略点抢注意力。
 */
const RIVER_COLOR = 0x4f7f9e
/**
 * 线宽为世界单位，随缩放一并放大，因此须按最不利的开局缩放来定。
 * 开局缩放在 0.56–0.97 之间，一两个世界像素落到屏幕上不足一像素，
 * 抗锯齿一糊便断成零星亮点；取 3 个世界像素，最不利时仍有约 1.7 屏幕像素，
 * 足以成一条连续可辨的线。
 */
const RIVER_WIDTH = 3
const RIVER_ALPHA = 0.95
const SITE_LABEL_COLOR = '#f2e4c2'
const PROVINCE_LABEL_COLOR = '#a8906a'
/** 邻接连边平时轻描淡写，不压过战略点本身。 */
const EDGE_COLOR = 0xd9c39a
const EDGE_ALPHA = 0.3
/** 悬停时，该战略点、其邻域与相连的边统一用这个强调色。 */
const HIGHLIGHT_COLOR = 0xf6ecd4
const LABEL_FONT = '"Noto Serif SC", "Songti SC", "SimSun", serif'

function toColorNumber(hexColor: string): number {
  return Number.parseInt(hexColor.replace('#', ''), 16)
}

/**
 * 按战略点类型换形制：城市为圆、关隘为菱形、野地为淡底方框。
 * 颜色仍按归属，形制只表达类型。
 */
function drawSiteMarker(
  graphics: Phaser.GameObjects.Graphics,
  type: SiteType,
  region: SiteRegion,
  color: number,
  isPlayerSite: boolean,
): void {
  const strokeWidth = isPlayerSite ? 2.5 : 1.5
  const strokeAlpha = isPlayerSite ? 0.95 : 0.45

  if (type === 'pass') {
    const half = region.radius * 1.15
    const corners = [
      new Phaser.Math.Vector2(region.x, region.y - half),
      new Phaser.Math.Vector2(region.x + half, region.y),
      new Phaser.Math.Vector2(region.x, region.y + half),
      new Phaser.Math.Vector2(region.x - half, region.y),
    ]
    graphics.fillStyle(color, 1)
    graphics.fillPoints(corners, true)
    graphics.lineStyle(strokeWidth, SITE_STROKE_COLOR, strokeAlpha)
    graphics.strokePoints(corners, true)
    return
  }

  if (type === 'field') {
    const half = region.radius * 0.85
    // 野地不是聚落：底色压淡，靠描边保持归属色可辨。
    graphics.fillStyle(color, 0.35)
    graphics.fillRect(region.x - half, region.y - half, half * 2, half * 2)
    graphics.lineStyle(strokeWidth, color, 1)
    graphics.strokeRect(region.x - half, region.y - half, half * 2, half * 2)
    return
  }

  graphics.fillStyle(color, 1)
  graphics.fillCircle(region.x, region.y, region.radius)
  graphics.lineStyle(strokeWidth, SITE_STROKE_COLOR, strokeAlpha)
  graphics.strokeCircle(region.x, region.y, region.radius)
}

/** 天下地图：先铺州轮廓与河流，再画邻接连边与战略点，悬停时高亮邻域。 */
export class MapScene extends Phaser.Scene {
  private readonly drawn: Phaser.GameObjects.GameObject[] = []
  private limits: ZoomLimits | null = null
  /** 玩家是否自己动过视野。动过之后，窗口缩放不再重新对准开局视野。 */
  private userAdjusted = false
  private dragging = false
  private readonly dragFrom = { x: 0, y: 0 }
  private state: GameState | null = null
  private hoveredId: string | null = null
  private highlight: Phaser.GameObjects.Graphics | null = null

  constructor(
    private readonly source: MapStateSource,
    private readonly settings: SettingsSource,
  ) {
    super('Map')
  }

  create(): void {
    this.render(this.source.getState())
    this.source.subscribe((state) => this.render(state))
    // 设置变化只影响连线是否绘制，用当前对局状态重画即可。
    this.settings.subscribe(() => this.render(this.source.getState()))
    this.setupCamera()
  }

  /** 相机只做平移与缩放：拖动平移、滚轮缩放，边界固定为整幅地图。 */
  private setupCamera(): void {
    const camera = this.cameras.main
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.beginDrag(pointer))
    this.input.on('pointerup', () => this.endDrag())
    this.input.on('pointerupoutside', () => this.endDrag())
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => this.onPointerMove(pointer))
    this.input.on('gameout', () => this.setHovered(null))
    this.input.on(
      'wheel',
      (pointer: Phaser.Input.Pointer, _objects: unknown, _deltaX: number, deltaY: number) =>
        this.zoomAt(pointer, deltaY),
    )
    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.handleResize())

    this.focusInitialView()
  }

  /** 把视野对准玩家所在的战略点，缩放为整幅可见的若干倍，并夹进铺满视口的范围。 */
  private focusInitialView(): void {
    const camera = this.cameras.main
    const limits = this.limitsFor(camera.width, camera.height)
    if (!(limits.min > 0)) {
      return
    }
    this.limits = limits
    const fit = fitZoom(camera.width, camera.height, WORLD_WIDTH, WORLD_HEIGHT)
    const zoom = clampZoom(fit * INITIAL_ZOOM_FACTOR, limits)
    camera.setZoom(zoom)
    const [lon, lat] = SITE_COORDINATES[FOCUS_SITE]
    this.applyScroll(scrollForCenter(lon, lat, zoom, camera.width, camera.height))
  }

  /**
   * 窗口尺寸变化后重算缩放上下限。
   * 画布在创建之后还会被 Scale.RESIZE 撑到最终大小，若玩家尚未动过视野，
   * 就按最终尺寸重新对准；动过则只把当前视野夹回范围内，不打断玩家。
   */
  private handleResize(): void {
    if (!this.userAdjusted) {
      this.focusInitialView()
      return
    }

    const camera = this.cameras.main
    const limits = this.limitsFor(camera.width, camera.height)
    if (!(limits.min > 0)) {
      return
    }
    this.limits = limits
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    camera.setZoom(clampZoom(camera.zoom, limits))
    this.applyScroll({ x: camera.scrollX, y: camera.scrollY })
  }

  private limitsFor(viewWidth: number, viewHeight: number): ZoomLimits {
    return zoomLimits(coverZoom(viewWidth, viewHeight, WORLD_WIDTH, WORLD_HEIGHT))
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

  /** 拖动中不做悬停判定，免得平移时高亮乱跳。 */
  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (this.dragging) {
      this.moveDrag(pointer)
      return
    }
    this.setHovered(this.siteAtPointer(pointer))
  }

  /** 指针下方的战略点，取落在半径内且最近的一个。 */
  private siteAtPointer(pointer: Phaser.Input.Pointer): string | null {
    const state = this.state
    if (state === null) {
      return null
    }

    const world = this.cameras.main.getWorldPoint(pointer.x, pointer.y)
    // 命中范围按屏幕像素给一点余量，缩小时不至于难以点中。
    const tolerance = 4 / this.cameras.main.zoom

    let nearest: string | null = null
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const site of state.geography.sites) {
      const region = siteRegion(site.id)
      if (region === null) {
        continue
      }

      const distance = Phaser.Math.Distance.Between(world.x, world.y, region.x, region.y)
      if (distance <= region.radius + tolerance && distance < nearestDistance) {
        nearestDistance = distance
        nearest = site.id
      }
    }

    return nearest
  }

  private setHovered(siteId: string | null): void {
    if (this.hoveredId === siteId) {
      return
    }
    this.hoveredId = siteId
    this.drawHighlight()
  }

  /** 屏幕位移除以缩放得到世界位移，反向施加到滚动量上。 */
  private moveDrag(pointer: Phaser.Input.Pointer): void {
    if (!this.dragging) {
      return
    }
    this.userAdjusted = true
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
    this.userAdjusted = true
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

    this.state = state
    this.highlight = null

    this.drawLand()
    this.drawProvinces()
    this.drawRivers()
    this.drawNeighborEdges(state, this.settings.get().showStrategicLinks)

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
      const color = ownerColor ?? UNOWNED_COLOR
      const isPlayerSite = site.owner !== null && site.owner === state.playerFaction

      if (isPlayerSite) {
        graphics.fillStyle(color, 0.4)
        graphics.fillCircle(region.x, region.y, region.radius + PLAYER_HALO_RADIUS)
      }

      drawSiteMarker(graphics, site.type, region, color, isPlayerSite)

      // 光晕本身与州陆色差有限，再压一道亮边，玩家据点才真的跳出来。
      if (isPlayerSite) {
        graphics.lineStyle(1.5, SITE_STROKE_COLOR, 0.85)
        graphics.strokeCircle(region.x, region.y, region.radius + PLAYER_HALO_RADIUS)
      }

      const label = this.add
        .text(region.x, region.y + region.radius + SITE_LABEL_OFFSET, site.name, {
          fontFamily: LABEL_FONT,
          fontSize: '13px',
          color: SITE_LABEL_COLOR,
        })
        .setOrigin(0.5, 0)
      this.drawn.push(label)
    }

    const highlight = this.add.graphics()
    this.drawn.push(highlight)
    this.highlight = highlight
    this.drawHighlight()
  }

  /** 相邻战略点之间的连边，每条只画一次，压在战略点下方；未开启连线时不绘制。 */
  private drawNeighborEdges(state: GameState, showLinks: boolean): void {
    if (!showLinks) {
      return
    }

    const graphics = this.add.graphics()
    this.drawn.push(graphics)
    graphics.lineStyle(1.5, EDGE_COLOR, EDGE_ALPHA)

    const drawnEdges = new Set<string>()
    for (const site of state.geography.sites) {
      const from = siteRegion(site.id)
      if (from === null) {
        continue
      }

      for (const neighborId of site.neighbors) {
        const key = site.id < neighborId ? `${site.id}|${neighborId}` : `${neighborId}|${site.id}`
        if (drawnEdges.has(key)) {
          continue
        }
        drawnEdges.add(key)

        const to = siteRegion(neighborId)
        if (to === null) {
          continue
        }

        graphics.lineBetween(from.x, from.y, to.x, to.y)
      }
    }
  }

  /**
   * 悬停高亮画在独立图层上，只在悬停目标变化时重画，
   * 免得每次移动指针都重建整幅地图。
   */
  private drawHighlight(): void {
    const graphics = this.highlight
    const state = this.state
    if (graphics === null || state === null) {
      return
    }

    graphics.clear()

    const hoveredId = this.hoveredId
    if (hoveredId === null) {
      return
    }

    const focus = siteRegion(hoveredId)
    if (focus === null) {
      return
    }

    const site = state.geography.sites.find((entry) => entry.id === hoveredId)
    const neighborIds = site === undefined ? [] : site.neighbors
    const neighborRegions = neighborIds
      .map((neighborId) => siteRegion(neighborId))
      .filter((region): region is SiteRegion => region !== null)

    graphics.lineStyle(2.5, HIGHLIGHT_COLOR, 0.95)
    for (const neighbor of neighborRegions) {
      graphics.lineBetween(focus.x, focus.y, neighbor.x, neighbor.y)
    }

    graphics.lineStyle(2.5, HIGHLIGHT_COLOR, 0.9)
    for (const neighbor of neighborRegions) {
      graphics.strokeCircle(neighbor.x, neighbor.y, neighbor.radius + 3)
    }

    graphics.lineStyle(3, HIGHLIGHT_COLOR, 1)
    graphics.strokeCircle(focus.x, focus.y, focus.radius + 4)
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
      graphics.fillStyle(PROVINCE_FILL_COLOR, 1)
      for (const polygon of shape.polygons) {
        const points = polygon.map((point) => new Phaser.Math.Vector2(point.x, point.y))
        graphics.fillPoints(points, true)
      }
    }

    for (const shape of shapes) {
      graphics.lineStyle(1, PROVINCE_STROKE_COLOR, 0.9)
      for (const polygon of shape.polygons) {
        const points = polygon.map((point) => new Phaser.Math.Vector2(point.x, point.y))
        graphics.strokePoints(points, true)
      }
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

  /** 长江与黄河的中心线，压在州陆之上、邻接连边与战略点之下，均为开放折线。 */
  private drawRivers(): void {
    const graphics = this.add.graphics()
    this.drawn.push(graphics)
    graphics.lineStyle(RIVER_WIDTH, RIVER_COLOR, RIVER_ALPHA)

    for (const line of riverShapes()) {
      const points = line.map((point) => new Phaser.Math.Vector2(point.x, point.y))
      graphics.strokePoints(points, false)
    }
  }
}
