import Phaser from 'phaser'
import type { SettingsSource } from '../../app/settingsStore'
import type { SelectionSource } from '../../app/selectionStore'
import type { GameState, Site, SiteId, SiteType } from '../../core/model'
import { SITE_COORDINATES } from '../mapData'
import {
  landShapes,
  provinceShapes,
  riverShapes,
  SEA_COLOR,
  SITE_RADIUS,
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
const FOCUS_SITE: SiteId = 'gongan'
/**
 * 开局缩放相对「整幅可见」的倍数。
 * 开局视野以整幅可见为基准，再夹进铺满视口的缩放范围。
 * 2.6 相当于从整幅可见连续放大六七格滚轮（1.15^6 约 2.31，1.15^7 约 2.66），
 * 让荆州一带的城池与邻接关系占满视野，而不是一上来就读整幅天下。
 */
const INITIAL_ZOOM_FACTOR = 2.6
/** 滚轮每格的缩放倍率。 */
const WHEEL_ZOOM_STEP = 1.15

const UNOWNED_COLOR = toColorNumber(UNOWNED_SITE_COLOR)
/** 印记内的图形与细缘统一用暖白，衬在势力色上仍读得清。 */
const MARKER_GLYPH_COLOR = 0xf2e4c2
/** 图形的错位暗色副本：不描边，只作衬底，让暖白图形从深色势力色里浮起来。 */
const MARKER_GLYPH_SHADE = 0x14100c
const MARKER_SHADOW_COLOR = 0x000000
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
 * 河流取海面同色：全图水色归一，河口与海面无缝相接；明度低于州陆，
 * 压在暖棕地面上读作下沉的深色水道，不再以亮度抢注意力。
 * 压在塞外底衬上的上中游随之很淡，那几段不在视线重心。
 */
const RIVER_COLOR = toColorNumber(SEA_COLOR)
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
/**
 * 名称文字纹理的字号。取比屏幕目标字号大一档，缩放时只做缩小，
 * 字面不会因放大而发虚；屏幕上的实际字号由 LABEL_SCREEN_SIZE 决定。
 */
const LABEL_FONT_SIZE = 18
/** 名称在屏幕上的目标字号：缩放远近都由这一档决定。 */
const LABEL_SCREEN_SIZE = 14
/** 名称在屏幕上的最小字号：缩得再远也不低于此，免得字糊成一团。 */
const LABEL_MIN_SCREEN_SIZE = 11
/** 名称与印记之间的留白，按屏幕像素计。 */
const LABEL_GAP = 3
/** 八向都放不下时逐档外移（屏幕像素）找位；宁可略远，也不把地名隐去。 */
const LABEL_FALLBACK_STEPS = [6, 12, 18, 24]
/** 名称落位的先后：大城先占地，野地最后才轮到。 */
const SITE_LABEL_PRIORITY: Record<SiteType, number> = {
  metropolis: 5,
  city: 4,
  pass: 3,
  town: 2,
  field: 1,
}
/** 邻接连边平时轻描淡写，不压过战略点本身。 */
const EDGE_COLOR = 0xd9c39a
const EDGE_ALPHA = 0.3
/** 悬停时，该战略点、其邻域与相连的边统一用这个强调色。 */
const HIGHLIGHT_COLOR = 0xf6ecd4
/** 指针移动超过此屏幕像素即视为拖动，不当作点击选中。 */
const SELECT_DRAG_THRESHOLD = 4
const LABEL_FONT = '"Noto Serif SC", "Songti SC", "SimSun", serif'

function toColorNumber(hexColor: string): number {
  return Number.parseInt(hexColor.replace('#', ''), 16)
}

/**
 * 战略点印记：形制表类型，颜色表归属。
 * 每个印记由投影、色盘、细缘与暖白图形四层叠成——图形压在任何势力色上都读得清，
 * 类型一眼可辨，归属仍靠最外一圈颜色说话。
 */
const MARKER_EXTENT: Record<SiteType, number> = {
  metropolis: 13,
  city: 11,
  town: 9.5,
  pass: 12.5,
  field: 9.5,
}

/** 名称框是否压到印记：圆与菱形按圆算，野地的方框按方形算。 */
function hitsMarker(
  rect: Phaser.Geom.Rectangle,
  marker: { x: number; y: number; half: number; square: boolean },
): boolean {
  if (marker.square) {
    return !(
      rect.right <= marker.x - marker.half ||
      rect.left >= marker.x + marker.half ||
      rect.bottom <= marker.y - marker.half ||
      rect.top >= marker.y + marker.half
    )
  }

  const nearestX = Phaser.Math.Clamp(marker.x, rect.left, rect.right)
  const nearestY = Phaser.Math.Clamp(marker.y, rect.top, rect.bottom)
  const dx = marker.x - nearestX
  const dy = marker.y - nearestY
  return dx * dx + dy * dy < marker.half * marker.half
}

/** 菱形印记的四个角。 */
function diamondCorners(x: number, y: number, half: number): Phaser.Math.Vector2[] {
  return [
    new Phaser.Math.Vector2(x, y - half),
    new Phaser.Math.Vector2(x + half, y),
    new Phaser.Math.Vector2(x, y + half),
    new Phaser.Math.Vector2(x - half, y),
  ]
}

/** 按类型铺一层形制：圆形、菱形或圆角方框。 */
function paintSilhouette(
  graphics: Phaser.GameObjects.Graphics,
  type: SiteType,
  x: number,
  y: number,
  extent: number,
  color: number,
  alpha: number,
): void {
  graphics.fillStyle(color, alpha)

  if (type === 'pass') {
    graphics.fillPoints(diamondCorners(x, y, extent), true)
    return
  }

  if (type === 'field') {
    const corner = extent * 0.32
    graphics.fillRoundedRect(x - extent, y - extent, extent * 2, extent * 2, corner)
    return
  }

  graphics.fillCircle(x, y, extent)
}

/** 沿同一形制描一道细缘。 */
function strokeSilhouette(
  graphics: Phaser.GameObjects.Graphics,
  type: SiteType,
  x: number,
  y: number,
  extent: number,
  color: number,
  alpha: number,
  width: number,
): void {
  graphics.lineStyle(width, color, alpha)

  if (type === 'pass') {
    graphics.strokePoints(diamondCorners(x, y, extent), true)
    return
  }

  if (type === 'field') {
    const corner = extent * 0.32
    graphics.strokeRoundedRect(x - extent, y - extent, extent * 2, extent * 2, corner)
    return
  }

  graphics.strokeCircle(x, y, extent)
}

/** 城垛：顶上一排垛口，下面一堵墙身。 */
function paintWall(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
  merlons: number,
): void {
  const top = y - height / 2
  const merlonHeight = height * 0.32
  const merlonWidth = width / (merlons * 2 - 1)

  // 墙身从垛口下缘起笔，与垛口留一点重叠，免得接缝透出底色。
  graphics.fillRect(x - width / 2, top + merlonHeight * 0.8, width, height * 0.72)
  for (let index = 0; index < merlons; index += 1) {
    graphics.fillRect(x - width / 2 + index * merlonWidth * 2, top, merlonWidth, merlonHeight)
  }
}

/** 小城：一坡屋顶压着一间屋身，屋顶略宽于屋身，出檐才看得出来。 */
function paintHouse(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  extent: number,
): void {
  const bodyWidth = extent * 0.82
  const bodyHeight = extent * 0.44
  const roofHeight = extent * 0.36
  const roofY = y - extent * 0.14
  const eave = extent * 0.1

  graphics.fillTriangle(
    x - bodyWidth / 2 - eave,
    roofY,
    x,
    roofY - roofHeight,
    x + bodyWidth / 2 + eave,
    roofY,
  )
  graphics.fillRect(x - bodyWidth / 2, roofY, bodyWidth, bodyHeight)
}

/** 关隘：两根粗门柱托起一道门楼，形如一座关门。 */
function paintGate(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  extent: number,
): void {
  const width = extent * 0.78
  const height = extent * 0.72
  const top = y - height / 2
  const beamHeight = height * 0.24
  const pillarWidth = width * 0.3

  graphics.fillRect(x - width / 2 - extent * 0.06, top, width + extent * 0.12, beamHeight)
  graphics.fillRect(x - width / 2, top, pillarWidth, height)
  graphics.fillRect(x + width / 2 - pillarWidth, top, pillarWidth, height)
}

/** 野地：两座山影，与聚落形制彻底分开。 */
function paintHills(
  graphics: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  extent: number,
): void {
  const base = y + extent * 0.44
  const width = extent * 0.8

  graphics.fillTriangle(
    x - width,
    base,
    x - width * 0.36,
    y - extent * 0.55,
    x + width * 0.16,
    base,
  )
  graphics.fillTriangle(
    x + width * 0.02,
    base,
    x + width * 0.36,
    y - extent * 0.16,
    x + width * 0.86,
    base,
  )
}

function paintGlyph(
  graphics: Phaser.GameObjects.Graphics,
  type: SiteType,
  x: number,
  y: number,
  extent: number,
  color: number,
  alpha: number,
): void {
  graphics.fillStyle(color, alpha)

  switch (type) {
    case 'metropolis':
      paintWall(graphics, x, y, extent * 1.06, extent * 0.8, 3)
      return
    case 'city':
      paintWall(graphics, x, y, extent * 0.94, extent * 0.78, 2)
      return
    case 'town':
      paintHouse(graphics, x, y, extent)
      return
    case 'pass':
      paintGate(graphics, x, y, extent)
      return
    case 'field':
      paintHills(graphics, x, y, extent)
  }
}

/** 城门用暗色挖空，墙身才有前后层次；城门洞在屏幕上只有一两个像素，故只留给都会。 */
function carveGlyph(
  graphics: Phaser.GameObjects.Graphics,
  type: SiteType,
  x: number,
  y: number,
  extent: number,
): void {
  if (type !== 'metropolis') {
    return
  }

  const width = extent * 1.06
  const height = extent * 0.8
  graphics.fillStyle(MARKER_GLYPH_SHADE, 1)
  graphics.fillRect(x - width * 0.1, y + height * 0.1, width * 0.2, height * 0.4)
}

function drawSiteMarker(
  graphics: Phaser.GameObjects.Graphics,
  type: SiteType,
  region: SiteRegion,
  color: number,
): void {
  const extent = MARKER_EXTENT[type]
  const { x, y } = region

  // 投影先落一层，印记才像压在地图上，而不是浮在贴图表面。
  paintSilhouette(graphics, type, x + 1, y + 1.8, extent, MARKER_SHADOW_COLOR, 0.38)

  // 都会在色盘外再罩一圈淡光，作为全图少数的重心。
  if (type === 'metropolis') {
    graphics.fillStyle(color, 0.14)
    graphics.fillCircle(x, y, extent + 5)
  }

  paintSilhouette(graphics, type, x, y, extent, color, type === 'field' ? 0.5 : 1)
  strokeSilhouette(graphics, type, x, y, extent, MARKER_GLYPH_COLOR, type === 'field' ? 0.6 : 0.45, 1.2)

  // 图形外先套一圈放大的暗色，等于给图形描边：金、橙一类浅势力色上也读得清。
  paintGlyph(graphics, type, x, y, extent * 1.18, MARKER_GLYPH_SHADE, 0.62)
  paintGlyph(graphics, type, x, y, extent, MARKER_GLYPH_COLOR, 1)
  carveGlyph(graphics, type, x, y, extent)
}

/** 天下地图：先铺州轮廓与河流，再画邻接连边与战略点，悬停时高亮邻域。 */
export class MapScene extends Phaser.Scene {
  private readonly drawn: Phaser.GameObjects.GameObject[] = []
  private limits: ZoomLimits | null = null
  /** 玩家是否自己动过视野。动过之后，窗口缩放不再重新对准开局视野。 */
  private userAdjusted = false
  private dragging = false
  /** 拖动是否超过阈值；不足则松手视为点击选中。 */
  private dragMoved = false
  private readonly dragFrom = { x: 0, y: 0 }
  private readonly downAt = { x: 0, y: 0 }
  private state: GameState | null = null
  private hoveredId: string | null = null
  private highlight: Phaser.GameObjects.Graphics | null = null
  /** 名称与它的战略点；落位与显隐在缩放变化时重排。 */
  private labels: { site: Site; text: Phaser.GameObjects.Text }[] = []
  /** 上次排布名称时的缩放，用于只在缩放变化时重排。 */
  private labelZoom = 0

  constructor(
    private readonly source: MapStateSource,
    private readonly settings: SettingsSource,
    private readonly selection: SelectionSource,
  ) {
    super('Map')
  }

  create(): void {
    this.render(this.source.getState())
    this.source.subscribe((state) => this.render(state))
    // 设置变化只影响连线是否绘制，用当前对局状态重画即可。
    this.settings.subscribe(() => this.render(this.source.getState()))
    // 选中变化只需重画高亮层；选中的名字同时提到最前，免得被邻名挤掉。
    this.selection.subscribe(() => {
      this.drawHighlight()
      this.layoutLabels()
    })
    this.setupCamera()
  }

  /** 缩放变化时重排名称，平时不动。 */
  override update(): void {
    const zoom = this.cameras.main.zoom
    if (Math.abs(zoom - this.labelZoom) > 0.001) {
      this.layoutLabels()
    }
  }

  /** 相机只做平移与缩放：拖动平移、滚轮缩放，边界固定为整幅地图。 */
  private setupCamera(): void {
    const camera = this.cameras.main
    camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT)

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.beginDrag(pointer))
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => this.endDrag(pointer))
    this.input.on('pointerupoutside', () => this.endDrag(null))
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
    this.dragMoved = false
    this.dragFrom.x = pointer.x
    this.dragFrom.y = pointer.y
    this.downAt.x = pointer.x
    this.downAt.y = pointer.y
  }

  /** 松手时若指针几乎没动，视为点击：选中指针下的战略点，点空则取消选中。 */
  private endDrag(pointer: Phaser.Input.Pointer | null): void {
    if (!this.dragging) {
      return
    }
    this.dragging = false

    if (pointer === null || this.dragMoved) {
      return
    }

    this.selection.select(this.siteAtPointer(pointer))
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
    if (
      Phaser.Math.Distance.Between(pointer.x, pointer.y, this.downAt.x, this.downAt.y) >
      SELECT_DRAG_THRESHOLD
    ) {
      this.dragMoved = true
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
    this.labels = []

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

      drawSiteMarker(graphics, site.type, region, color)

      const label = this.add
        .text(region.x, region.y + MARKER_EXTENT[site.type] + LABEL_GAP, site.name, {
          fontFamily: LABEL_FONT,
          fontSize: `${LABEL_FONT_SIZE}px`,
          color: SITE_LABEL_COLOR,
          // 压在州陆与印记上时，暗色描边与轻投影把字从底图里托出来。
          stroke: '#14100c',
          strokeThickness: 2,
          shadow: { offsetX: 0, offsetY: 1, color: '#000000', blur: 3, fill: true },
        })
        .setOrigin(0.5, 0.5)
        .setVisible(false)
      this.drawn.push(label)
      this.labels.push({ site, text: label })
    }

    const highlight = this.add.graphics()
    this.drawn.push(highlight)
    this.highlight = highlight
    this.drawHighlight()
    this.layoutLabels()
  }

  /**
   * 名称层：字号按缩放补偿，屏幕上的字大体恒定，缩得远时随地图略缩并保下限。
   * 落位按八向逐个试：正方向贴着图标边缘，斜向沿对角线贴边，四角因此不会甩出老远。
   * 被邻点围得越紧的名字越先落位，免得最后无处可去；实在放不下时向外挪档，仍不隐去名称。
   * 大城先占地，野地最后才轮到；选中的名字提到最前。
   */
  private layoutLabels(): void {
    const zoom = this.cameras.main.zoom
    const state = this.state
    if (!(zoom > 0) || state === null || this.labels.length === 0) {
      return
    }
    this.labelZoom = zoom

    // 放大时补偿到目标字号；缩小到一定档位后不再放大，让名称随地图一起缩小，
    // 否则名称比图标还大，看起来与据点脱节。缩到最小仍保一个字号下限，免得糊成一团。
    const targetScale = LABEL_SCREEN_SIZE / (LABEL_FONT_SIZE * zoom)
    const minScale = LABEL_MIN_SCREEN_SIZE / (LABEL_FONT_SIZE * zoom)
    const scale = Math.max(Math.min(targetScale, 1), minScale)
    const selectedId = this.selection.get()
    // 名称与图标之间的留白随字号一起缩放；占位再收一点，贴边的候选才不会被判成相撞。
    const gap = LABEL_GAP * scale
    const markerPad = gap * 0.85

    interface MarkerBox {
      id: SiteId
      x: number
      y: number
      half: number
      square: boolean
    }

    // 印记的占位：圆与菱形按圆算，野地的方框按方形算，斜向才贴得准。
    const markers: MarkerBox[] = []
    for (const site of state.geography.sites) {
      const region = siteRegion(site.id)
      if (region === null) {
        continue
      }
      markers.push({
        id: site.id,
        x: region.x,
        y: region.y,
        half: MARKER_EXTENT[site.type] + markerPad,
        square: site.type === 'field',
      })
    }

    interface LabelSlot {
      x: number
      y: number
      rect: Phaser.Geom.Rectangle
    }

    const slotsAround = (
      region: SiteRegion,
      type: SiteType,
      width: number,
      height: number,
      extra: number,
    ): LabelSlot[] => {
      const edge = MARKER_EXTENT[type] + gap + extra
      // 圆与菱形沿对角线贴边最近；野地的方框要先越过方角，斜向与正向同距。
      const diagonal = type === 'field' ? edge : edge / Math.SQRT2
      return [
        { x: region.x, y: region.y + edge + height / 2 },
        { x: region.x, y: region.y - edge - height / 2 },
        { x: region.x + edge + width / 2, y: region.y },
        { x: region.x - edge - width / 2, y: region.y },
        { x: region.x + diagonal + width / 2, y: region.y + diagonal + height / 2 },
        { x: region.x - diagonal - width / 2, y: region.y + diagonal + height / 2 },
        { x: region.x + diagonal + width / 2, y: region.y - diagonal - height / 2 },
        { x: region.x - diagonal - width / 2, y: region.y - diagonal - height / 2 },
      ].map((position) => ({
        ...position,
        rect: new Phaser.Geom.Rectangle(
          position.x - width / 2,
          position.y - height / 2,
          width,
          height,
        ),
      }))
    }

    const priorityOf = (site: Site): number =>
      SITE_LABEL_PRIORITY[site.type] + (site.id === selectedId ? 10 : 0)

    // 先量好每块名称、数出四周还剩几个空位；空位少的先落位。
    interface PreparedLabel {
      entry: { site: Site; text: Phaser.GameObjects.Text }
      region: SiteRegion
      width: number
      height: number
      freeSlots: number
    }

    const prepared: PreparedLabel[] = []
    for (const entry of this.labels) {
      const region = siteRegion(entry.site.id)
      if (region === null) {
        continue
      }

      entry.text.setScale(scale)
      const width = entry.text.width * scale
      const height = entry.text.height * scale
      const freeSlots = slotsAround(region, entry.site.type, width, height, 0).filter(
        (slot) => !markers.some((marker) => hitsMarker(slot.rect, marker)),
      ).length
      prepared.push({ entry, region, width, height, freeSlots })
    }

    prepared.sort((a, b) => {
      const priority = priorityOf(b.entry.site) - priorityOf(a.entry.site)
      return priority !== 0 ? priority : a.freeSlots - b.freeSlots
    })

    const placed: Phaser.Geom.Rectangle[] = []

    for (const item of prepared) {
      const { entry, region, width, height } = item
      const candidates = [
        ...slotsAround(region, entry.site.type, width, height, 0),
        ...LABEL_FALLBACK_STEPS.flatMap((step) =>
          slotsAround(region, entry.site.type, width, height, step / zoom),
        ),
      ]

      // 压到印记比压到别的名称更碍事；离邻点比离据点还近的名字容易被认错，则另加重一分。
      let chosen: LabelSlot | undefined
      let chosenScore = Number.POSITIVE_INFINITY
      for (const candidate of candidates) {
        let score = 0
        let nearestOther = Number.POSITIVE_INFINITY

        for (const marker of markers) {
          if (hitsMarker(candidate.rect, marker)) {
            score += 3
          }
          if (marker.id === entry.site.id) {
            continue
          }
          nearestOther = Math.min(
            nearestOther,
            Math.hypot(candidate.x - marker.x, candidate.y - marker.y),
          )
        }

        if (nearestOther < Math.hypot(candidate.x - region.x, candidate.y - region.y)) {
          score += 2
        }

        for (const other of placed) {
          // 名称之间只剩这一点空间时，按重叠面积计入代价：宁可擦边，也不要整块压住。
          const overlapWidth =
            Math.min(candidate.rect.right, other.right) - Math.max(candidate.rect.left, other.left)
          const overlapHeight =
            Math.min(candidate.rect.bottom, other.bottom) - Math.max(candidate.rect.top, other.top)
          if (overlapWidth > 0 && overlapHeight > 0) {
            score += (overlapWidth * overlapHeight * 2) / (width * height)
          }
        }

        if (score === 0) {
          chosen = candidate
          break
        }
        if (score < chosenScore) {
          chosen = candidate
          chosenScore = score
        }
      }

      if (chosen === undefined) {
        continue
      }

      entry.text.setPosition(chosen.x, chosen.y).setVisible(true)
      placed.push(chosen.rect)
    }
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

    const siteOf = (siteId: SiteId) => state.geography.sites.find((entry) => entry.id === siteId)

    // 高亮环沿印记自身的形制外扩：圆对圆、菱形对菱形、方框对方框，不留一圈空洞。
    const outlineSite = (siteId: SiteId, grow: number, alpha: number, width: number): void => {
      const region = siteRegion(siteId)
      if (region === null) {
        return
      }
      const site = siteOf(siteId)
      const type = site?.type ?? 'city'
      const extent = (site === undefined ? SITE_RADIUS : MARKER_EXTENT[site.type]) + grow
      strokeSilhouette(graphics, type, region.x, region.y, extent, HIGHLIGHT_COLOR, alpha, width)
    }

    // 选中的战略点在外围留一圈常驻环，与悬停高亮区分开（环更外、更细）。
    const selectedId = this.selection.get()
    if (selectedId !== null) {
      outlineSite(selectedId, 6, 1, 2)
    }

    const hoveredId = this.hoveredId
    if (hoveredId === null) {
      return
    }

    const focus = siteRegion(hoveredId)
    if (focus === null) {
      return
    }

    const site = siteOf(hoveredId)
    const neighborIds = site === undefined ? [] : site.neighbors
    const neighborRegions = neighborIds
      .map((neighborId) => ({ id: neighborId, region: siteRegion(neighborId) }))
      .filter((entry): entry is { id: SiteId; region: SiteRegion } => entry.region !== null)

    graphics.lineStyle(2.5, HIGHLIGHT_COLOR, 0.95)
    for (const neighbor of neighborRegions) {
      graphics.lineBetween(focus.x, focus.y, neighbor.region.x, neighbor.region.y)
    }

    for (const neighbor of neighborRegions) {
      outlineSite(neighbor.id, 3, 0.9, 2.5)
    }

    outlineSite(hoveredId, 4, 1, 3)
  }

  /** 塞外陆地底衬，先于州轮廓绘制，只做同色填充，海岸线由填色边界呈现。 */
  private drawLand(): void {
    const graphics = this.add.graphics()
    this.drawn.push(graphics)
    const rings = landShapes()

    // 无主陆地只做同色填充，不描边：描边会在与大陆相接处留下一条分界线。
    // 海岸线由填充边界本身呈现。
    graphics.fillStyle(LAND_FILL_COLOR, 1)
    for (const ring of rings) {
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

    // 只描与邻州相接的州界；海岸与无主地一侧不描边，海陆由填色直接分野。
    graphics.lineStyle(1, PROVINCE_STROKE_COLOR, 0.9)
    for (const shape of shapes) {
      for (let index = 0; index < shape.polygons.length; index += 1) {
        const polygon = shape.polygons[index]
        const borderEdges = shape.borderEdges[index]
        for (let i = 0; i < polygon.length; i += 1) {
          if (!borderEdges[i]) {
            continue
          }
          const from = polygon[i]
          const to = polygon[(i + 1) % polygon.length]
          graphics.lineBetween(from.x, from.y, to.x, to.y)
        }
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
